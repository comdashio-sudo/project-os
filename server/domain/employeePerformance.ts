export const performanceSourceTypes = ["activity", "action", "rfi", "ncr", "quality_inspection", "field_report", "material_request"] as const;
export type PerformanceSourceType = (typeof performanceSourceTypes)[number];

export type PerformanceSourceRecord = {
  sourceType: PerformanceSourceType;
  sourceId: string;
  label: string;
  status: string;
  createdAt: Date;
  dueAt: Date | null;
  completedAt: Date | null;
};

export type EmployeePerformanceMetrics = {
  assignedCount: number;
  completedCount: number;
  overdueCount: number;
  onTimeCompletionPercent: number | null;
  averageResponseHours: number | null;
  openCount: number;
  excludedCount: number;
  recordsConsidered: number;
  generatedAt: Date;
  formula: string;
  sourceCounts: Record<PerformanceSourceType, number>;
  sources: PerformanceSourceRecord[];
};

export function calculateEmployeePerformance(input: { records: PerformanceSourceRecord[]; excludedKeys: Set<string>; now: Date }): EmployeePerformanceMetrics {
  const sources = input.records.filter(record => !input.excludedKeys.has(`${record.sourceType}:${record.sourceId}`));
  const completed = sources.filter(record => record.completedAt);
  const open = sources.filter(record => !record.completedAt);
  const overdue = open.filter(record => record.dueAt && record.dueAt.getTime() < input.now.getTime());
  const completedWithDeadline = completed.filter(record => record.dueAt);
  const completedOnTime = completedWithDeadline.filter(record => record.completedAt!.getTime() <= record.dueAt!.getTime());
  const responseDurations = completed.map(record => Math.max(0, record.completedAt!.getTime() - record.createdAt.getTime()) / 3_600_000);
  const sourceCounts = Object.fromEntries(performanceSourceTypes.map(type => [type, sources.filter(record => record.sourceType === type).length])) as Record<PerformanceSourceType, number>;

  return {
    assignedCount: sources.length,
    completedCount: completed.length,
    overdueCount: overdue.length,
    onTimeCompletionPercent: completedWithDeadline.length ? Number(((completedOnTime.length / completedWithDeadline.length) * 100).toFixed(2)) : null,
    averageResponseHours: responseDurations.length ? Number((responseDurations.reduce((sum, hours) => sum + hours, 0) / responseDurations.length).toFixed(2)) : null,
    openCount: open.length,
    excludedCount: input.records.length - sources.length,
    recordsConsidered: sources.length,
    generatedAt: input.now,
    formula: "assigned = non-excluded source records; completed = records with completedAt; overdue = open records past dueAt; on-time = completed on or before dueAt / completed records with dueAt; response = average completedAt - createdAt; open = records without completedAt",
    sourceCounts,
    sources,
  };
}
