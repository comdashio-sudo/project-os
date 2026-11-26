// Q-56 (7): a tab opened before a new release asks for the page's code file under the OLD release's name, which the new release no longer has
// (every built file carries a hash of its content in its name). The import fails, the page cannot render, and the person saw «this page could not
// be shown». The cure is the new release: reload the page once. A guard in this tab's storage keeps it to one reload a minute, so a file that is
// genuinely missing cannot reload the page forever; the second failure shows the error screen with its code.

const KEY = "dashio.release-reload";
const WINDOW_MS = 60_000;

/** The browsers' and the bundler's words for "the code file of this page could not be fetched" */
const CHUNK_FAILURE = /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Unable to preload CSS|Loading (?:CSS )?chunk [\w-]+ failed|is not a valid JavaScript MIME type/i;

export function isChunkLoadError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const { name, message } = error as { name?: unknown; message?: unknown };
  return name === "ChunkLoadError" || (typeof message === "string" && CHUNK_FAILURE.test(message));
}

type Store = Pick<Storage, "getItem" | "setItem">;
const storage = (): Store | null => { try { return typeof window === "undefined" ? null : window.sessionStorage; } catch { return null; } };

/** Reloads the page for the new release, at most once a minute in this tab. Returns whether it did. */
export function reloadOnceForNewRelease(options: { now?: number; store?: Store | null; reload?: () => void } = {}): boolean {
  const store = options.store === undefined ? storage() : options.store;
  const now = options.now ?? Date.now();
  if (!store) return false; // no storage, no guard: never risk a reload loop
  try {
    const kept = store.getItem(KEY);
    const last = kept === null ? null : Number(kept);
    if (last !== null && Number.isFinite(last) && now - last < WINDOW_MS) return false;
    store.setItem(KEY, String(now));
  } catch { return false; }
  (options.reload ?? (() => window.location.reload()))();
  return true;
}

/** The bundler announces a failed preload before the import fails; reloading then spares the person the error screen altogether. */
export function installReleaseReload(target: Pick<Window, "addEventListener"> = window) {
  target.addEventListener("vite:preloadError", event => { if (reloadOnceForNewRelease()) event.preventDefault(); });
}
