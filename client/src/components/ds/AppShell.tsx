import React, { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as Menu from "@radix-ui/react-dropdown-menu";
import { Building2, Check, ChevronsLeft, ChevronsRight, Languages, LogOut, Menu as MenuIcon, Moon, Sun, X, type LucideIcon } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { LANGUAGES, LANGUAGE_NAMES } from "@/lib/language";
import { cn } from "@/lib/utils";
import { Breadcrumbs, type Crumb } from "./Breadcrumbs";
import { Logo } from "./Logo";
import { Select, type SelectOption } from "./Select";
import { DIRECTIONS, useDirection, type Mode } from "./direction";
import { useDsText } from "./strings";

export type NavItem = { id: string; label: string; icon: LucideIcon; href?: string };

type Props = {
  nav: NavItem[]; activeId: string; onNavigate?: (item: NavItem) => void;
  companies: SelectOption[]; company: string; onCompany: (value: string) => void;
  projects: SelectOption[]; project: string; onProject: (value: string) => void;
  breadcrumbs: Crumb[]; user: { name: string; email: string }; onSignOut?: () => void; onMyCompanies?: () => void;
  mode?: Mode; onModeChange?: (mode: Mode) => void;
  children: React.ReactNode;
};

function Switchers({ companies, company, onCompany, projects, project, onProject, vertical }: Pick<Props, "companies" | "company" | "onCompany" | "projects" | "project" | "onProject"> & { vertical?: boolean }) {
  const text = useDsText();
  return (
    <div className={cn("flex gap-2", vertical ? "flex-col" : "items-center")}>
      <Select aria-label={text.company} options={companies} value={company} onValueChange={onCompany} className={vertical ? "" : "min-h-9 w-52 md:min-h-9"} />
      <Select aria-label={text.project} options={projects} value={project} onValueChange={onProject} className={vertical ? "" : "min-h-9 w-52 md:min-h-9"} />
    </div>
  );
}

function NavList({ nav, activeId, onNavigate, collapsed }: Pick<Props, "nav" | "activeId" | "onNavigate"> & { collapsed?: boolean }) {
  const text = useDsText();
  return (
    <nav aria-label={text.navigation}>
      <ul className="flex flex-col gap-1">
        {nav.map(item => { const active = item.id === activeId; const Icon = item.icon; return (
          <li key={item.id}>
            <a href={item.href ?? "#"} aria-current={active ? "page" : undefined} title={collapsed ? item.label : undefined} onClick={event => { if (onNavigate) { event.preventDefault(); onNavigate(item); } }}
              className={cn("flex min-h-11 items-center gap-3 rounded-[var(--radius)] px-3 text-sm font-medium transition-colors", collapsed && "justify-center px-0", active ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground")}>
              <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
              <span className={collapsed ? "sr-only" : ""}>{item.label}</span>
            </a>
          </li>); })}
      </ul>
    </nav>
  );
}

/** The frame every screen sits in: a top bar (logo, company and project switchers, language, user), a sidebar of icons that folds to a drawer on a phone, and the breadcrumb trail above the content. */
export function AppShell(props: Props) {
  const text = useDsText(); const { language, setLanguage } = useLanguage(); const { direction, mode } = useDirection();
  const [collapsed, setCollapsed] = useState(false); const [drawer, setDrawer] = useState(false);
  const initials = props.user.name.split(" ").map(part => part[0]).slice(0, 2).join("").toUpperCase();
  const canDark = DIRECTIONS[direction].darkMode;
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-card px-3 md:px-4">
        <Dialog.Root open={drawer} onOpenChange={setDrawer}>
          <Dialog.Trigger asChild><button type="button" aria-label={text.menu} className="grid h-11 w-11 place-items-center rounded-[var(--radius)] hover:bg-muted md:hidden"><MenuIcon className="h-5 w-5" aria-hidden="true" /></button></Dialog.Trigger>
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 z-40 bg-foreground/50 md:hidden" />
            <Dialog.Content aria-describedby={undefined} className="fixed inset-y-0 start-0 z-50 flex w-72 max-w-[85vw] flex-col gap-4 border-e border-sidebar-border bg-sidebar p-4 text-sidebar-foreground md:hidden">
              <div className="flex items-center justify-between"><Dialog.Title asChild><span><Logo variant="horizontal" size={28} /></span></Dialog.Title><Dialog.Close aria-label={text.close} className="grid h-11 w-11 place-items-center rounded-[var(--radius)] hover:bg-sidebar-accent"><X className="h-5 w-5" aria-hidden="true" /></Dialog.Close></div>
              <Switchers {...props} vertical />
              <NavList nav={props.nav} activeId={props.activeId} onNavigate={item => { props.onNavigate?.(item); setDrawer(false); }} />
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
        <Logo variant="horizontal" size={28} className="shrink-0" />
        <div className="ms-3 hidden md:block"><Switchers {...props} /></div>
        <div className="ms-auto flex items-center gap-1">
          <Menu.Root>
            <Menu.Trigger aria-label={text.language} className="grid h-11 w-11 place-items-center rounded-[var(--radius)] hover:bg-muted"><Languages className="h-5 w-5" aria-hidden="true" /></Menu.Trigger>
            <Menu.Portal><Menu.Content align="end" sideOffset={6} className="z-50 min-w-40 rounded-[var(--radius)] border border-border bg-popover p-1 text-popover-foreground shadow-lg">
              {LANGUAGES.map(code => <Menu.Item key={code} onSelect={() => setLanguage(code)} className="flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-[calc(var(--radius)-2px)] px-3 text-sm outline-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground"><span>{LANGUAGE_NAMES[code]}</span>{code === language ? <Check className="h-4 w-4" aria-hidden="true" /> : null}</Menu.Item>)}
            </Menu.Content></Menu.Portal>
          </Menu.Root>
          <Menu.Root>
            <Menu.Trigger aria-label={text.userMenu} className="grid h-11 w-11 place-items-center rounded-full bg-accent text-sm font-semibold text-accent-foreground hover:opacity-90"><span aria-hidden="true">{initials}</span></Menu.Trigger>
            <Menu.Portal><Menu.Content align="end" sideOffset={6} className="z-50 min-w-56 rounded-[var(--radius)] border border-border bg-popover p-1 text-popover-foreground shadow-lg">
              <div className="px-3 py-2"><p className="text-sm font-semibold">{props.user.name}</p><p dir="ltr" className="text-xs text-muted-foreground">{props.user.email}</p></div>
              <Menu.Separator className="my-1 h-px bg-border" />
              {canDark && props.onModeChange ? <Menu.Item onSelect={() => props.onModeChange?.(mode === "dark" ? "light" : "dark")} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-[calc(var(--radius)-2px)] px-3 text-sm outline-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground">{mode === "dark" ? <Sun className="h-4 w-4" aria-hidden="true" /> : <Moon className="h-4 w-4" aria-hidden="true" />}{text.theme}: {mode === "dark" ? text.light : text.dark}</Menu.Item> : null}
              {props.onMyCompanies ? <Menu.Item onSelect={() => props.onMyCompanies?.()} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-[calc(var(--radius)-2px)] px-3 text-sm outline-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground"><Building2 className="h-4 w-4" aria-hidden="true" />{text.myCompanies}</Menu.Item> : null}
              <Menu.Item onSelect={() => props.onSignOut?.()} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-[calc(var(--radius)-2px)] px-3 text-sm outline-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground"><LogOut className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />{text.signOut}</Menu.Item>
            </Menu.Content></Menu.Portal>
          </Menu.Root>
        </div>
      </header>
      <div className="flex min-h-0 flex-1">
        <aside className={cn("hidden shrink-0 border-e border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] md:block", collapsed ? "w-[4.5rem]" : "w-60")}>
          <div className="sticky top-14 flex h-[calc(100vh-3.5rem)] flex-col justify-between p-3">
            <NavList nav={props.nav} activeId={props.activeId} onNavigate={props.onNavigate} collapsed={collapsed} />
            <button type="button" onClick={() => setCollapsed(value => !value)} aria-label={collapsed ? text.expand : text.collapse} aria-expanded={!collapsed} className="flex min-h-10 items-center justify-center gap-2 rounded-[var(--radius)] text-sm text-sidebar-foreground/70 hover:bg-sidebar-accent/60">
              {collapsed ? <ChevronsRight className="h-4 w-4 rtl:rotate-180" aria-hidden="true" /> : <ChevronsLeft className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />}{collapsed ? null : <span>{text.collapse}</span>}
            </button>
          </div>
        </aside>
        <main className="min-w-0 flex-1 px-4 py-5 md:px-8 md:py-7"><div className="mx-auto flex max-w-5xl flex-col gap-5 [&>*]:min-w-0"><Breadcrumbs items={props.breadcrumbs} onNavigate={href => props.onNavigate?.({ id: href, label: href, icon: MenuIcon, href })} />{props.children}</div></main>
      </div>
    </div>
  );
}
