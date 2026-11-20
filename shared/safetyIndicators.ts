// Q-28 (P-117): the two safety rates, computed in one place for the server and the screens. Pure: the caller counts the incidents and the man-hours.
//   LTIFR (lost-time injury frequency rate) = lost-time injuries × 1,000,000 / man-hours worked
//   TRIR  (total recordable incident rate)  = recordable incidents × 200,000 / man-hours worked
// A lost-time injury is a lost-time case or a fatality. A recordable incident is any injury beyond first aid: medical treatment, restricted work, lost time
// or a fatality. Near misses, first aid, property damage and environmental incidents are registered and counted, but they are not in either rate.
// With no man-hours the rates are null ("not enough data"), never 0 and never infinite.

export const SAFETY_INCIDENT_KINDS = ["near_miss", "first_aid", "medical_treatment", "restricted_work", "lost_time", "fatality", "property_damage", "environmental"] as const;
export type SafetyIncidentKind = (typeof SAFETY_INCIDENT_KINDS)[number];
export const LOST_TIME_KINDS: readonly SafetyIncidentKind[] = ["lost_time", "fatality"];
export const RECORDABLE_KINDS: readonly SafetyIncidentKind[] = ["medical_treatment", "restricted_work", "lost_time", "fatality"];
export const LTIFR_BASE = 1_000_000;
export const TRIR_BASE = 200_000;

const round = (value: number, places = 2) => Math.round(value * 10 ** places) / 10 ** places;

export function safetyRates(input: { incidents: readonly { kind: SafetyIncidentKind }[]; manHours: number }) {
  const lostTime = input.incidents.filter(incident => LOST_TIME_KINDS.includes(incident.kind)).length;
  const recordable = input.incidents.filter(incident => RECORDABLE_KINDS.includes(incident.kind)).length;
  const hours = Number.isFinite(input.manHours) && input.manHours > 0 ? input.manHours : 0;
  const byKind = Object.fromEntries(SAFETY_INCIDENT_KINDS.map(kind => [kind, input.incidents.filter(incident => incident.kind === kind).length])) as Record<SafetyIncidentKind, number>;
  return {
    manHours: round(hours),
    lostTime,
    recordable,
    byKind,
    ltifr: hours ? round((lostTime * LTIFR_BASE) / hours) : null,
    trir: hours ? round((recordable * TRIR_BASE) / hours) : null,
  };
}

/** A permit is "expired" while it is still active after its window has ended; closed and cancelled permits are what they say. */
export function permitState(permit: { status: "active" | "closed" | "cancelled"; validFrom: Date | string; validTo: Date | string }, now: Date): "active" | "expired" | "not_started" | "closed" | "cancelled" {
  if (permit.status !== "active") return permit.status;
  if (new Date(permit.validTo).getTime() <= now.getTime()) return "expired";
  if (new Date(permit.validFrom).getTime() > now.getTime()) return "not_started";
  return "active";
}
