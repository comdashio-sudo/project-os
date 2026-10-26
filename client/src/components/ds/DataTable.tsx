import React from "react";
import { cn } from "@/lib/utils";
import { useDsText } from "./strings";

export type Column<Row> = { key: string; header: string; align?: "start" | "end"; numeric?: boolean; width?: string; render?: (row: Row) => React.ReactNode };

/** A table that scrolls sideways inside its own box on a phone (the page never scrolls sideways), keeps its header in view, and sets numbers in tabular figures aligned to the end. */
export function DataTable<Row extends Record<string, unknown>>({ columns, rows, caption, rowKey, empty }: { columns: Column<Row>[]; rows: Row[]; caption: string; rowKey: (row: Row) => string; empty?: React.ReactNode }) {
  const text = useDsText();
  return (
    <div className="overflow-x-auto rounded-[var(--radius)] border border-border bg-card" tabIndex={0} role="region" aria-label={caption}>
      <table className="w-full min-w-[34rem] border-collapse text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="sticky top-0 bg-muted text-muted-foreground">
          <tr>{columns.map(column => <th key={column.key} scope="col" style={column.width ? { width: column.width } : undefined} className={cn("px-4 py-2.5 text-xs font-semibold", column.align === "end" || column.numeric ? "text-end" : "text-start")}>{column.header}</th>)}</tr>
        </thead>
        <tbody>
          {rows.length === 0 ? <tr><td colSpan={columns.length} className="px-4 py-8 text-center text-muted-foreground">{empty ?? text.rowsEmpty}</td></tr> : rows.map(row => (
            <tr key={rowKey(row)} className="border-t border-border hover:bg-muted/50">
              {columns.map(column => <td key={column.key} className={cn("px-4 py-3 align-middle", column.numeric && "tabular-nums", column.align === "end" || column.numeric ? "text-end" : "text-start")}>{column.render ? column.render(row) : String(row[column.key] ?? "")}</td>)}
            </tr>))}
        </tbody>
      </table>
    </div>
  );
}
