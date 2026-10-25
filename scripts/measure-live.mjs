// Reads the LIVE site and says which Vercel region ran the function and how long a real request takes. Plain GETs of public addresses, no secret, no write.
//
//   node scripts/measure-live.mjs [url=https://dashio-lovat.vercel.app] [requests=15]
//
// x-vercel-id is "<edge region>::<function region>::<id>" for a request a function served (and "<edge region>::<id>" for one the edge answered itself). The
// function region must equal the one vercel.json asks for; otherwise the exit code is 1 and the line says so. Run from GitHub (workflow "Live probe"): the machine
// that runs it is in a data centre, so the times are the platform's own, not those of a visitor in Riyadh (that needs a browser there; see docs/STATE.md).
import { appendFileSync, readFileSync } from "node:fs";

const base = (process.argv[2] ?? "https://dashio-lovat.vercel.app").replace(/\/+$/, "");
const count = Math.max(3, Number(process.argv[3] ?? 15));
const wanted = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8")).regions?.[0];

export const functionRegionOf = header => {
  const parts = String(header ?? "").split("::");
  return parts.length >= 3 ? parts[1] : null; // two parts: the edge answered without a function
};
const percentile = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];

async function probe(path) {
  const times = []; const regions = new Set(); let status = 0;
  for (let i = 0; i < count; i++) {
    const started = performance.now();
    const response = await fetch(`${base}${path}`, { headers: { "Cache-Control": "no-cache", "User-Agent": "project-os-live-probe" } });
    await response.arrayBuffer();
    times.push(performance.now() - started); status = response.status;
    const region = functionRegionOf(response.headers.get("x-vercel-id"));
    if (region) regions.add(region);
  }
  const first = times[0];
  const warm = times.slice(1).sort((a, b) => a - b);
  return { path, status, first_ms: Math.round(first), warm_p50_ms: Math.round(percentile(warm, 0.5)), warm_p95_ms: Math.round(percentile(warm, 0.95)), functionRegions: [...regions] };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const results = [await probe("/api/auth/config"), await probe("/")];
  const seen = new Set(results.flatMap(item => item.functionRegions));
  const ok = wanted && seen.size > 0 && [...seen].every(region => region === wanted);
  const report = { base, wantedRegion: wanted, functionRegionsSeen: [...seen], regionMatches: Boolean(ok), results };
  console.log(JSON.stringify(report, null, 2));
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Live probe\n\n\`\`\`json\n${JSON.stringify(report, null, 2)}\n\`\`\`\n`);
  if (!ok) { console.error(`Function region ${[...seen].join(",") || "(none seen)"} is not the one vercel.json asks for (${wanted}).`); process.exit(1); }
}
