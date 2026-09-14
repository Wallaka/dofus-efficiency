import { useEffect, useMemo, useRef, useState } from "react";
import type { Item } from "../types";
import { searchItems } from "../data/dofusApi";
import { parseUtterances } from "../lib/voiceParse";
import { formatKamas } from "../lib/format";

/**
 * Voice → JSON experiment page.
 *
 * The bet (see the brainstorm): typing/OCR'ing HDV prices is slow, but the
 * vocabulary is a small *closed* set, so we can say "bois de frêne 147", let the
 * browser transcribe it, parse out {name, price}, and resolve the name against
 * DofusDB — then eyeball how accurate the whole chain is before investing more.
 *
 * This page is deliberately just capture → parse → resolve → JSON. Writing the
 * validated result into the price store is the *next* iteration.
 */

type Resolve =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "empty" }
  | { status: "ok"; chosen: Item; candidates: Item[] };

interface Row {
  id: string;
  /** The full transcript as recognised. */
  raw: string;
  /** Parsed item name (editable). */
  name: string;
  /** Parsed unit price in kamas (editable), or null. */
  price: number | null;
  resolve: Resolve;
}

/** Accent/case-fold for comparing a spoken name to a matched item name. */
function fold(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/** A rough label for how well the spoken name matched the chosen item. */
function matchQuality(spoken: string, matched: string): "exact" | "proche" | "flou" {
  const a = fold(spoken);
  const b = fold(matched);
  if (a === b) return "exact";
  if (b.startsWith(a) || a.startsWith(b) || b.includes(a)) return "proche";
  return "flou";
}

let rowSeq = 0;

export function VoicePage() {
  const supported =
    typeof window !== "undefined" &&
    !!(window.SpeechRecognition || window.webkitSpeechRecognition);

  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const listeningRef = useRef(false);
  // AbortControllers per row, so re-resolving cancels the previous fetch.
  const resolveAborts = useRef(new Map<string, AbortController>());

  // --- Item resolution -----------------------------------------------------
  function resolveRow(id: string, name: string) {
    resolveAborts.current.get(id)?.abort();
    const query = name.trim();
    if (query.length < 2) {
      setRow(id, (r) => ({ ...r, resolve: { status: "empty" } }));
      return;
    }
    const controller = new AbortController();
    resolveAborts.current.set(id, controller);
    setRow(id, (r) => ({ ...r, resolve: { status: "loading" } }));
    searchItems(query, controller.signal)
      .then((items) => {
        if (controller.signal.aborted) return;
        if (items.length === 0) {
          setRow(id, (r) => ({ ...r, resolve: { status: "empty" } }));
        } else {
          setRow(id, (r) => ({
            ...r,
            resolve: { status: "ok", chosen: items[0], candidates: items },
          }));
        }
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setRow(id, (r) => ({
          ...r,
          resolve: {
            status: "error",
            message: err instanceof Error ? err.message : String(err),
          },
        }));
      });
  }

  function setRow(id: string, update: (r: Row) => Row) {
    setRows((prev) => prev.map((r) => (r.id === id ? update(r) : r)));
  }

  function addUtterance(raw: string) {
    // One spoken phrase can carry several items ("bois 147 chanvre 12"); the
    // price delimits them. Each becomes its own row.
    const parsed = parseUtterances(raw);
    if (parsed.length === 0) return;
    const many = parsed.length > 1;
    const newRows: Row[] = parsed.map((p, i) => ({
      id: `row-${++rowSeq}-${Date.now()}-${i}`,
      // Show the slice of the phrase this row came from when several share one
      // transcript, so an editable row still reads sensibly.
      raw: many ? `${p.name}${p.price != null ? ` ${p.price}` : ""}` : raw,
      name: p.name,
      price: p.price,
      resolve: { status: "loading" },
    }));
    // Newest phrase on top, items within it kept in spoken order.
    setRows((prev) => [...newRows, ...prev]);
    newRows.forEach((row) => resolveRow(row.id, row.name));
  }

  // --- Speech recognition --------------------------------------------------
  function start() {
    if (!supported || listeningRef.current) return;
    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition!;
    const rec = new Ctor();
    rec.lang = "fr-FR";
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    rec.onresult = (event: SpeechRecognitionEvent) => {
      let interimText = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const transcript = result[0].transcript.trim();
        if (result.isFinal) {
          if (transcript) addUtterance(transcript);
        } else {
          interimText += transcript;
        }
      }
      setInterim(interimText);
    };
    rec.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        setError("Micro refusé — autorise le micro pour ce site puis réessaie.");
        stop();
      } else if (event.error !== "no-speech" && event.error !== "aborted") {
        setError(`Erreur reconnaissance : ${event.error}`);
      }
    };
    rec.onend = () => {
      setInterim("");
      // Web Speech stops on its own after a pause — restart while we want to
      // keep listening.
      if (listeningRef.current) {
        try {
          rec.start();
        } catch {
          /* already starting — ignore */
        }
      } else {
        setListening(false);
      }
    };

    recognitionRef.current = rec;
    listeningRef.current = true;
    setError(null);
    setListening(true);
    try {
      rec.start();
    } catch {
      /* start() throws if called twice in a row — ignore */
    }
  }

  function stop() {
    listeningRef.current = false;
    setListening(false);
    setInterim("");
    recognitionRef.current?.stop();
  }

  // Clean up the recogniser on unmount.
  useEffect(() => {
    return () => {
      listeningRef.current = false;
      recognitionRef.current?.abort();
      resolveAborts.current.forEach((c) => c.abort());
    };
  }, []);

  // --- Row editing ---------------------------------------------------------
  function editName(id: string, name: string) {
    setRow(id, (r) => ({ ...r, name }));
  }
  function commitName(id: string, name: string) {
    resolveRow(id, name);
  }
  function editPrice(id: string, value: string) {
    const n = value.trim() === "" ? null : Math.round(Number(value));
    setRow(id, (r) => ({ ...r, price: Number.isFinite(n as number) ? n : r.price }));
  }
  function chooseCandidate(id: string, item: Item) {
    setRow(id, (r) =>
      r.resolve.status === "ok"
        ? { ...r, resolve: { ...r.resolve, chosen: item } }
        : r,
    );
  }
  function removeRow(id: string) {
    resolveAborts.current.get(id)?.abort();
    resolveAborts.current.delete(id);
    setRows((prev) => prev.filter((r) => r.id !== id));
  }
  function clearAll() {
    resolveAborts.current.forEach((c) => c.abort());
    resolveAborts.current.clear();
    setRows([]);
  }

  // --- JSON output ---------------------------------------------------------
  const json = useMemo(() => {
    const out = rows.map((r) => ({
      spoken: r.raw,
      name: r.name,
      price: r.price,
      itemId: r.resolve.status === "ok" ? r.resolve.chosen.id : null,
      matched: r.resolve.status === "ok" ? r.resolve.chosen.name : null,
    }));
    return JSON.stringify(out, null, 2);
  }, [rows]);

  const [copied, setCopied] = useState(false);
  function copyJson() {
    navigator.clipboard?.writeText(json).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    });
  }

  // --- Render --------------------------------------------------------------
  if (!supported) {
    return (
      <section className="panel voice-page">
        <h2>Saisie vocale</h2>
        <p className="hint">
          La reconnaissance vocale du navigateur n'est pas disponible ici.
          Utilise <strong>Chrome</strong> ou <strong>Edge</strong> sur ordinateur.
        </p>
      </section>
    );
  }

  return (
    <section className="panel voice-page">
      <h2>Saisie vocale → JSON</h2>
      <p className="hint">
        Expérimentation. Enchaîne plusieurs objets d'une traite —
        «&nbsp;<em>bois de frêne 147, chanvre 12, ortie 5</em>&nbsp;» : chaque
        <strong> prix unitaire</strong> sépare un objet. L'app transcrit, extrait
        nom + prix, et cherche l'objet sur DofusDB. But du jour :
        <strong> mesurer la précision</strong> avant d'aller plus loin.
      </p>

      <div className="voice-controls">
        <button
          className={listening ? "voice-mic listening" : "voice-mic"}
          onClick={listening ? stop : start}
        >
          {listening ? "⏹ Arrêter" : "🎙 Parler"}
        </button>
        <span className="voice-status">
          {listening ? (
            <>
              <span className="voice-dot" /> À l'écoute…
              {interim && <em className="voice-interim"> {interim}</em>}
            </>
          ) : (
            "Micro coupé"
          )}
        </span>
        {rows.length > 0 && (
          <button className="ghost" onClick={clearAll}>
            Tout effacer
          </button>
        )}
      </div>

      {error && <p className="voice-error">{error}</p>}

      <div className="voice-layout">
        <div className="voice-rows">
          {rows.length === 0 && (
            <p className="hint">Rien pour l'instant — appuie sur «&nbsp;Parler&nbsp;».</p>
          )}
          {rows.map((r) => (
            <div key={r.id} className="voice-row">
              <div className="voice-raw" title="Transcription brute">
                «&nbsp;{r.raw}&nbsp;»
              </div>
              <div className="voice-fields">
                <input
                  className="voice-name"
                  value={r.name}
                  onChange={(e) => editName(r.id, e.target.value)}
                  onBlur={(e) => commitName(r.id, e.target.value)}
                  placeholder="nom"
                />
                <input
                  className="voice-price"
                  value={r.price ?? ""}
                  onChange={(e) => editPrice(r.id, e.target.value)}
                  inputMode="numeric"
                  placeholder="prix"
                />
                <span className="voice-kamas">
                  {r.price != null ? formatKamas(r.price) : "— prix ?"}
                </span>
                <button
                  className="voice-del"
                  onClick={() => removeRow(r.id)}
                  title="Supprimer"
                >
                  ✕
                </button>
              </div>
              <div className="voice-match">{renderResolve(r, chooseCandidate)}</div>
            </div>
          ))}
        </div>

        <div className="voice-json">
          <div className="voice-json-head">
            <strong>JSON</strong>
            <button className="ghost" onClick={copyJson} disabled={rows.length === 0}>
              {copied ? "Copié ✓" : "Copier"}
            </button>
          </div>
          <pre>{json}</pre>
        </div>
      </div>
    </section>
  );
}

function renderResolve(r: Row, choose: (id: string, item: Item) => void) {
  const res = r.resolve;
  if (res.status === "loading") return <span className="voice-hint">recherche…</span>;
  if (res.status === "empty")
    return <span className="voice-nomatch">aucun objet trouvé</span>;
  if (res.status === "error")
    return <span className="voice-nomatch">erreur : {res.message}</span>;

  const quality = matchQuality(r.name, res.chosen.name);
  return (
    <div className="voice-resolved">
      {res.chosen.img && (
        <img src={res.chosen.img} alt="" className="voice-ic" />
      )}
      <span className={`voice-badge q-${quality}`}>{quality}</span>
      {res.candidates.length > 1 ? (
        <select
          className="voice-cand"
          value={res.chosen.id}
          onChange={(e) => {
            const item = res.candidates.find((c) => c.id === e.target.value);
            if (item) choose(r.id, item);
          }}
        >
          {res.candidates.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.level ? ` (niv. ${c.level})` : ""}
            </option>
          ))}
        </select>
      ) : (
        <span className="voice-matched">{res.chosen.name}</span>
      )}
    </div>
  );
}
