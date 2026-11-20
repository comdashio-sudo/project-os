import { ColumnMapping, type ColumnReport } from "@/components/ColumnMapping";
import type { Language } from "@/lib/language";
import React from "react";

// Q-31 (P0-02): the column picker for a file checked inside the request (the baseline's BOQ, cash flow and labour). The screen previews again with the
// person's choice and saves with the same choice, so the save reads the file exactly as the preview shown. Since Q-50 batch 3a the picker itself is the
// shared ColumnMapping; this wrapper hands the choice back to the screen. (The job importers' twin is PmcColumnMapping, which re-analyses a stored file.)
export type { ColumnReport };

/** `onApply` receives every field («no column» as an empty header) and asks to ignore the columns no field takes: the person has just seen the whole list. */
export function ColumnChoice({ columns, language, fieldLabel, pending, onApply }: { columns: ColumnReport; language: Language; fieldLabel: (key: string) => string | undefined; pending: boolean; onApply: (mapping: Record<string, string>) => void }) {
  return <ColumnMapping columns={columns} language={language} flow="check" fieldLabel={key => fieldLabel(key) ?? key} pending={pending} testId="column-choice" onApply={onApply} />;
}

/** The picker is offered when the columns are the problem (a required one not found, or a choice refused), and kept once the person has chosen. */
export const offersColumnChoice = (report: { refusal?: string | null; columns?: ColumnReport } | undefined): report is { refusal?: string | null; columns: ColumnReport } =>
  Boolean(report?.columns && (report.columns.overridden || report.refusal?.endsWith("_COLUMNS_MISSING") || report.refusal === "PROJECT_OS_IMPORT_MAPPING_INVALID"));
