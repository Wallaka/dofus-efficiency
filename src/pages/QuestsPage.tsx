import { useEffect, useMemo, useState } from "react";
import type { Item, PriceMap } from "../types";
import {
  loadQuests,
  saveQuests,
  questValue,
  periodTotal,
  sortQuests,
  importCatalog,
  newQuestId,
  loadCharacterCount,
  saveCharacterCount,
  clampCharacters,
  MAX_CHARACTERS,
  type Quest,
  type QuestPeriod,
  type QuestSort,
} from "../lib/quests";
import { usePrices } from "../lib/usePrices";
import type { PriceEntryMap } from "../lib/priceStore";
import { formatKamas } from "../lib/format";
import { ItemAutocomplete } from "../components/ItemAutocomplete";
import { CopyName } from "../components/CopyName";

const PERIOD_LABEL: Record<QuestPeriod, string> = {
  daily: "Quotidienne",
  weekly: "Hebdomadaire",
};


/**
 * The daily/weekly quest routine: user-curated quests that reward kamas and
 * resources, with each quest's total value (kamas + resource rewards at their
 * stored prices) so you can see which are worth doing. Prices come from the same
 * shared store as the OCR / Objets suivis / Prix pages — read here, editable by
 * hand where a price is missing.
 */
export function QuestsPage() {
  const [quests, setQuests] = useState<Quest[]>(loadQuests);
  useEffect(() => {
    saveQuests(quests);
  }, [quests]);

  // Shared price store (entries are the single source; the map derives from it).
  const { prices, entries, setPrice, clearPrice } = usePrices();

  function onPriceChange(item: Item, value: number | null) {
    if (value == null || Number.isNaN(value)) clearPrice(item.id);
    else setPrice(item, value);
  }

  // --- Quest CRUD -----------------------------------------------------------
  const patchQuest = (id: string, patch: Partial<Quest>) =>
    setQuests((qs) => qs.map((q) => (q.id === id ? { ...q, ...patch } : q)));

  function addReward(id: string, item: Item) {
    setQuests((qs) =>
      qs.map((q) => {
        if (q.id !== id) return q;
        if (q.rewards.some((r) => r.item.id === item.id)) return q; // no dupes
        return { ...q, rewards: [...q.rewards, { item, quantity: 1 }] };
      }),
    );
  }
  const setRewardQty = (id: string, itemId: string, quantity: number) =>
    patchQuestRewards(id, (rs) =>
      rs.map((r) => (r.item.id === itemId ? { ...r, quantity } : r)),
    );
  const removeReward = (id: string, itemId: string) =>
    patchQuestRewards(id, (rs) => rs.filter((r) => r.item.id !== itemId));
  function patchQuestRewards(id: string, fn: (rs: Quest["rewards"]) => Quest["rewards"]) {
    setQuests((qs) => qs.map((q) => (q.id === id ? { ...q, rewards: fn(q.rewards) } : q)));
  }

  // --- Add-quest form -------------------------------------------------------
  const [name, setName] = useState("");
  const [period, setPeriod] = useState<QuestPeriod>("daily");
  const [url, setUrl] = useState("");
  const [kamas, setKamas] = useState("");

  function addQuest(e: React.FormEvent) {
    e.preventDefault();
    const n = name.trim();
    if (!n) return;
    setQuests((qs) => [
      ...qs,
      {
        id: newQuestId(),
        name: n,
        period,
        url: url.trim() || undefined,
        kamas: Math.max(0, Math.round(Number(kamas) || 0)),
        rewards: [],
      },
    ]);
    setName("");
    setUrl("");
    setKamas("");
  }

  const [sort, setSort] = useState<QuestSort>("manual");

  // Quest rewards are per character, so the routine is worth N× on N characters.
  const [characters, setCharacters] = useState<number>(loadCharacterCount);
  useEffect(() => {
    saveCharacterCount(characters);
  }, [characters]);

  const daily = useMemo(() => quests.filter((q) => q.period === "daily"), [quests]);
  const weekly = useMemo(() => quests.filter((q) => q.period === "weekly"), [quests]);

  // Ordered copies for display (profitability first, or insertion order).
  const dailySorted = useMemo(
    () => sortQuests(daily, prices, sort),
    [daily, prices, sort],
  );
  const weeklySorted = useMemo(
    () => sortQuests(weekly, prices, sort),
    [weekly, prices, sort],
  );

  // Per-character, variant-aware totals: quests sharing a variantGroup count once.
  const dailyPerChar = periodTotal(daily, prices);
  const weeklyPerChar = periodTotal(weekly, prices);
  // Scaled to the whole account (N characters).
  const dailyTotal = dailyPerChar * characters;
  const weeklyTotal = weeklyPerChar * characters;
  // A full week's routine: every daily done 7×, plus the weeklies once, × N characters.
  const weeklyRoutine = (dailyPerChar * 7 + weeklyPerChar) * characters;

  function onImport() {
    setQuests((qs) => {
      const { quests: next, added } = importCatalog(qs);
      setImported(added);
      return next;
    });
  }
  const [imported, setImported] = useState<number | null>(null);

  return (
    <main className="quests-page">
      <section className="panel">
        <h2>Quêtes (routine quotidienne / hebdomadaire)</h2>
        <p className="hint">
          Listez vos quêtes répétables et leurs récompenses (kamas + ressources)
          pour voir lesquelles valent le coup. Les prix des ressources viennent du
          même stock que l'OCR&nbsp;; saisissez-les à la main si besoin.
        </p>

        <form className="quest-add" onSubmit={addQuest}>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nom de la quête"
            aria-label="Nom de la quête"
            className="quest-add-name"
          />
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value as QuestPeriod)}
            aria-label="Période"
          >
            <option value="daily">Quotidienne</option>
            <option value="weekly">Hebdomadaire</option>
          </select>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Lien dofuspourlesnoobs (optionnel)"
            aria-label="Lien de la quête"
            className="quest-add-url"
          />
          <input
            type="number"
            min={0}
            inputMode="numeric"
            value={kamas}
            onChange={(e) => setKamas(e.target.value)}
            placeholder="Kamas"
            aria-label="Kamas bruts"
            className="quest-add-kamas"
          />
          <button type="submit" className="folder-pick">
            Ajouter
          </button>
        </form>

        <div className="quest-import">
          <button type="button" className="folder-secondary" onClick={onImport}>
            Importer les quêtes répétables
          </button>
          <span className="hint">
            Catalogue communautaire (dofuspourlesnoobs) — n'ajoute que celles qui
            manquent.
            {imported != null &&
              ` ${imported} quête${imported > 1 ? "s" : ""} ajoutée${imported > 1 ? "s" : ""}.`}
          </span>
        </div>

        {quests.length > 0 && (
          <>
            <div className="quests-controls">
              <label className="quests-chars">
                Personnages&nbsp;:
                <input
                  type="number"
                  min={1}
                  max={MAX_CHARACTERS}
                  inputMode="numeric"
                  value={characters}
                  onChange={(e) =>
                    setCharacters(clampCharacters(Number(e.target.value)))
                  }
                  aria-label="Nombre de personnages"
                />
              </label>
              <label className="quests-sort">
                Trier&nbsp;:
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value as QuestSort)}
                  aria-label="Trier les quêtes"
                >
                  <option value="manual">Ordre d'ajout</option>
                  <option value="value">Rentabilité (décroissant)</option>
                </select>
              </label>
            </div>

            <div className="quests-summary">
              <span className="badge">
                Quotidiennes&nbsp;: {formatKamas(dailyTotal)} / jour
              </span>
              <span className="badge">
                Hebdomadaires&nbsp;: {formatKamas(weeklyTotal)} / semaine
              </span>
              <span className="badge badge-fresh">
                Routine&nbsp;: ≈ {formatKamas(weeklyRoutine)} / semaine
              </span>
            </div>
            {characters > 1 && (
              <p className="hint quests-chars-note">
                Totaux pour {characters} personnages&nbsp;: récompenses par
                personne × {characters}. Les valeurs par quête ci-dessous restent
                pour un personnage.
              </p>
            )}
          </>
        )}
      </section>

      <QuestSection
        title="Quotidiennes"
        list={dailySorted}
        total={dailyPerChar}
        prices={prices}
        entries={entries}
        onPriceChange={onPriceChange}
        patchQuest={patchQuest}
        addReward={addReward}
        setRewardQty={setRewardQty}
        removeReward={removeReward}
        onDelete={(id) => setQuests((qs) => qs.filter((q) => q.id !== id))}
      />
      <QuestSection
        title="Hebdomadaires"
        list={weeklySorted}
        total={weeklyPerChar}
        prices={prices}
        entries={entries}
        onPriceChange={onPriceChange}
        patchQuest={patchQuest}
        addReward={addReward}
        setRewardQty={setRewardQty}
        removeReward={removeReward}
        onDelete={(id) => setQuests((qs) => qs.filter((q) => q.id !== id))}
      />

      {quests.length === 0 && (
        <p className="hint">Aucune quête pour l'instant. Ajoutez-en une ci-dessus.</p>
      )}
    </main>
  );
}

interface SectionProps {
  title: string;
  list: Quest[];
  total: number;
  prices: PriceMap;
  entries: PriceEntryMap;
  onPriceChange: (item: Item, value: number | null) => void;
  patchQuest: (id: string, patch: Partial<Quest>) => void;
  addReward: (id: string, item: Item) => void;
  setRewardQty: (id: string, itemId: string, qty: number) => void;
  removeReward: (id: string, itemId: string) => void;
  onDelete: (id: string) => void;
}

function QuestSection(props: SectionProps) {
  const { title, list, total } = props;
  if (list.length === 0) return null;
  return (
    <section className="panel quests-section">
      <div className="quests-section-head">
        <h3>
          {title} ({list.length})
        </h3>
        <span className="quests-section-total">{formatKamas(total)}</span>
      </div>
      <ul className="quest-list">
        {list.map((q) => (
          <QuestCard key={q.id} quest={q} {...props} />
        ))}
      </ul>
    </section>
  );
}

function QuestCard({
  quest,
  prices,
  entries,
  onPriceChange,
  patchQuest,
  addReward,
  setRewardQty,
  removeReward,
  onDelete,
}: { quest: Quest } & SectionProps) {
  const value = questValue(quest, prices);
  return (
    <li className="quest-card">
      <div className="quest-card-head">
        <span className="quest-name">
          {quest.url ? (
            <a href={quest.url} target="_blank" rel="noreferrer noopener">
              {quest.name}
            </a>
          ) : (
            quest.name
          )}
        </span>
        <span className="badge">{PERIOD_LABEL[quest.period]}</span>
        {quest.zone && <span className="badge quest-zone">{quest.zone}</span>}
        {quest.variantGroup && (
          <span className="badge badge-warn" title="Une seule quête de ce groupe par jour compte dans le total">
            variante
          </span>
        )}
        <label className="quest-kamas">
          <input
            type="number"
            min={0}
            inputMode="numeric"
            value={quest.kamas || ""}
            placeholder="0"
            onChange={(e) =>
              patchQuest(quest.id, {
                kamas: Math.max(0, Math.round(Number(e.target.value) || 0)),
              })
            }
            aria-label={`Kamas de ${quest.name}`}
          />
          <span>k bruts</span>
        </label>
        <button
          type="button"
          className="folder-secondary quest-del"
          onClick={() => onDelete(quest.id)}
          aria-label={`Supprimer ${quest.name}`}
          title="Supprimer la quête"
        >
          ✕
        </button>
      </div>

      {quest.note && (
        <p className="quest-note">Récompense annexe&nbsp;: {quest.note}</p>
      )}

      {quest.rewards.length > 0 && (
        <table className="quest-rewards">
          <thead>
            <tr>
              <th>Ressource</th>
              <th className="num">Qté</th>
              <th className="num">Prix / unité</th>
              <th className="num">Valeur</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {quest.rewards.map((r) => {
              const unit = prices[r.item.id];
              const source = entries[r.item.id]?.source;
              const lineValue = unit != null ? unit * r.quantity : null;
              return (
                <tr key={r.item.id}>
                  <td>
                    <span className="price-item">
                      {r.item.img && (
                        <img src={r.item.img} alt="" className="autocomplete-icon" />
                      )}
                      <span className="item-name" title={r.item.name}>
                        {r.item.name}
                      </span>
                      <CopyName text={r.item.name} />
                    </span>
                  </td>
                  <td className="num">
                    <input
                      type="number"
                      min={1}
                      inputMode="numeric"
                      className="quest-qty"
                      value={r.quantity}
                      onChange={(e) =>
                        setRewardQty(
                          quest.id,
                          r.item.id,
                          Math.max(1, Math.round(Number(e.target.value) || 1)),
                        )
                      }
                      aria-label={`Quantité de ${r.item.name}`}
                    />
                  </td>
                  <td className="num">
                    <input
                      type="number"
                      min={0}
                      inputMode="numeric"
                      className="quest-price"
                      placeholder="?"
                      value={unit ?? ""}
                      onChange={(e) =>
                        onPriceChange(
                          r.item,
                          e.target.value === "" ? null : Number(e.target.value),
                        )
                      }
                      aria-label={`Prix de ${r.item.name}`}
                    />
                    {source && (
                      <span className="recipe-detail">
                        {source === "ocr" ? "OCR" : "manuel"}
                      </span>
                    )}
                  </td>
                  <td className="num">{formatKamas(lineValue ?? undefined)}</td>
                  <td className="num">
                    <button
                      type="button"
                      className="folder-secondary price-del"
                      onClick={() => removeReward(quest.id, r.item.id)}
                      aria-label={`Retirer ${r.item.name}`}
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <div className="quest-add-reward">
        <ItemAutocomplete
          onPick={(item) => addReward(quest.id, item)}
          placeholder="Ajouter une ressource récompensée…"
        />
      </div>

      <div className="quest-total">
        Valeur totale&nbsp;: <strong>{formatKamas(value.total)}</strong>
        {value.missing.length > 0 && (
          <span className="hint quest-missing">
            {" "}
            (≈ — {value.missing.length} ressource
            {value.missing.length > 1 ? "s" : ""} sans prix)
          </span>
        )}
      </div>
    </li>
  );
}
