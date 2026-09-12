import { useEffect, useState } from "react";
import {
  forgetMedalFolder,
  isFileSystemAccessSupported,
  listScreenshots,
  loadSavedFolder,
  pickMedalFolder,
  verifyReadPermission,
  type ScreenshotFile,
} from "../lib/medalFolder";

interface Props {
  /** Notified whenever the loaded screenshot list changes (Phase 1: OCR). */
  onScreenshots?: (files: ScreenshotFile[]) => void;
}

type Status =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "needs-permission"; folderName: string }
  | { kind: "ready"; folderName: string; files: ScreenshotFile[] }
  | { kind: "error"; message: string };

/**
 * Lets the user point the app at their local Medal screenshots folder (via the
 * File System Access API) and confirms it works by reading what's inside. This
 * is the input step of Phase 1; a richer per-screenshot listing comes later.
 */
export function MedalFolderPicker({ onScreenshots }: Props) {
  const supported = isFileSystemAccessSupported();
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  // On mount, try to silently restore a previously picked folder.
  useEffect(() => {
    if (!supported) return;
    let cancelled = false;

    (async () => {
      const handle = await loadSavedFolder();
      if (cancelled || !handle) return;
      // Can't request permission without a user gesture, so only query.
      if (await verifyReadPermission(handle, false)) {
        const files = await listScreenshots(handle);
        if (cancelled) return;
        setStatus({ kind: "ready", folderName: handle.name, files });
        onScreenshots?.(files);
      } else if (!cancelled) {
        setStatus({ kind: "needs-permission", folderName: handle.name });
      }
    })().catch((err) => {
      if (!cancelled) setStatus({ kind: "error", message: describeError(err) });
    });

    return () => {
      cancelled = true;
    };
  }, [supported, onScreenshots]);

  async function choose() {
    setStatus({ kind: "loading" });
    try {
      const handle = await pickMedalFolder();
      if (!handle) {
        setStatus({ kind: "idle" }); // user cancelled the picker
        return;
      }
      await loadFolder(handle);
    } catch (err) {
      setStatus({ kind: "error", message: describeError(err) });
    }
  }

  async function reconnect() {
    const handle = await loadSavedFolder();
    if (!handle) {
      setStatus({ kind: "idle" });
      return;
    }
    setStatus({ kind: "loading" });
    try {
      if (!(await verifyReadPermission(handle, true))) {
        setStatus({ kind: "needs-permission", folderName: handle.name });
        return;
      }
      await loadFolder(handle);
    } catch (err) {
      setStatus({ kind: "error", message: describeError(err) });
    }
  }

  async function loadFolder(handle: FileSystemDirectoryHandle) {
    const files = await listScreenshots(handle);
    setStatus({ kind: "ready", folderName: handle.name, files });
    onScreenshots?.(files);
  }

  async function forget() {
    await forgetMedalFolder();
    setStatus({ kind: "idle" });
    onScreenshots?.([]);
  }

  return (
    <section className="panel">
      <h2>Dossier des captures Medal</h2>

      {!supported ? (
        <p className="hint">
          Votre navigateur ne permet pas de choisir un dossier local. Utilisez
          Chrome, Edge ou Opera sur ordinateur.
        </p>
      ) : (
        <>
          <p className="hint">
            Indiquez une fois le dossier où Medal enregistre vos captures. L'app
            le relira aux prochaines visites, sans redemander.
          </p>

          {status.kind === "error" && (
            <p className="folder-error">{status.message}</p>
          )}

          {status.kind === "needs-permission" && (
            <p className="hint">
              Autorisation requise pour relire «&nbsp;{status.folderName}&nbsp;».
            </p>
          )}

          {status.kind === "ready" && (
            <div className="folder-status">
              <p className="folder-name">
                📁 {status.folderName}
                <span className="folder-count">
                  {status.files.length} capture
                  {status.files.length === 1 ? "" : "s"} trouvée
                  {status.files.length === 1 ? "" : "s"}
                </span>
              </p>
              {status.files.length > 0 && (
                <ul className="screenshot-preview">
                  {status.files.slice(0, 5).map((f) => (
                    <li key={f.name} title={f.name}>
                      {f.name}
                    </li>
                  ))}
                  {status.files.length > 5 && (
                    <li className="more">
                      … et {status.files.length - 5} de plus
                    </li>
                  )}
                </ul>
              )}
            </div>
          )}

          <div className="folder-actions">
            <button
              type="button"
              className="folder-pick"
              onClick={choose}
              disabled={status.kind === "loading"}
            >
              {status.kind === "loading"
                ? "Lecture…"
                : status.kind === "ready"
                  ? "Changer de dossier"
                  : "Choisir le dossier Medal"}
            </button>

            {status.kind === "needs-permission" && (
              <button type="button" className="folder-secondary" onClick={reconnect}>
                Autoriser l'accès
              </button>
            )}

            {(status.kind === "ready" || status.kind === "needs-permission") && (
              <button type="button" className="folder-secondary" onClick={forget}>
                Oublier
              </button>
            )}
          </div>
        </>
      )}
    </section>
  );
}

function describeError(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  return "Impossible de lire le dossier.";
}
