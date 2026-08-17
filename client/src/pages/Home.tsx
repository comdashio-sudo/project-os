import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { startLogin } from "@/const";
import { trpc } from "@/lib/trpc";
import { ArrowUpRight, Building2, CircleAlert, Layers3, LineChart, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { Link } from "wouter";

type PackageCode = "EXECUTIVE" | "PMO" | "PROJECT" | "EXECUTIVE + PMO" | "PMO + PROJECT" | "EXECUTIVE + PROJECT" | "ALL-IN-ONE";
const packages: PackageCode[] = ["EXECUTIVE", "PMO", "PROJECT", "EXECUTIVE + PMO", "PMO + PROJECT", "EXECUTIVE + PROJECT", "ALL-IN-ONE"];

function GuestLanding() {
  return (
    <main className="min-h-screen bg-[#102f3e] px-5 py-8 text-white">
      <div className="mx-auto flex max-w-7xl items-center justify-between">
        <div className="flex items-center gap-2 font-semibold"><span className="grid h-8 w-8 place-items-center rounded-lg bg-[#3ab5a3] text-[#102f3e]">P</span>PROJECT OS</div>
        <Button variant="outline" className="border-white/30 bg-transparent text-white hover:bg-white/10 hover:text-white" onClick={() => startLogin()}>Sign in</Button>
      </div>
      <section className="mx-auto grid max-w-7xl gap-12 py-24 lg:grid-cols-[1.2fr_.8fr]">
        <div>
          <p className="font-medium text-[#74d0c1]">ENTERPRISE PROJECT OPERATING SYSTEM</p>
          <h1 className="mt-5 max-w-3xl text-5xl font-semibold leading-[1.08] tracking-tight">Control complex delivery. See exceptions before they become losses.</h1>
          <p className="mt-7 max-w-2xl text-lg leading-8 text-slate-300">A tenant-isolated operating layer for EXECUTIVE, PMO and PROJECT teams, with central EVM controls and commercial boundaries enforced behind the interface.</p>
          <Button className="mt-10 bg-[#3ab5a3] text-[#102f3e] hover:bg-[#82ddcf]" onClick={() => startLogin()}>Enter secure workspace <ArrowUpRight className="ml-2 h-4 w-4" /></Button>
        </div>
        <div className="grid gap-4">
          <div className="rounded-2xl bg-white/10 p-6 backdrop-blur"><ShieldCheck className="h-5 w-5 text-[#74d0c1]" /><p className="mt-5 font-semibold">Tenant isolation</p><p className="mt-2 text-sm leading-6 text-slate-300">Membership, entitlement and scope are checked before protected access.</p></div>
          <div className="rounded-2xl bg-white/10 p-6 backdrop-blur"><LineChart className="h-5 w-5 text-[#74d0c1]" /><p className="mt-5 font-semibold">Central EVM engine</p><p className="mt-2 text-sm leading-6 text-slate-300">PV, EV, AC, CPI, SPI, EAC, ETC and VAC are calculated once and tested.</p></div>
        </div>
      </section>
    </main>
  );
}

export default function Home() {
  const { user, loading, isAuthenticated, logout } = useAuth();
  const tenants = trpc.tenant.mine.useQuery(undefined, { enabled: isAuthenticated });
  const createTenant = trpc.tenant.create.useMutation({ onSuccess: () => tenants.refetch() });
  const [legalName, setLegalName] = useState("");
  const [slug, setSlug] = useState("");
  const [packageCode, setPackageCode] = useState<PackageCode>("ALL-IN-ONE");

  if (loading) return <GuestLanding />;
  if (!user) return <GuestLanding />;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    createTenant.mutate({ legalName, slug, packageCode });
  };

  return (
    <main className="min-h-screen bg-[#f4f6f8] text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4">
          <div className="flex items-center gap-2 font-semibold"><span className="grid h-8 w-8 place-items-center rounded-lg bg-[#123a4a] text-white">P</span>PROJECT OS</div>
          <div className="flex items-center gap-4 text-sm"><span className="hidden text-slate-500 sm:block">{user.name ?? user.email}</span><Button variant="ghost" onClick={logout}>Sign out</Button></div>
        </div>
      </header>
      <div className="mx-auto max-w-7xl px-5 py-10">
        <section className="flex flex-col justify-between gap-6 rounded-3xl bg-[#123a4a] p-8 text-white lg:flex-row lg:items-end">
          <div><p className="text-sm font-semibold tracking-[.16em] text-[#74d0c1]">YOUR OPERATING WORKSPACE</p><h1 className="mt-3 text-3xl font-semibold tracking-tight">Enterprise projects, governed by design.</h1><p className="mt-3 max-w-2xl text-slate-300">Create an isolated company workspace and activate only the operating levels your organization licenses.</p></div>
          <Link href="/evm" className="inline-flex items-center gap-2 font-medium text-[#74d0c1] hover:text-white">Open EVM engine <ArrowUpRight className="h-4 w-4" /></Link>
        </section>

        {tenants.isLoading ? <p className="py-12 text-slate-500">Loading organization access…</p> : null}
        {tenants.data?.length ? (
          <section className="mt-8">
            <div className="mb-4 flex items-center gap-2"><Building2 className="h-5 w-5 text-[#0e6b70]" /><h2 className="text-xl font-semibold">Organizations</h2></div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {tenants.data.map(tenant => <article key={tenant.tenantId} className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200"><p className="text-xs font-bold tracking-[.14em] text-slate-500">{tenant.status.toUpperCase()}</p><h3 className="mt-3 text-xl font-semibold">{tenant.legalName}</h3><p className="mt-1 text-sm text-slate-500">{tenant.slug}</p><div className="mt-6 flex flex-wrap gap-2">{tenant.products.map(product => <span key={product} className="rounded-full bg-[#e6f4f3] px-2.5 py-1 text-xs font-semibold text-[#0e6b70]">{product}</span>)}</div>{tenant.products.includes("PROJECT") ? <Link href={`/projects/${tenant.tenantId}`} className="mt-6 inline-flex text-sm font-semibold text-[#0e6b70] hover:underline">Open project registry <ArrowUpRight className="ml-1 h-4 w-4" /></Link> : null}</article>)}
            </div>
          </section>
        ) : null}
        {!tenants.isLoading && !tenants.data?.length ? (
          <section className="mt-8 grid gap-8 lg:grid-cols-[1fr_400px]">
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8"><Layers3 className="h-6 w-6 text-[#0e6b70]" /><h2 className="mt-5 text-2xl font-semibold">Start with your company boundary</h2><p className="mt-3 max-w-xl leading-7 text-slate-600">An organization is the data-isolation boundary. Creating it provisions the selected product entitlements and assigns you the Tenant Owner role.</p><div className="mt-6 flex gap-3 rounded-xl bg-amber-50 p-4 text-sm text-amber-900"><CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />This action creates a real workspace and an active subscription record. Use your intended organization name and slug.</div></div>
            <form className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200" onSubmit={submit}>
              <h2 className="text-lg font-semibold">Create organization</h2>
              <div className="mt-5 space-y-4">
                <div><Label htmlFor="legalName">Legal name</Label><Input id="legalName" className="mt-1.5" value={legalName} onChange={event => setLegalName(event.target.value)} required /></div>
                <div><Label htmlFor="slug">Workspace slug</Label><Input id="slug" className="mt-1.5" pattern="[a-z0-9]+(-[a-z0-9]+)*" value={slug} onChange={event => setSlug(event.target.value.toLowerCase())} required /></div>
                <div><Label>Product package</Label><Select value={packageCode} onValueChange={value => setPackageCode(value as PackageCode)}><SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger><SelectContent>{packages.map(value => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></div>
                {createTenant.error ? <p className="text-sm text-red-700">{createTenant.error.message}</p> : null}
                <Button className="w-full bg-[#123a4a] hover:bg-[#0d2e3b]" disabled={createTenant.isPending}>{createTenant.isPending ? "Creating secure workspace…" : "Create workspace"}</Button>
              </div>
            </form>
          </section>
        ) : null}
      </div>
    </main>
  );
}
