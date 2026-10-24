// The integration layer's share of the daily job (work order 12): deliver the webhooks that are due (a receiver that was down is tried again), forget API rate windows older
// than a day, and pull from the connections a company set to run daily.
import { deliverDueWebhooks } from "./webhooks";
import { pruneApiRateWindows } from "./apiKeys";
import { runScheduledConnections } from "./connections";

export async function runIntegrationDailyWork() {
  const webhooks = await deliverDueWebhooks({ limit: 500 });
  const pruned = await pruneApiRateWindows();
  const connections = await runScheduledConnections();
  return { webhooks, prunedRateWindows: pruned, connections };
}
