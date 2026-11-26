import React, { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as Menu from "@radix-ui/react-dropdown-menu";
import * as RadixSelect from "@radix-ui/react-select";
import { Building2, Check, ChevronDown, ChevronsLeft, ChevronsRight, Languages, LogOut, Menu as MenuIcon, Moon, Sun, X, type LucideIcon } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { LANGUAGES, LANGUAGE_NAMES } from "@/lib/language";
import { cn } from "@/lib/utils";
import { Breadcrumbs, type Crumb } from "./Breadcrumbs";
import { Logo } from "./Logo";
import { Select, type SelectOption } from "./Select";
import { DIRECTIONS, useDirection, type Mode } from "./direction";
import { useDsText } from "./strings";

/** `group`: the heading of the group the item belongs to (Q-36); a heading is drawn where it changes. `section` (Q-59 1): a part of the group that
 *  folds — its title is a button, the person's choice is remembered on this device, and the section holding the open page is always open. */
export type NavItem = { id: string; label: string; icon: LucideIcon; href?: string; group?: string; section?: { key: string; title: string } };

const FOLDED_KEY = "dashio.nav.folded";
function readFolded(): string[] { try { const value = JSON.parse(window.localStorage.getItem(FOLDED_KEY) ?? "[]"); return Array.isArray(value) ? value.filter((key): key is string => typeof key === "string") : []; } catch { return []; } }
function writeFolded(keys: string[]) { try { window.localStorage.setItem(FOLDED_KEY, JSON.stringify(keys)); } catch { /* storage refused: the choice lasts for this visit */ } }

type Props = {
  nav: NavItem[]; activeId: string; onNavigate?: (item: NavItem) => void;
  companies: SelectOption[]; company: string; onCompany: (value: string) => void;
  projects: SelectOption[]; project: string; onProject: (value: string) => void;
  /** Q-57: the page's buttons (export, print), drawn beside the breadcrumb and left off the paper. */
  actions?: React.ReactNode;
  /** Q-57: drawn on paper only, above the page. */
  printHeader?: React.ReactNode;
  breadcrumbs: Crumb[]; user: { name: string; email: string }; onSignOut?: () => void; onMyCompanies?: () => void;
  mode?: Mode; onModeChange?: (mode: Mode) => void;
  children: React.ReactNode;
  /** Q-59 (5): on a phone, a bar at the foot of the screen with the site's daily pages and «More» (the menu); none on a wider screen */
  bottomBar?: { items: NavItem[]; moreLabel: string };
  /** Q-59 (3): tools at the start of the top bar's actions (the quick search) */
  headerTools?: React.ReactNode;
};

/** Q-54: a switcher on the dark menu — a dark card (#151B3A, edge #1C2350) with a small label over the chosen name, as the approved reference draws it; never the
 * light form field (white on the dark menu, and in Safari the field's placeholder showed under the value). The name is written from the options, not by Radix. */
export function SidebarSwitcher({ label, options, value, onValueChange }: { label: string; options: SelectOption[]; value: string; onValueChange: (value: string) => void }) {
  const chosen = options.find(option => option.value === value)?.label;
  return (
    <RadixSelect.Root value={value || undefined} onValueChange={onValueChange}>
      <RadixSelect.Trigger aria-label={label} data-sidebar-switcher className="flex min-h-[52px] w-full items-center justify-between gap-2 rounded-[12px] border border-sidebar-accent bg-sidebar-surface px-3 py-2 text-start text-sidebar-accent-foreground outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring">
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="text-[11px] leading-4 text-sidebar-foreground/70">{label}</span>
          <span className="truncate text-sm font-semibold leading-5">{chosen ?? "—"}</span>
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-sidebar-foreground/70" aria-hidden="true" />
      </RadixSelect.Trigger>
      <RadixSelect.Portal>
        <RadixSelect.Content position="popper" sideOffset={4} className="z-[60] max-h-72 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-[12px] border border-sidebar-accent bg-sidebar-surface text-sidebar-accent-foreground shadow-lg">
          <RadixSelect.Viewport className="p-1">
            {options.map(option => (
              <RadixSelect.Item key={option.value} value={option.value} className="relative flex min-h-11 cursor-pointer select-none items-center rounded-[10px] py-2 ps-8 pe-3 text-sm outline-none data-[highlighted]:bg-sidebar-accent">
                <RadixSelect.ItemIndicator className="absolute start-2"><Check className="h-4 w-4" aria-hidden="true" /></RadixSelect.ItemIndicator>
                <RadixSelect.ItemText>{option.label}</RadixSelect.ItemText>
              </RadixSelect.Item>
            ))}
          </RadixSelect.Viewport>
        </RadixSelect.Content>
      </RadixSelect.Portal>
    </RadixSelect.Root>
  );
}

function NavList({ nav, activeId, onNavigate, collapsed }: Pick<Props, "nav" | "activeId" | "onNavigate"> & { collapsed?: boolean }) {
  const text = useDsText();
  const [folded, setFolded] = useState<string[]>(() => (typeof window === "undefined" ? [] : readFolded()));
  const activeSection = nav.find(item => item.id === activeId)?.section?.key;
  const isFolded = (key: string) => folded.includes(key) && key !== activeSection;
  const toggle = (key: string) => setFolded(current => { const next = current.includes(key) ? current.filter(item => item !== key) : [...current, key]; writeFolded(next); return next; });
  return (
    <nav aria-label={text.navigation}>
      <ul className="flex flex-col gap-1">
        {nav.map((item, index) => { const active = item.id === activeId; const Icon = item.icon; const heading = item.group && item.group !== nav[index - 1]?.group ? item.group : null;
          const section = item.section; const sectionStart = section && (heading || section.key !== nav[index - 1]?.section?.key) ? section : null;
          // a folded section shows its title only (in the narrow menu, where titles are hidden, nothing folds)
          if (section && isFolded(section.key) && !collapsed && !sectionStart) return null;
          return (
          <li key={item.id}>
            {heading ? <p className={cn("truncate px-3 pb-1.5 text-[11px] font-medium tracking-wide text-sidebar-foreground/60", index > 0 && "mt-4", collapsed && "sr-only")} data-nav-group>{heading}</p> : null}
            {sectionStart && !collapsed ? <button type="button" data-nav-section={sectionStart.key} aria-expanded={!isFolded(sectionStart.key)} onClick={() => toggle(sectionStart.key)}
              className="mt-1 flex min-h-11 w-full items-center justify-between gap-2 rounded-[var(--radius)] px-3 text-start text-xs font-semibold text-sidebar-foreground/80 hover:bg-sidebar-accent/60">
              <span className="truncate">{sectionStart.title}</span><ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform", isFolded(sectionStart.key) && "-rotate-90 rtl:rotate-90")} aria-hidden="true" />
            </button> : null}
            {section && isFolded(section.key) && !collapsed ? null : <>
            <a href={item.href ?? "#"} aria-current={active ? "page" : undefined} title={collapsed ? item.label : undefined} onClick={event => { if (onNavigate) { event.preventDefault(); onNavigate(item); } }}
              className={cn("flex min-h-11 items-center gap-3 rounded-[var(--radius)] px-3 text-sm font-medium transition-colors", collapsed && "justify-center px-0", active ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground")}>
              <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
              <span className={collapsed ? "sr-only" : ""}>{item.label}</span>
              {active && !collapsed ? <span aria-hidden="true" data-nav-active-mark className="ms-auto h-2 w-2 shrink-0 rounded-full bg-sidebar-mark" /> : null}
            </a></>}
          </li>); })}
      </ul>
    </nav>
  );
}

function UserCard({ user, initials }: { user: { name: string; email: string }; initials: string }) {
  return (
    <div className="shrink-0 border-t border-sidebar-border px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]" data-mobile-menu-user>
      <div className="flex items-center gap-3 rounded-[12px] bg-sidebar-surface p-3">
        <span aria-hidden="true" className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-sidebar-accent text-sm font-semibold text-sidebar-accent-foreground">{initials}</span>
        <span className="flex min-w-0 flex-col"><span className="truncate text-sm font-semibold text-sidebar-accent-foreground">{user.name}</span><span dir="ltr" className="truncate text-start text-[11px] text-sidebar-foreground/70">{user.email}</span></span>
      </div>
    </div>
  );
}

/** The frame every screen sits in: a top bar (logo, company and project switchers, language, user), a sidebar of icons that folds to a drawer on a phone, and the breadcrumb trail above the content. */
export function AppShell(props: Props) {
  const text = useDsText(); const { language, setLanguage } = useLanguage(); const { direction, mode } = useDirection();
  const [collapsed, setCollapsed] = useState(false); const [drawer, setDrawer] = useState(false);
  const initials = props.user.name.split(" ").map(part => part[0]).slice(0, 2).join("").toUpperCase();
  const canDark = DIRECTIONS[direction].darkMode;
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground print:block print:min-h-0">
      <header className="sticky top-0 z-30 print:hidden flex h-14 items-center gap-2 border-b border-border bg-card px-3 md:px-4">
        <Dialog.Root open={drawer} onOpenChange={setDrawer}>
          <Dialog.Trigger asChild><button type="button" aria-label={text.menu} className="grid h-11 w-11 place-items-center rounded-[var(--radius)] hover:bg-muted md:hidden"><MenuIcon className="h-5 w-5" aria-hidden="true" /></button></Dialog.Trigger>
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 z-40 bg-foreground/50 md:hidden" />
            <Dialog.Content aria-describedby={undefined} data-mobile-menu className="fixed inset-y-0 start-0 z-50 flex h-[100dvh] w-72 max-w-[85vw] flex-col border-e border-sidebar-border bg-sidebar text-sidebar-foreground md:hidden">
              {/* Q-54: clear of the notch and of Safari's bars (safe areas), the list scrolls inside, the person's card stays at the foot */}
              <div className="flex shrink-0 items-center justify-between gap-2 px-4 pb-3 pt-[max(1rem,env(safe-area-inset-top))]"><Dialog.Title asChild><span className="min-w-0"><Logo variant="horizontal" size={28} onDark /></span></Dialog.Title><Dialog.Close aria-label={text.close} className="grid h-11 w-11 shrink-0 place-items-center rounded-[var(--radius)] hover:bg-sidebar-accent"><X className="h-5 w-5" aria-hidden="true" /></Dialog.Close></div>
              <div className="flex shrink-0 flex-col gap-2 border-b border-sidebar-border px-4 pb-4">
                <SidebarSwitcher label={text.company} options={props.companies} value={props.company} onValueChange={props.onCompany} />
                {props.projects.length ? <SidebarSwitcher label={text.project} options={props.projects} value={props.project} onValueChange={props.onProject} /> : null}
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4" data-mobile-menu-list>
                <NavList nav={props.nav} activeId={props.activeId} onNavigate={item => { props.onNavigate?.(item); setDrawer(false); }} />
              </div>
              <UserCard user={props.user} initials={initials} />
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
        <Logo variant="horizontal" size={28} className="shrink-0 md:hidden" />
        <div className="hidden md:block"><Select aria-label={text.project} options={props.projects} value={props.project} onValueChange={props.onProject} className="min-h-9 w-56 md:min-h-9" /></div>
        <div className="ms-auto flex items-center gap-1">
          {props.headerTools}
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
        <aside data-app-sidebar className={cn("hidden shrink-0 print:!hidden border-e border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] md:block", collapsed ? "w-[4.5rem]" : "w-60")}>
          <div className="sticky top-14 flex h-[calc(100vh-3.5rem)] flex-col justify-between gap-3 p-3">
            <div className="flex min-h-0 flex-col gap-4 overflow-y-auto [&>*]:shrink-0">{/* Q-54: in a scrolling column the head must not shrink (it did, and the project heading drew over the company switcher) */}
              {/* Q-19 (2): the logo on dark and the company switcher head the dark menu */}
              <div className={cn("flex flex-col gap-3 border-b border-sidebar-border pb-3", collapsed && "items-center")} data-sidebar-head>
                <Logo variant={collapsed ? "symbol" : "horizontal"} size={28} className="shrink-0" onDark />
                {collapsed ? null : <SidebarSwitcher label={text.company} options={props.companies} value={props.company} onValueChange={props.onCompany} />}
              </div>
              <NavList nav={props.nav} activeId={props.activeId} onNavigate={props.onNavigate} collapsed={collapsed} />
            </div>
            {/* Q-54: the person's card at the foot of the dark menu, as the reference draws it (folded: the initials only) */}
            {collapsed ? <span aria-hidden="true" title={props.user.name} className="mx-auto grid h-9 w-9 shrink-0 place-items-center rounded-full bg-sidebar-accent text-sm font-semibold text-sidebar-accent-foreground" data-sidebar-user>{initials}</span>
              : <div className="flex shrink-0 items-center gap-3 rounded-[12px] bg-sidebar-surface p-3" data-sidebar-user><span aria-hidden="true" className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-sidebar-accent text-sm font-semibold text-sidebar-accent-foreground">{initials}</span><span className="flex min-w-0 flex-col"><span className="truncate text-sm font-semibold text-sidebar-accent-foreground">{props.user.name}</span><span dir="ltr" className="truncate text-start text-[11px] text-sidebar-foreground/70">{props.user.email}</span></span></div>}
            <button type="button" onClick={() => setCollapsed(value => !value)} aria-label={collapsed ? text.expand : text.collapse} aria-expanded={!collapsed} className="flex min-h-10 items-center justify-center gap-2 rounded-[var(--radius)] text-sm text-sidebar-foreground/70 hover:bg-sidebar-accent/60">
              {collapsed ? <ChevronsRight className="h-4 w-4 rtl:rotate-180" aria-hidden="true" /> : <ChevronsLeft className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />}{collapsed ? null : <span>{text.collapse}</span>}
            </button>
          </div>
        </aside>
        <main className={cn("min-w-0 flex-1 px-4 py-5 md:px-8 md:py-7 print:p-0", props.bottomBar?.items.length && "pb-24 md:pb-7")}><div className="mx-auto flex max-w-5xl flex-col gap-5 print:max-w-none [&>*]:min-w-0">
          {props.printHeader}
          <div className="flex flex-wrap items-center justify-between gap-3 print:hidden" data-page-toolbar-row><Breadcrumbs items={props.breadcrumbs} onNavigate={href => props.onNavigate?.({ id: href, label: href, icon: MenuIcon, href })} />{props.actions}</div>
          <div data-page-content className="flex min-w-0 flex-col gap-5 [&>*]:min-w-0">{props.children}</div>
        </div></main>
      </div>
      {props.bottomBar?.items.length ? (
        <nav aria-label={props.bottomBar.moreLabel} data-bottom-bar className="fixed inset-x-0 bottom-0 z-30 grid border-t border-border bg-card pb-[env(safe-area-inset-bottom)] md:hidden print:hidden" style={{ gridTemplateColumns: `repeat(${props.bottomBar.items.length + 1}, minmax(0, 1fr))` }}>
          {props.bottomBar.items.map(item => { const Icon = item.icon; const active = item.id === props.activeId; return (
            <a key={item.id} href={item.href ?? "#"} data-bottom-item={item.id} aria-current={active ? "page" : undefined} onClick={event => { if (props.onNavigate) { event.preventDefault(); props.onNavigate(item); } }}
              className={cn("flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 text-[11px] font-medium", active ? "text-primary" : "text-muted-foreground")}>
              <Icon className="h-5 w-5" aria-hidden="true" /><span className="max-w-full truncate">{item.label}</span>
            </a>); })}
          <button type="button" data-bottom-more onClick={() => setDrawer(true)} className="flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 text-[11px] font-medium text-muted-foreground">
            <MenuIcon className="h-5 w-5" aria-hidden="true" /><span>{props.bottomBar.moreLabel}</span>
          </button>
        </nav>
      ) : null}
    </div>
  );
}
