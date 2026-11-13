// D-33 (G-100): registers the shell worker (client/public/sw.js) in the built app, then hands it the files this first visit already loaded,
// so the page, its script, its styles and its fonts are on the phone before the network goes. The worker never keeps an /api/ answer.
type WorkerHost = {
  serviceWorker?: { register: (url: string) => Promise<unknown>; ready: Promise<{ active: { postMessage: (message: unknown) => void } | null }> };
};

/** The same-origin files a page has loaded so far (scripts, styles, fonts, images), from the browser's own resource timing. */
export function loadedFiles(origin: string, entries: Array<{ name: string }>): string[] {
  return Array.from(new Set([`${origin}/`, ...entries.map(entry => entry.name).filter(name => name.startsWith(`${origin}/`))]));
}

export async function registerShellCache(host: WorkerHost = navigator as unknown as WorkerHost, origin = location.origin, entries: () => Array<{ name: string }> = () => performance.getEntriesByType("resource")): Promise<boolean> {
  if (!host.serviceWorker) return false;
  try {
    await host.serviceWorker.register("/sw.js");
    const registration = await host.serviceWorker.ready;
    registration.active?.postMessage({ type: "dashio-keep-files", urls: loadedFiles(origin, entries()) });
    return true;
  } catch {
    return false; // a blocked or failed worker only means no offline start; the app works as before
  }
}
