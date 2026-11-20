import { ColumnMapping, type ColumnReport } from "@/components/ColumnMapping";
import { PMC_FIELD_LABELS } from "@/lib/pmcImportMessages";
import { getLocalizedProjectError } from "@/lib/projectErrors";
import { pickLanguage, type Language } from "@/lib/language";
import { trpc } from "@/lib/trpc";
import React from "react";

// Q-31 (P0-02): which column of the file each field was read from, shown with every PMC import report (and, Q-31 remainder, every operational ledger's).
// When the importer did not recognise a column or found two columns for one field, the person picks it and the stored file is analysed again with that
// mapping — nothing is written until they have read the new report and confirmed, and the write uses the same mapping. Since Q-50 batch 3a the picker
// itself is the shared ColumnMapping; this wrapper only sends the choice to the background job.
export type PmcImportColumns = ColumnReport;

/** `fieldLabel`: the name of a field for another importer (the operational ledgers, Q-31); PMC's own names otherwise. */
export function PmcColumnMapping({ tenantId, projectId, importId, columns, language, isArabic, fieldLabel }: { tenantId: string; projectId: string; importId: string; columns: PmcImportColumns; language: Language; isArabic: boolean; fieldLabel?: (key: string) => string | undefined }) {
  const pmcLabels = pickLanguage<Record<string, string>>(language, PMC_FIELD_LABELS);
  const label = (key: string) => (fieldLabel ? fieldLabel(key) : pmcLabels[key]) ?? key;
  const utils = trpc.useUtils();
  // the differences preview (operational ledgers) is read again too: it follows the new columns
  const reanalyze = trpc.dataImports.reanalyze.useMutation({ onSuccess: () => Promise.all([utils.dataImports.progress.invalidate(), utils.dataImports.diff.invalidate()]) });
  return (
    <ColumnMapping columns={columns} language={language} flow="reanalyze" fieldLabel={label} pending={reanalyze.isPending} testId="pmc-column-mapping"
      error={reanalyze.error ? getLocalizedProjectError(reanalyze.error, isArabic) : null}
      onApply={mappingOverride => reanalyze.mutate({ tenantId, projectId, importId, mappingOverride })} />
  );
}
