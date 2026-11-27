// Q-67 (5): the unit card opens from a searchable list of the project's villas (number, with block, phase and model to search by) — not a typed number. A
// project without PMC villas, a person who may not read them (the progress screen's gate) or a list that failed to load keeps the typed number (`fallback`).
import React from "react";
import { useLocation } from "wouter";
import { SearchCombobox } from "@/components/SearchCombobox";
import { trpc } from "@/lib/trpc";

export function UnitJump({ tenantId, projectId, canRead, placeholder, fallback }: { tenantId: string; projectId: string; canRead: boolean; placeholder: string; fallback: React.ReactNode }) {
  const [, navigate] = useLocation();
  const picker = trpc.pmc.progressPicker.useQuery({ tenantId, projectId }, { enabled: Boolean(tenantId && projectId) && canRead, retry: false, staleTime: 60_000 });
  const options = React.useMemo(() => (picker.data?.villas ?? []).map(villa => ({ value: villa.villa, label: villa.villa, description: [villa.block, villa.phase, villa.model].filter(Boolean).join(" · ") })), [picker.data?.villas]);
  if (picker.isError || !options.length) return <>{fallback}</>;
  return <div className="w-44" data-unit-jump><SearchCombobox data-combobox="unit" options={options} onChange={villa => navigate(`/m/${tenantId}/${projectId}/unit/${encodeURIComponent(villa)}`)} placeholder={placeholder} /></div>;
}
