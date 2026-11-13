import { trpc } from "@/lib/trpc";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import { OfflineCopyNotice } from "@/components/OfflineCopyNotice";
import { shouldRetryQuery } from "@/components/ScreenStates";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { installCachedReads } from "@/lib/cachedReads";
import "./index.css";

// Q-18: the web font is fetched after the first paint instead of blocking it (index.html used to hold this stylesheet in its head, so a slow second
// host held back every paint). The text shows in the system Arabic font until it arrives (display=swap). Added once.
export const FONT_STYLESHEET = "https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&family=Outfit:wght@400;500;600;700&display=swap";
if (typeof document !== "undefined" && !document.querySelector(`link[href="${FONT_STYLESHEET}"]`)) {
  const link = document.createElement("link"); link.rel = "stylesheet"; link.href = FONT_STYLESHEET; document.head.appendChild(link);
}

// A refused or rejected query is final (G-160): a page shows its no-permission sentence at once, not after three retries of "loading".
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: shouldRetryQuery } } });
// G-100: the shell's two allowlisted reads (who am I, which companies) survive an offline start; nothing financial is ever kept.
const cachedReads = installCachedReads(queryClient);

const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      transformer: superjson,
      fetch(input, init) {
        return globalThis.fetch(input, {
          ...(init ?? {}),
          credentials: "include",
        });
      },
    }),
  ],
});

// D-33 (G-100): the app shell (the page and its built files, never /api/) is kept by client/public/sw.js, so the phone screens open from a cold
// start with no network; their data comes from cachedReads above and the screens' own last copies. Production builds only.
if (import.meta.env.PROD && typeof navigator !== "undefined" && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js")
      .then(() => navigator.serviceWorker.ready)
      // the files this first visit already loaded, so the next cold start has them; the worker keeps only its allowed kinds (never /api/)
      .then(registration => registration.active?.postMessage({ type: "keep", urls: performance.getEntriesByType("resource").map(entry => entry.name) }))
      .catch(() => undefined);
  });
}

createRoot(document.getElementById("root")!).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <LanguageProvider><OfflineCopyNotice copiedAt={cachedReads.hydratedAt} /></LanguageProvider>
      <App />
    </QueryClientProvider>
  </trpc.Provider>
);
