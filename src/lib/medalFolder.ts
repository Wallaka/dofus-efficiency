/**
 * Access to the local Medal screenshots folder via the File System Access API.
 *
 * The user picks the folder once (a real OS folder picker — browsers don't let
 * a web app take a typed path). We persist the returned directory *handle* in
 * IndexedDB so later visits can re-read the folder without re-picking, after a
 * lightweight permission check. See TECH_NOTES.md §2.
 *
 * Desktop Chrome / Edge / Opera only — Firefox and Safari don't support picking
 * real local folders. Use `isFileSystemAccessSupported()` before offering it.
 */

const DB_NAME = "dofus-efficiency";
const DB_VERSION = 1;
const HANDLE_STORE = "handles";
const MEDAL_FOLDER_KEY = "medal-folder";

/** Image extensions we treat as screenshots. */
const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "webp", "gif", "bmp"];

/** One screenshot found in the Medal folder, with enough info to list it. */
export interface ScreenshotFile {
  /** File name, e.g. "Dofus 2026.09.12 - 18.14.52.png". */
  name: string;
  /** Handle to read the bytes later (for OCR / preview). */
  handle: FileSystemFileHandle;
  /** Last-modified time in ms since epoch. */
  lastModified: number;
  /** Size in bytes. */
  size: number;
}

/** Is the File System Access API (directory picking) available in this browser? */
export function isFileSystemAccessSupported(): boolean {
  return typeof window !== "undefined" && "showDirectoryPicker" in window;
}

// --- Tiny IndexedDB layer for the directory handle -------------------------
// Directory handles are structured-cloneable, so IndexedDB can store them
// directly (localStorage can't — it only holds strings).

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(HANDLE_STORE)) {
        db.createObjectStore(HANDLE_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function idbGet<T>(key: string): Promise<T | undefined> {
  return openDb().then(
    (db) =>
      new Promise<T | undefined>((resolve, reject) => {
        const tx = db.transaction(HANDLE_STORE, "readonly");
        const req = tx.objectStore(HANDLE_STORE).get(key);
        req.onsuccess = () => resolve(req.result as T | undefined);
        req.onerror = () => reject(req.error);
        tx.oncomplete = () => db.close();
      }),
  );
}

function idbSet(key: string, value: unknown): Promise<void> {
  return openDb().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const tx = db.transaction(HANDLE_STORE, "readwrite");
        tx.objectStore(HANDLE_STORE).put(value, key);
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      }),
  );
}

function idbDelete(key: string): Promise<void> {
  return openDb().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const tx = db.transaction(HANDLE_STORE, "readwrite");
        tx.objectStore(HANDLE_STORE).delete(key);
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      }),
  );
}

// --- Public API ------------------------------------------------------------

/**
 * Prompt the user to pick their Medal screenshots folder. Must be called from a
 * user gesture (e.g. a click). Persists the handle and returns it. Returns null
 * if the user cancels the picker.
 */
export async function pickMedalFolder(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const handle = await window.showDirectoryPicker({ id: "medal-screenshots" });
    // Persistence is best-effort: if IndexedDB is unavailable (private mode,
    // quota), we can still use the folder for this session.
    await idbSet(MEDAL_FOLDER_KEY, handle).catch(() => {});
    return handle;
  } catch (err) {
    // AbortError = user dismissed the picker; treat as "no selection".
    if (err instanceof DOMException && err.name === "AbortError") return null;
    throw err;
  }
}

/** Restore the previously picked folder handle, or null if none saved. */
export function loadSavedFolder(): Promise<FileSystemDirectoryHandle | null> {
  return idbGet<FileSystemDirectoryHandle>(MEDAL_FOLDER_KEY).then(
    (handle) => handle ?? null,
  );
}

/** Forget the saved folder (does not delete any files). */
export function forgetMedalFolder(): Promise<void> {
  return idbDelete(MEDAL_FOLDER_KEY);
}

/**
 * Check read permission on a handle. When `request` is true we may show the
 * browser's permission prompt (so it must run inside a user gesture); when
 * false we only query silently — useful on page load.
 */
export async function verifyReadPermission(
  handle: FileSystemDirectoryHandle,
  request: boolean,
): Promise<boolean> {
  const opts: { mode: "read" } = { mode: "read" };
  if ((await handle.queryPermission?.(opts)) === "granted") return true;
  if (request && (await handle.requestPermission?.(opts)) === "granted") {
    return true;
  }
  return false;
}

/**
 * List the image files in the folder, newest first. Assumes read permission has
 * already been granted (see `verifyReadPermission`).
 */
export async function listScreenshots(
  handle: FileSystemDirectoryHandle,
): Promise<ScreenshotFile[]> {
  const files: ScreenshotFile[] = [];
  for await (const entry of handle.values()) {
    if (entry.kind !== "file") continue;
    if (!hasImageExtension(entry.name)) continue;
    const file = await entry.getFile();
    files.push({
      name: entry.name,
      handle: entry,
      lastModified: file.lastModified,
      size: file.size,
    });
  }
  files.sort((a, b) => b.lastModified - a.lastModified);
  return files;
}

function hasImageExtension(name: string): boolean {
  const dot = name.lastIndexOf(".");
  if (dot < 0) return false;
  const ext = name.slice(dot + 1).toLowerCase();
  return IMAGE_EXTENSIONS.includes(ext);
}
