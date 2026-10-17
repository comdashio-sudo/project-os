import { trpc } from "@/lib/trpc";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import { OfflineCopyNotice } from "@/components/OfflineCopyNotice";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { installCachedReads } from "@/lib/cachedReads";
import "./index.css";

const queryClient = new QueryClient();
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

createRoot(document.getElementById("root")!).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <LanguageProvider><OfflineCopyNotice copiedAt={cachedReads.hydratedAt} /></LanguageProvider>
      <App />
    </QueryClientProvider>
  </trpc.Provider>
);
