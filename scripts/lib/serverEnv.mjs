// The environment a rehearsal gives the production server it starts. The script itself seeds and inspects as the OWNER (DATABASE_URL); the server
// under test connects as the restricted application role when SERVER_DATABASE_URL is set (the real deployment's shape: row-level security applies
// to everything it does). Without it the server shares the owner's connection, which is a parity run, not a security run.
export const serverDatabaseEnv = () => (process.env.SERVER_DATABASE_URL ? { DATABASE_URL: process.env.SERVER_DATABASE_URL } : {});
