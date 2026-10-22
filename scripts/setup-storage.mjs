// Creates (or corrects) the two private storage buckets in the Supabase project, by SQL as the database owner: no service_role key is involved.
//   project-os-files    private, 50 MB per file (the import ceiling)
//   project-os-backups  private, 1 GB per file
// Run from the GitHub Action "Supabase setup" (action = storage). Idempotent. Prints bucket names and limits only.
import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL (the owner connection, session pooler) is required."); process.exit(2); }
const BUCKETS = [
  { id: process.env.STORAGE_BUCKET || "project-os-files", limit: 50 * 1024 * 1024 },
  { id: process.env.BACKUP_BUCKET || "project-os-backups", limit: 1024 * 1024 * 1024 },
];
const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: process.env.DATABASE_SSL_VERIFY !== "off", ...(process.env.DATABASE_SSL_CA ? { ca: process.env.DATABASE_SSL_CA.replace(/\\n/g, "\n") } : {}) } });
await client.connect();
try {
  const { rows } = await client.query("SELECT to_regclass('storage.buckets') AS t");
  if (!rows[0].t) throw new Error("storage.buckets does not exist: this is not a Supabase project database");
  for (const bucket of BUCKETS) {
    // public = false: files are reached only through signed links the server mints. file_size_limit is enforced by Storage itself.
    await client.query(
      "INSERT INTO storage.buckets (id, name, public, file_size_limit) VALUES ($1, $1, false, $2) ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = EXCLUDED.file_size_limit",
      [bucket.id, bucket.limit],
    );
  }
  const { rows: now } = await client.query("SELECT id, public, file_size_limit FROM storage.buckets WHERE id = ANY($1) ORDER BY id", [BUCKETS.map(bucket => bucket.id)]);
  console.log(JSON.stringify({ buckets: now }));
  if (now.length !== BUCKETS.length || now.some(row => row.public)) { console.error("a bucket is missing or public"); process.exit(1); }
} finally { await client.end(); }
