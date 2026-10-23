// Connections to a company's other systems (work order 12, items 10 and 11). A connection holds where the system is and how to sign in (sealed); a CONNECTOR knows how to
// read that system and turn what it finds into the platform's inbound records, which then go through the same applyErpBatch as a push through the API — the same rules, the
// same mapping, the same log. The registry below says which systems have a connector and how honestly each one is proven.
export type ConnectorStatus = "PROVEN_IN_CI" | "UNVERIFIED";
export const connectors: Array<{ system: string; status: ConnectorStatus }> = [];
export async function runScheduledConnections(): Promise<{ ran: number }> { return { ran: 0 }; }
