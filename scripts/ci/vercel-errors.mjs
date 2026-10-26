// Prints the production function's error-level log lines of the last N hours (scripts' env: VERCEL_TOKEN, VERCEL_PROJECT_ID, VERCEL_TEAM_ID, HOURS). Scrubs people's addresses, bearer
// tokens, JWT-looking strings and long digit runs before printing. The token is never printed.
const token = process.env.VERCEL_TOKEN;
if (!token) { console.error("::error::the repository secret VERCEL_TOKEN is not set (Settings -> Secrets and variables -> Actions)."); process.exit(1); }
const project = process.env.VERCEL_PROJECT_ID, team = process.env.VERCEL_TEAM_ID;
const hours = Math.min(72, Math.max(1, Number(process.env.HOURS) || 24));
const since = Date.now() - hours * 3_600_000;
const api = async path => { const response = await fetch(`https://api.vercel.com${path}${path.includes("?") ? "&" : "?"}teamId=${team}`, { headers: { Authorization: `Bearer ${token}` } }); if (!response.ok) throw new Error(`${path.split("?")[0]} -> ${response.status}`); return response; };
const scrub = text => String(text).replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[address]").replace(/Bearer\s+\S+/gi, "Bearer [token]").replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, "[jwt]").replace(/\d{9,}/g, "[digits]").slice(0, 600);

const list = await (await api(`/v6/deployments?projectId=${project}&target=production&limit=8&since=${since - 7 * 86_400_000}`)).json();
console.log(`production deployments: ${list.deployments.map(d => `${d.uid} ${d.state} ${new Date(d.created).toISOString()} ${String(d.meta?.githubCommitSha ?? "").slice(0, 7)}`).join(" | ")}`);
let found = 0;
for (const deployment of list.deployments) {
  let text = "";
  try { text = await (await api(`/v1/projects/${project}/deployments/${deployment.uid}/runtime-logs`)).text(); } catch (error) { console.log(`(${deployment.uid}: ${error.message})`); continue; }
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    let entry; try { entry = JSON.parse(line); } catch { continue; }
    const at = Number(entry.timestampInMs ?? 0);
    if (at && at < since) continue;
    if (!["error", "fatal"].includes(String(entry.level)) && !(Number(entry.responseStatusCode) >= 500)) continue;
    found++;
    console.log(`${new Date(at || Date.now()).toISOString()} ${deployment.uid.slice(0, 12)} ${entry.requestMethod ?? ""} ${entry.requestPath ?? ""} ${entry.responseStatusCode ?? ""} ${scrub(entry.message ?? "")}`);
  }
}
console.log(`${found} error line(s) in the last ${hours} hour(s)`);
