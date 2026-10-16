import React from "react";

/**
 * The legend for the charts. Recharts' own legend labels each swatch for screen readers in English ("<name> legend icon"), which a person using
 * an Arabic screen reader hears in the middle of Arabic. This one hides the swatch from them and reads only the series name.
 */
export function ChartLegend({ payload }: { payload?: ReadonlyArray<{ value?: unknown; color?: string }> }) {
  return <ul className="mt-2 flex flex-wrap justify-center gap-4 text-xs">{(payload ?? []).map(entry => <li key={String(entry.value)} className="flex items-center gap-1.5"><span aria-hidden="true" className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: entry.color }} />{String(entry.value)}</li>)}</ul>;
}
