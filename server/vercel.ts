// The entry Vercel runs: the whole Express application (tRPC, sign-in, scheduled jobs, tenant export) as one function. The client is served from
// the CDN (dist/public), so no static handler is mounted here. scripts/build-vercel.mjs bundles this file into .vercel/output/functions/api.func.
import { createApp } from "./_core/app";
import { installProcessErrorLogging } from "./_core/logger";

installProcessErrorLogging();
const { app, finish } = createApp({ production: true });
finish(app);

export default app;
