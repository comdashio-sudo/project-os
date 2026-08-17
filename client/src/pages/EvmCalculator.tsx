import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { AlertTriangle, Calculator, ChevronRight, TrendingDown, TrendingUp } from "lucide-react";
import { useState } from "react";
import { Link } from "wouter";

type Values = { pv: string; ev: string; ac: string; bac: string; manualEac: string; eacMethod: "bac_over_cpi" | "ac_plus_remaining" | "ac_plus_remaining_over_cpi_spi" | "manual" };

const initialValues: Values = { pv: "", ev: "", ac: "", bac: "", manualEac: "", eacMethod: "bac_over_cpi" };
const metricLabels = ["PV", "EV", "AC", "CV", "SV", "CPI", "SPI", "EAC", "ETC", "VAC", "TCPI"] as const;

export default function EvmCalculator() {
  const [values, setValues] = useState<Values>(initialValues);
  const [submitted, setSubmitted] = useState(false);
  const input = {
    pv: Number(values.pv), ev: Number(values.ev), ac: Number(values.ac), bac: Number(values.bac),
    eacMethod: values.eacMethod,
    ...(values.eacMethod === "manual" ? { manualEac: Number(values.manualEac) } : {}),
  };
  const query = trpc.controls.calculateEvm.useQuery(input, { enabled: submitted && Object.values(input).every(value => typeof value !== "number" || Number.isFinite(value)) });
  const update = (key: keyof Values, value: string) => setValues(current => ({ ...current, [key]: value }));
  const metricValue = (key: (typeof metricLabels)[number]) => {
    const value = query.data?.[key.toLowerCase() as keyof typeof query.data];
    return typeof value === "number" ? value.toLocaleString(undefined, { maximumFractionDigits: 2 }) : "—";
  };

  return <div className="min-h-screen bg-[#f4f6f8] text-slate-900">
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight"><span className="grid h-8 w-8 place-items-center rounded-lg bg-[#123a4a] text-white">P</span> PROJECT OS</Link>
        <div className="text-sm font-medium text-slate-500">Level 2 · Project Controls</div>
      </div>
    </header>
    <main className="mx-auto max-w-7xl px-5 py-10">
      <Link href="/" className="mb-8 inline-flex items-center gap-1 text-sm font-medium text-[#0e6b70] hover:underline">Workspace <ChevronRight className="h-4 w-4" /> EVM</Link>
      <div className="grid gap-8 lg:grid-cols-[430px_1fr]">
        <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <div className="mb-7 flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-[#e6f4f3] text-[#0e6b70]"><Calculator className="h-5 w-5" /></span><div><h1 className="text-xl font-semibold">Earned Value Engine</h1><p className="text-sm text-slate-500">Centralized, tested project-control calculation.</p></div></div>
          <div className="space-y-4">
            {([['pv','PV — Planned Value'],['ev','EV — Earned Value'],['ac','AC — Actual Cost'],['bac','BAC — Budget at Completion']] as const).map(([key,label]) => <div key={key}><Label htmlFor={key}>{label}</Label><Input id={key} className="mt-1.5" type="number" min="0" step="0.01" value={values[key]} onChange={event => update(key, event.target.value)} /></div>)}
            <div><Label>EAC Method</Label><Select value={values.eacMethod} onValueChange={value => update("eacMethod", value)}><SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="bac_over_cpi">BAC / CPI</SelectItem><SelectItem value="ac_plus_remaining">AC + (BAC − EV)</SelectItem><SelectItem value="ac_plus_remaining_over_cpi_spi">AC + (BAC − EV) / (CPI × SPI)</SelectItem><SelectItem value="manual">Approved Manual EAC</SelectItem></SelectContent></Select></div>
            {values.eacMethod === "manual" && <div><Label htmlFor="manualEac">Manual EAC</Label><Input id="manualEac" className="mt-1.5" type="number" min="0" step="0.01" value={values.manualEac} onChange={event => update("manualEac", event.target.value)} /></div>}
            <Button className="mt-2 w-full bg-[#123a4a] hover:bg-[#0d2e3b]" onClick={() => setSubmitted(true)}>Calculate EVM</Button>
          </div>
        </section>
        <section className="space-y-6">
          <div><p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#0e6b70]">Control outcome</p><h2 className="mt-2 text-3xl font-semibold tracking-tight">Cost and schedule performance</h2></div>
          {query.isError ? <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950"><AlertTriangle className="mb-2 h-5 w-5" />{query.error.message}</div> : null}
          {!submitted ? <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-8 py-16 text-center text-slate-500">Enter actual project-control values to calculate a decision-ready EVM view.</div> : query.isLoading ? <div className="rounded-2xl bg-white px-8 py-16 text-center text-slate-500">Calculating central EVM metrics…</div> : query.data ? <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{metricLabels.map(metric => <article key={metric} className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200"><p className="text-xs font-bold tracking-[0.16em] text-slate-500">{metric}</p><p className="mt-3 text-2xl font-semibold tabular-nums">{metricValue(metric)}</p></article>)}</div>
            <div className={`rounded-2xl p-6 ${query.data.cpi !== null && query.data.cpi < .9 || query.data.spi !== null && query.data.spi < .9 ? 'bg-[#fff5ee] text-[#7b341e]' : 'bg-[#eaf6f0] text-[#14532d]'}`}><div className="flex items-start gap-3">{query.data.cpi !== null && query.data.cpi < .9 || query.data.spi !== null && query.data.spi < .9 ? <TrendingDown className="mt-0.5 h-5 w-5" /> : <TrendingUp className="mt-0.5 h-5 w-5" />}<div><h3 className="font-semibold">Management guidance</h3><p className="mt-2 text-sm leading-6">{query.data.meaning}</p><p className="mt-3 text-sm font-medium">Recommended action: {query.data.recommendedAction}</p></div></div></div>
          </> : null}
        </section>
      </div>
    </main>
  </div>;
}
