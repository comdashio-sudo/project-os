# GAP_LIST — ما هو موعود في أوامر العمل وغير موجود في الكود

**أُعدّت:** 15 أكتوبر 2026، من قراءة أوامر العمل (`WORK_ORDER_*.md`) ووثائق القبول (`ACCEPTANCE_CRITERIA.md` و`MASTER_PLAN.md` و`MODULE_MAP.md` و`PROJECT_MANAGER_COMMAND_CENTER.md` و`IMPLEMENTATION_PLAN.md`) مقابل الشيفرة على `main` عند `4cdf322` (لقطة، ما بعدها لم يمسّ هذه المجالات: الأصول والتخزين والدخول والـLLM).

**كيف تُقرأ:**

- لا تُدرج هنا إلا الصفوف `PARTIAL` و`MISSING`. ما هو موجود **وله اختبار أو مسار واجهة** يظهر عدّادًا في القسم F فقط.
- كل صف `PARTIAL` أو `MISSING` يذكر ما بُحث عنه (ملف وسطر أو نمط البحث)، لا حكمًا مجردًا.
- «Live DB = yes» تعني أن إثباته يحتاج قاعدة حية (مشغّل التكامل).
- الحجم: S أقل من يوم، M من يوم إلى ثلاثة، L أكثر من ثلاثة.
- هذا السجل **تشخيص لا التزام**: لا يعني أن كل صف سيُنفَّذ؛ الأولويات قرار المالك، وما بُني بعد اللقطة يُسجَّل في قسم «ما أُغلق بعد اللقطة» في آخره.
- الأحرف الإنجليزية في الجداول مقصودة (مصطلحات وأسماء ملفات)؛ الوصف المنقول من أمر العمل بالعربية كما كُتب.


Snapshot: origin/main @ 4cdf322 (later commits 1f3d485 brand assets, b89d9e8 R2 storage touch only client/public/brand, storage.ts, env.ts, BrandMark, docs - none of the areas below). Read from `git archive` extracted to scratchpad; nothing executed, no DB, no tests run.
Legend: PARTIAL = something exists, missing part stated. MISSING = searched, nothing found (search terms in Evidence). "Live DB" = needs the TiDB integration runner to prove (work-order gate). Size S <1d, M 1-3d, L >3d.
PRESENT = implementation located + a test or visible UI path located by name (not re-run). "file:line" in docs = line numbers of the doc as printed by `cat -n`.

## A. WORK_ORDER_PROJECT_PL.md (fine-grained) - 0 rows fully present; the shipped `/profitability` page is a proxy (see G-007, G-012, G-040)

| ID | Source | Promise | Status | Evidence / what was searched | Live DB | Size |
|---|---|---|---|---|---|---|
| G-001 | PL:25-29 | Adjusted contract value = original contract + APPROVED change orders only, computed not stored | MISSING | grep -i "fpac\|adjusted" server/ client/ -> only UI labels. Sources exist but unjoined: `projects.contractValue` (schema.ts:~702, stored/editable), `change_requests.impactCost` (schema.ts:1142-1160: a COST impact, no contractId, no price-variation field). `contracts` (schema.ts:718) has no client-vs-subcontract flag, so "the original contract" is not identifiable. Page uses BOQ qty x rate instead (ProjectProfitability.tsx:22). | yes | M |
| G-002 | PL:30 | EAC taken from existing EVM engine, no new formula | PARTIAL | Engine exists (`calculateEvm` evm.ts:42, `evm_snapshots.eac` schema.ts:1297-1319) but page never reads it: `forecast = actual + committed` (ProjectProfitability.tsx:24). | yes | M |
| G-003 | PL:31 | FPAC = adjusted contract - EAC | MISSING | No computation anywhere (grep -ri fpac server/ shared/ drizzle/ = 0; client = labels only). | yes | M |
| G-004 | PL:35 | Profit margin % = FPAC / adjusted contract | MISSING | same grep. | no | S |
| G-005 | PL:36 | Originally planned profit = original contract - BAC | MISSING | BAC inputs exist (`budget_lines.originalAmount` schema.ts:1249, `evm_snapshots.bac`); no use. | no | S |
| G-006 | PL:37 | Profit variance = FPAC - planned profit | MISSING | same. | no | S |
| G-007 | PL:39 | Every number shows formula + data source + date in its own row | PARTIAL | Only a single formula paragraph and source row-counts (ProjectProfitability.tsx `formula`, `sources`); no as-of date per figure. Formula+date exist for SPI/CPI/EAC in PMO (PmoDashboard.tsx:24-25). | no | S |
| G-008 | PL:45 | Monthly profitability snapshot by EXTENDING evm_snapshots (FPAC + components) | MISSING | evm_snapshots has no contract/FPAC columns; snapshots only captured by manual button (db.ts:2769, 2793); only scheduled job is licence expiry (scheduledLicenseExpiry.ts) - no monthly job. | yes | M |
| G-009 | PL:46 | Movement since last snapshot (value and %) | MISSING | no snapshot history of FPAC to diff. | yes | S |
| G-010 | PL:47 | WBS-level movement: EAC_now - EAC_last per WBS, sorted by abs, top 3-5 up and down | MISSING | evm_snapshots is project-level only; `calculateOperationalEvm` (operationalEvm.ts:43) has no per-WBS EAC; BAC is a project sum of budget lines. GRN cost entry carries no wbsItemId (db.ts:1970) so material receipts would be invisible per-WBS. Conflicts with PL:45 "no new snapshot mechanism" (see H-2). | yes | L |
| G-011 | PL:48 | FPAC curve across snapshots | MISSING | recharts available (package.json:81), no FPAC series. | no | S |
| G-012 | PL:54 | Open commitment = PO value - received/invoiced, shown next to FPAC | PARTIAL | Label "Open commitments" is actually sum of ALL subcontract `contractValue` (ProjectProfitability.tsx:21); POs ignored. True open commitment (commitment.amount - sum(GRN received x unitCost)) exists only inside the GRN transaction (db.ts:1965; BATCH_2_10 doc), no read path. | yes | M |
| G-013 | PL:55 | Project net cash flow from existing cash-flow engine | PARTIAL | cashFlow.ts:7-14 = budget/actual/commitments "exposure" - no receipts/payments, so no NET cash flow; also not wired into the page. It adds full commitment.amount to actual (double-counts received goods). | yes | M |
| G-014 | PL:56 | Explicit warning when profit > 0 and cash flow < 0 | MISSING | grep for the condition: none. | no | S |
| G-015 | PL:60-65 | Loaded hourly labour cost = (basic+allowances+GOSI+accrued EOS+tenant indirects) / actual working hours, derived from 6.c | PARTIAL | payroll.ts:29 `laborActualCost = gross + eosMonthlyAccrual`; GOSI modelled only as employee deduction (payroll.ts:27); no indirects; no /hours. Time-entry cost uses `project_resources.unitCost` (db.ts:2132), not payroll. | yes | M |
| G-016 | PL:67 | Loading factor displayed and tenant-configurable, not buried in code | MISSING | `companies` (schema.ts:39-51) has no settings; no tenant-config table anywhere. | yes | M |
| G-017 | PL:73-75 | Confidence indicator: last update per source (progress/materials/labour) | MISSING | grep "freshness\|lastUpdated\|stale" client/ server/ = 0 (only PMO snapshot date). | no | M |
| G-018 | PL:76 | % of WBS items with progress updated within 7 days | MISSING | `progress_entries.measuredAt` exists (schema.ts:1281) but no metric. | yes | S |
| G-019 | PL:77 | Localized warning on the figure when data is stale | MISSING | none. | no | S |
| G-020 | PL:78 | Direct link to the stalest source within permitted path | MISSING | none. | no | S |
| G-021 | PL:84-85 | Drill-down FPAC -> top 5 WBS items by variance | MISSING | no endpoint/UI. | yes | M |
| G-022 | PL:86 | Inside item: materials / labour / subcontract / other | MISSING | `cost_entries` (schema.ts:1265-1278) has no category or source-type column. Needs migration + backfill. | yes | M |
| G-023 | PL:87-88 | Down to source document (PO, material issue, payroll, invoice) | PARTIAL | Forward pointers exist (grn.costEntryId, material_issues.costEntryId, payroll_allocations.costEntryId, time_entries.costEntryId); no reverse pointer on cost_entries and no UI. | yes | M |
| G-024 | PL:91 | Every drill level shows planned, actual, committed, forecast, variance | MISSING | none. | yes | M |
| G-025 | PL:95 | FPAC per project, then portfolio and programme total | MISSING | Executive dashboard (routers.ts:167-195) aggregates cash flow by project/portfolio, not FPAC. | yes | M |
| G-026 | PL:96 | Default order: losing / heading-to-loss projects first | MISSING | none. | no | S |
| G-027 | PL:97 | One movement-since-snapshot column with colour and direction | MISSING | none. | no | S |
| G-028 | PL:98 | Enforce entitlement + scope: manager sees only in-scope projects | PARTIAL | Generic scope/entitlement enforced on the 4 queries the page calls; no FPAC aggregation endpoint; no PROFITABILITY feature in `defaultCommercialFeatures` (db.ts:253-262). | yes | S |
| G-029 | PL:104-105 | Mobile speed: issue material <=20s; log activity progress <=15s | MISSING | grep performance.now / "seconds" in *.test.* = 0; STATE.md hits for 'ثانية' are test-run durations, no interaction timings. UI paths exist (materials.issueToWork, progress) but unmeasured. | no | M |
| G-030 | PL:106 | Log hours for a whole team in one go <=45s | MISSING | time entries are one assignment x day per call (routers.ts:300-303, unique index assignment+day schema.ts:~255); no bulk/team endpoint or UI. | yes | M |
| G-031 | PL:107 | Receive materials against a PO <=30s | MISSING | GRN form exists (ProjectGoodsReceipts.tsx); unmeasured. | no | S |
| G-032 | PL:111 | >=44px touch targets, smart defaults, mandatory-fields-only fast paths | MISSING | grep "44px\|min-h-11\|min-h-\[44" client/src/pages = 0 meaningful hits. | no | M |
| G-033 | PL:111 | Local save + send on reconnect with visible sync state | MISSING | grep serviceWorker/indexedDB/navigator.onLine/offline in client/src = 0; localStorage only for theme/lang. | no | L |
| G-034 | PL:115 | Live test: material issue / labour hour changes AC then EAC then FPAC numerically | PARTIAL | Integration tests prove payroll->AC (integration.database.test.ts:1862) and issue->cost (1357); nothing reaches FPAC. | yes | M |
| G-035 | PL:116-118 | Tests: movement decomposition order; FPAC cross-tenant/out-of-scope isolation; entitlement blocks screen | MISSING | no endpoint to test. Route is wrapped only by `withAuth` (App.tsx:47). | yes | M |
| G-036 | PL:119 | Tests: loading/empty/error/partial states + stale-confidence indicator | PARTIAL | ProjectProfitability.test.tsx = 2 render tests (EN/AR). Page shows ONE error banner and renders 0 for failed sources (violates EXTENDED B0.5). | no | S |
| G-037 | PL:120-121 | Timing test per section-8 action; AR/EN + desktop/mobile test | PARTIAL | AR/EN DOM test exists; 390x844 review doc covers the earlier proxy page (FPAC_COMMERCIAL_VISUAL_REVIEW_2026-08-26.md); no timing tests. | no | M |

## B. WORK_ORDER_PMC.md (Phase A residue, then B, C, D)

Phase A is "closed" in STATE/closeout. Present: 12 tables w/ tenant+project, FKs, indexes (0052, verify-pmc-schema.mjs); 7 pure rule functions + unit tests (pmc.test.ts); live isolation test (integration.database.test.ts:392). Gaps inside the "closed" phase:

| ID | Source | Promise | Status | Evidence / what was searched | Live DB | Size |
|---|---|---|---|---|---|---|
| G-040 | PMC:24 | Unit-activity row carries a verification/disbursement status from a tenant-configurable list | PARTIAL | `pmc_verification_statuses` exists (schema.ts:1761) but `pmc_unit_activity_progress` (1727-1742) has no column/FK to it -> screens 5, 9 cannot be computed. List is per PROJECT (projectId NOT NULL), promise says per tenant. | yes | S |
| G-041 | PMC:25 | Inspection request: contractor, consultant, units, 5 workflow steps, A/B/C/UR | PARTIAL | schema.ts:1776-1807: no contractor column (screen 2 filter), units stored as JSON text `unitIdsJson` (no relational link), no step owner (screen 4 "held by whom"), step names free text, five stages not seeded. | yes | M |
| G-042 | PMC:26 | Baseline: monthly planned % OR per-activity start/end | PARTIAL | `pmc_baselines` only (activity, periodAt, plannedPercent); no start/end variant. | yes | S |
| G-043 | PMC:27 | Project financial indicators (Paid %, confirmed invoicing, target invoicing) from contracts/claims records | MISSING | no schema or code; only pmc code path is getPmcProjectSummaryForTenant (db.ts:733-761) = row counts. | yes | M |
| G-044 | PMC:28 | Beneficiary data (name, id, bank, price): separate permission + audited reads | MISSING | no table in schema.ts, no permission in operationalRoles.ts (deferred from first import, but the model entry is a promise). | yes | M |
| G-045 | PMC:36 | Status factors (e.g. UNDER_REVIEW=0.9) configurable per tenant | PARTIAL | `calculateUnitProgress(statusFactors)` accepts them (pmc.ts) but nothing stores/loads them; no tenant config table (see G-016). | yes | S |
| G-046 | PMC:34 | Each of 7 rules has a unit AND an integration test | PARTIAL | 7 unit tests; integration only for isolation. grep of pmc.ts exports outside pmc.test.ts = 0 callers: rules are not wired to any write or read path. | yes | M |
| G-047 | PMC:39 | Saving a model whose weights != 100.00% is rejected; import report names the offending model | PARTIAL | `validateActivityWeights` is a pure function; no save/import path, no DB check. | yes | S |
| G-048 | PMC:38 | Activity completion never >100% in aggregation | PARTIAL | `calculateActivityCompletion` throws, but no aggregation calls it. | yes | S |
| G-049 | EXT:49-54 (gate) / PMC:17 | Named PMC RBAC permission + entitlement guard for the new records | MISSING | `pmc.summary` uses generic `project.read` (routers.ts:64); no pmc permission in operationalRoles.ts; no PMC feature in db.ts:253-262. | yes | S |
| G-050 | PMC:23 | Status change writes history (from, to, who, when) | MISSING | tables exist; no mutation in routers.ts `pmc` router (only `summary`). | yes | M |
| G-051 | PMC:48 | New project tab "ضبط المشروع PMC", Arabic-first RTL, mobile | MISSING | grep -i pmc client/src = 0. | no | M |

### Phase B - import (all MISSING unless stated)
| ID | Source | Promise | Status | Evidence / what was searched | Live DB | Size |
|---|---|---|---|---|---|---|
| G-055 | PMC:73 | Excel/CSV templates for 5 entities: locations; catalogue+weights; unit-activity status; requests+replies; baseline | MISSING | `ImportModuleCode = wbs\|budget\|contracts\|materials\|schedule` (dataImport.ts:3); analyze enum routers.ts:76. | yes | L |
| G-056 | PMC:74 | Pre-save validation report: rejected rows+reason, weights != 100%, activities without group, duplicate units; nothing saved until user approves | PARTIAL | Generic analyze->validated->confirm flow, `data_import_errors`, row results exist; none of the 4 PMC checks implemented. | yes | M |
| G-057 | PMC:75 | Re-import idempotent on natural key project+unit+activity | PARTIAL | unique index `pmc_unit_activity_unique` (schema.ts:1742) and generic upsert policies exist; no PMC importer exercises them. | yes | S |
| G-058 | PMC:87 | Closure proof: 500 units x 60 activities imported twice, count stable | MISSING | BLOCKER: `MAX_IMPORT_ROWS=10_000`, `MAX_IMPORT_COLUMNS=60`, `MAX_IMPORT_BYTES=5MiB` (excelWorkbook.ts:5-7). 500x60 = 30,000 long-format rows, or 61+ columns wide. Needs owner decision / limit change (see H-3). | yes | L |
| G-059 | PMC:87 | Deliberately-wrong file rejected with a correct report | MISSING | no PMC importer. | yes | S |

### Phase C - screens 1,2,4-9,11 (all MISSING: no pmc router procedures except `summary`, no client page; grep -i pmc client/src = 0)
| ID | Source | Promise | Status | Evidence / what was searched | Live DB | Size |
|---|---|---|---|---|---|---|
| G-060 | PMC:52 | S1 Latest updates: per engineer updates/day, unit range, % added, split by group | MISSING | data: `pmc_unit_activity_history` + weights exist; no query/UI. Uses `normalizeUnitRange` (unused). | yes | M |
| G-061 | PMC:53 | S2 Approvals: request table, A/B/C/UR per consultant/day/activity, filters contractor/consultant/unit/date | MISSING | needs contractor field (G-041). | yes | M |
| G-062 | PMC:55 | S4 Inspections: where each request is in the flow, count/%, "held by", most-stalled activities | MISSING | needs step owner (G-041). | yes | M |
| G-063 | PMC:56 | S5 Activities: group/activity x verification-disbursement status, count and weight, expandable | MISSING | needs G-040. | yes | M |
| G-064 | PMC:57 | S6 Zones: zone/stage x engineer, weight/count/% with heat colouring | MISSING | `assignedUserId` exists (schema.ts:1737). | yes | M |
| G-065 | PMC:58-59 | S7 weekly and S8 monthly reports (per engineer/activity, weight added, split by group/status) | MISSING | history table is the source; no code. | yes | M |
| G-066 | PMC:60 | S9 Pending at verifier with age in days | MISSING | needs G-040 (+ pendingSince; `lastChangedAt` exists). | yes | S |
| G-067 | PMC:62 | S11 Stage x status weight/count/% with "late activities" indicator | MISSING | late = actual vs baseline (G-042/G-076). | yes | M |
| G-068 | PMC:65 | Unified filters (Zone, Block, Unit, Group, Stage, Activity, last N days/weeks/months) | MISSING | none. | no | M |
| G-069 | PMC:65 | Excel AND PDF export on every screen | MISSING | Excel export exists only for wbs/budget/activities (routers.ts:79); NO PDF generator (package.json has no pdf lib; grep pdf server/client = master-plan MIME only). | yes | L |
| G-070 | PMC:65 | Data-freshness indicator per source on each screen; section says "no data" instead of crashing | MISSING | SectionMessage/SectionErrorBoundary are reusable (SectionResilience.tsx) but unused by PMC. | no | S |
| G-071 | PMC:88 | Phase C closure: screenshot per screen (AR + mobile) and >=2 numbers per screen matched to written hand calculation | MISSING | no screens. | no | M |

### Phase D - site plan, programme, EVM link
| ID | Source | Promise | Status | Evidence / what was searched | Live DB | Size |
|---|---|---|---|---|---|---|
| G-075 | PMC:54 | S3 Site plan: user-uploaded plan image + GeoJSON polygons; units coloured by status of chosen activity; click opens unit card | CLOSED (D1) | `pmc_site_plans` (0057) + `pmcGeometry.ts` + `pmcPlanService.ts` + `pmc.siteMap/unitCard/uploadSitePlan/saveUnitGeometries` + `PmcSitePlan.tsx`; polygons normalised 0..1 on the plan image, independent of the Master Plan rectangles; live test `pmc.plan.database.test.ts` (5). Not seen in a real browser. | yes | L |
<<<<<<< HEAD
| G-076 | PMC:61 | S10 Programme: planned vs actual monthly + cumulative S-curve + cards Paid / confirmed invoicing / target | CLOSED (D2) | `programme()` + `pmc.programme` + `PmcProgramme.tsx`: monthly planned vs actual, cumulative S-curve, and Paid / confirmed / target cards from `project_commercial_invoices` and `projects.contractValue`. | yes | L |
| G-077 | PMC:89 | S-curve matches imported baseline | CLOSED (D2) | Live test imports a baseline through the API and asserts planned 12/40/68 by hand calculation. | yes | S |
| G-078 | PMC:42 (rule 7) | Each Group/Activity linked to a WBS item so EVM snapshot updates directly from PMC | CLOSED (D2) | `pmcEvmBridge.ts`: linked WBS items get a `submitted` progress entry from the cells, in the same transaction, on every path that moves PMC progress. | yes | L |
| G-079 | PMC:89 | EVM snapshot changes when an activity status changes, before/after numbers shown | CLOSED (D2) | `setUnitActivityStatus` returns `evm {evBefore, evAfter, changed}`; the unit card shows it; live test cross-checks every step against `liveEvm`. | yes | M |
=======
| G-076 | PMC:61 | S10 Programme: planned vs actual monthly + cumulative S-curve + cards Paid / confirmed invoicing / target | MISSING | recharts present; PortfolioCashFlowChart.tsx is a precedent; no PMC series; cards depend on G-043. | yes | L |
| G-077 | PMC:89 | S-curve matches imported baseline | MISSING | needs G-055 baseline import. | yes | S |
| G-078 | PMC:42 (rule 7) | Each Group/Activity linked to a WBS item so EVM snapshot updates directly from PMC | PARTIAL | `pmc_activity_definitions.wbsItemId` exists (schema.ts:1717); `calculateEarnedValue` unused; operational EVM reads only `progress_entries` status='submitted' (operationalEvm.ts:~55) - no PMC->progress bridge. | yes | L |
| G-079 | PMC:89 | EVM snapshot changes when an activity status changes, before/after numbers shown | MISSING | depends on G-078. | yes | M |
>>>>>>> origin/main

## C. WORK_ORDER_EXTENDED.md

| ID | Source | Promise | Status | Evidence / what was searched | Live DB | Size |
|---|---|---|---|---|---|---|
| G-100 | EXT:61 | Batch 0 resilience on EVERY dashboard/workspace of Level 1-3 | PARTIAL | SectionMessage/ErrorBoundary used only in ExecutiveDashboard, PmoDashboard, ProjectControls (grep count). Standalone pages (ProjectProfitability, SupportCenter, PayrollWorkspace, EmployeeRegistry, BillingRegister, CommercialChain, LicensingConsole, TenantAdministration) use a single error banner or none. Closure test "one source fails" exists for 3 pages only. | no | M |
| G-101 | EXT:76 | Batch 1.1 re-run full quality gate and pin numbers | PARTIAL | STATE.md gate rows are UNVERIFIED (summary table: 28 UNVERIFIED, 5 OPEN, STATE.md:132-146); live TiDB run needs a new test DB. | yes | S |
| G-102 | EXT:77 | Batch 1.2 close or re-classify every UNVERIFIED/OPEN row in STATE | PARTIAL | 28 UNVERIFIED + 5 OPEN remain. | yes | M |
| G-103 | EXT:94 | 2.3 Supplier register linked to POs and contracts | PARTIAL | `suppliers` (schema.ts:1064) referenced only by `procurement_requisitions.supplierId`; `purchase_orders.supplierName` (schema.ts:1007), `contracts.counterparty`, `subcontract_contracts.subcontractorName` are free text. | yes | M |
| G-104 | EXT:99 | 2.8 Transfers + stocktake adjustments with MANDATORY reason, atomic audit | PARTIAL | `note` is `.optional()` for transferInventory and recordInventory (routers.ts:351-353); adjustment is a bare transactionType, no stocktake document. | yes | S |
| G-105 | EXT:103 | Import template: opening balances | MISSING | grep -i "opening" dataImport.ts, db.ts = 0 (materials catalogue template exists). | yes | M |
| G-106 | EXT:108 | 3.2 Every status indicator (late, health, commitment, % complete) shows number + formula + date in the same row | PARTIAL | Done for PMO planning center (PmoDashboard.tsx:24-25; BATCH_3 doc). Level 3 command center KPIs and Level 1 totals: grep "formula\|معادلة" in ProjectControls.tsx / ExecutiveDashboard.tsx = 0. | no | M |
| G-107 | EXT:119 | 4.1 Self-signup with MANDATORY email verification | PARTIAL | Rate limit exists (db.ts:893, `self_service_signup_attempts`); no verified-email check (grep verif server/_core, db.ts - only JWT verify). todo.md:86 / BLOCKED_BY_OWNER (identity provider claim). | yes | M |
| G-108 | EXT:136 | 5.5 Escalated tickets reach the owner via internal notifications | MISSING | Only 3 notification codes ever inserted (DASHBOARD_SECTION_ATTENTION, FIELD_REPORT_REVIEWED, PROJECT_HEALTH_EXCEPTION, db.ts:1858/2827/2854); support escalation (db.ts:957-1011) inserts none; SupportOwnerPanel just lists tickets. | yes | S |
| G-109 | EXT:53 | Gate 5: localized error for every server code, no generic fallback | PARTIAL | ~45 `PROJECT_OS_*` codes thrown in db.ts have no entry in shared/projectErrors.ts, so users get the generic "request failed": e.g. PAYROLL_APPROVER_SEPARATION, PAYROLL_NOT_APPROVED, PAYROLL_TRANSITION_INVALID, GRN_COMMITMENT_INSUFFICIENT, INVENTORY_TRANSFER_SAME_WAREHOUSE, IMPORT_VALIDATION_FAILED, IMPORT_NOT_CONFIRMABLE, TIME_ENTRY_INVALID, REORDER_LEVEL_INVALID (diff of codes thrown in db.ts vs keys in projectErrors.ts: 47 minus 2 env-var names). | no | S |
| G-110 | EXT:54 | Gate 6: for every new record a live test of cross-tenant, cross-project, no-entitlement, allowed, audit row | PARTIAL | coverage:trpc proves a reference per procedure, not all five behaviours per record (e.g. PMC has isolation only; PMC reads have no audit). | yes | L |

## D. WORK_ORDER_BATCH_6.md

| ID | Source | Promise | Status | Evidence / what was searched | Live DB | Size |
|---|---|---|---|---|---|---|
| G-120 | B6:45-58 | Named roles with a binding "does NOT own" list (e.g. warehouse keeper cannot create POs; site engineer cannot enter costs) | PARTIAL | 17 of 26 operational permission codes are seeded (operationalRoles.ts:1-28) but referenced by NO server check: project.inventory.manage, procurement.manage, budget.manage, cost.enter, cashflow.read, commitment.manage, invoice.match, wbs.manage, schedule.manage, evm.manage, progress.manage, field.manage, quality.manage, hse.manage, rfi.manage, ncr.manage, material.request (grep each in db.ts/routers.ts/authorization.ts = 0). Writes check generic `project.write` (66 sites in db.ts) / `project.manage`, which no operational role except PROJECT_MANAGER (project.manage) carries. So a role alone cannot act, and combined with a generic project.write role nothing restricts it. Only the HR/payroll codes (payroll.*, hr.*, attendance, performance) are enforced. | yes | L |
| G-121 | B6:62, B6:113 | SoD: rejection test per pair + single-role allowed, in the live gate | PARTIAL | Unit test covers all 3 pairs (operationalRoles.test.ts:5-11); live integration covers only PROCUREMENT_OFFICER x WAREHOUSE_CUSTODIAN (integration.database.test.ts:448-485). | yes | S |
| G-122 | B6:80 | End-of-service accrual as a cumulative monthly liability | PARTIAL | `eosMonthlyAccrual` is a hand-entered monthly amount on salary_structures (schema.ts:131) copied into entries; no cumulative balance, no service-length computation. | yes | M |
| G-123 | B6:82 | Labour cost distributed to WBS/activity from approved payroll | PARTIAL | `allocateApprovedPayrollCostForTenant` (db.ts:2440-2456) = one manual allocation per entry typed by the approver; no automatic split from time entries/assignments. Numeric AC/CPI proof exists (integration.database.test.ts:1862). | yes | M |
| G-124 | B6:25 | Working days default Sun-Thu, configurable per tenant (also default currency) | MISSING | `countSaudiWorkingDays` hard-codes days 0-4 (employeeCapacity.ts:5-10); 8h/day default; no tenant settings table. | yes | S |

## E. ACCEPTANCE_CRITERIA / MASTER_PLAN / MODULE_MAP / COMMAND_CENTER / IMPLEMENTATION_PLAN

| ID | Source | Promise | Status | Evidence / what was searched | Live DB | Size |
|---|---|---|---|---|---|---|
| G-130 | ACC:20 | Entitlement check on all actions | PARTIAL | self-declared "partial" (ACC:20); G-049/G-120 show new cases. | yes | M |
| G-131 | ACC:22, 71 | App DB account has only SELECT+INSERT on audit_logs; SHOW GRANTS + denial test before Pilot | PARTIAL | scripts/verify-audit-log-grants.mjs and provision scripts exist; execution is DBA-owned (BLOCKED_BY_OWNER in STATE). | yes | S |
| G-132 | ACC:24, 72 | Screen-reader / manual keyboard review; manual role rounds with real accounts | MISSING | todo.md:347,350 unchecked; MANUAL_ACCESSIBILITY_ACCEPTANCE.md is a protocol only. HANDOFF_REQUIRED. | no | M |
| G-133 | ACC:73 | External notifications (email) with delivery policy | MISSING | grep smtp/nodemailer/resend/sendgrid in server/, package.json = 0 hits (secretScan test only). BLOCKED_BY_OWNER. | yes | M |
| G-134 | ACC:81 | "Production-Ready" only after closing functional/security gaps + production-environment evidence | MISSING | by design not claimed; gap list above is the blocker set. | yes | L |
| G-135 | MP:105 | Master Plan declared-unbuilt: asset rotation/calibration; professional geometry editor / Canvas-WebGL for >thousands of entities | MISSING | declared in doc; ProjectMasterPlan.tsx is HTML-rect surface (grep rotat/calibrat/canvas/webgl = 0). | no | L |
| G-136 | MP:105 | Master Plan declared-unbuilt: visual parent editor; snapshot sharing between users; KPI rules for risk/quality/HSE/production | MISSING | snapshot read limited to `createdByUserId` by design; `master_plan_visualization_rules` supports 3 metrics only. | yes | L |
| G-137 | MP:105 | Master Plan declared-unbuilt: jump from entity detail to WBS/Activities/Docs pages; production/quality/HSE alerts | MISSING | detail buttons only set local filters (MP:37). | no | M |
| G-138 | MODULE_MAP:3-11 | Level 1-3 matrix (all rows) | PARTIAL | all rows say "مخطط"; mobile operation for field/quality/HSE (L3) verified only at /controls in UI_RESPONSIVE_AUDIT.md (375x812). | no | S |

## F. Counts of PRESENT promises (implemented AND tested/visible), by source doc
- WORK_ORDER_PROJECT_PL: 0 (page renders AR/EN and is scoped, but every FPAC-defining item is G-001..G-037).
- WORK_ORDER_PMC: 10 (12 tables w/ tenant+project; unit-progress rule 1; rule 2; rule 3; rule 4; rule 5; rule 6; rule 7 as pure functions + unit tests; live isolation test; schema verifier; natural-key unique index). Phases B/C/D: 0.
- WORK_ORDER_EXTENDED: 27 (B0 x6 for 3 dashboards; 1.3 ADR section; 1.4 pilot kit docs; 2.1, 2.2, 2.4, 2.5, 2.6, 2.7, 2.9, 2.10, materials import template; 3.1 audit doc, 3.3 tRPC coverage 185/180; 4.2, 4.3, 4.4 Manual+Mock adapters, 4.5 InvoiceRenderer; 5.1, 5.2, 5.3, 5.4 guard).
- WORK_ORDER_BATCH_6: 20 (8 roles defined; SoD guard + 3 unit tests; employee card, optional account link, contract, PDPL read-audit, retention/archive; salary structure, GOSI rate configurable, run lifecycle with separate approval, payslip renderer, isolation, numeric AC/CPI test; assignment, planned vs actual hours, attendance, hours->cost/progress, capacity warning; own-metrics, exclusions/objections).
- ACCEPTANCE_CRITERIA: 17 (identity, languages, Level 1 x4, Level 2 x5, Level 3 rows incl. import/export, claims, resources, documents, advisor, notifications). 
- MASTER_PLAN: 10 (plans/versions, spatial entities, zoom/pan, snapshots, KPI rules, Excel mapping, asset upload, WBS/activity links, parent link, file entity import).
- PROJECT_MANAGER_COMMAND_CENTER: 4 (KPIs from existing sources, no-zero-on-failure, scope guard, DOM test). MODULE_MAP / IMPLEMENTATION_PLAN: n/a (status tables, stale).

## G. Top 10 gaps by business importance
1. G-001..G-006 FPAC itself (adjusted contract, FPAC, margin, planned profit, variance): the order calls this the reason customers buy; the shipped page is an invoiced-minus-cost proxy that uses forecast = actual + commitments, not EVM EAC.
2. G-008..G-011 / G-010 profitability snapshots + WBS-level movement: the "answer today, trend vs last month, why it moved" value; needs per-WBS EAC history that evm_snapshots cannot hold.
3. G-120 enforcement of operational-role permissions: 17 of 26 role permissions are decorative, so separation-of-duties promises ("does NOT own") are paper only; also blocks any FPAC/PMC permission design.
4. G-040 + G-041 PMC data-model holes (no verification status on unit-activity, no contractor / step owner): screens 2, 4, 5, 9 cannot be built until fixed; migration is cheap now, expensive after import.
5. G-055..G-059 PMC import (and the 10,000-row / 60-column limit that the closure test itself exceeds): all PMC value starts here.
6. G-012 + G-013 + G-014 open commitment, NET cash flow and profit-vs-cash warning: the "profit is not cash" message is a headline promise; engine has no inflows and double-counts GRN vs commitment.
7. G-022 + G-023 cost category and source link on cost_entries: prerequisite for the whole drill-down (materials/labour/subcontract/other -> source doc).
8. G-015 + G-016 loaded labour cost and tenant-config table: no tenant settings exist at all; also unblocks PMC factors (G-045) and working days (G-124).
9. G-030 / G-033 / G-029..G-032 mobile speed targets, team hours bulk entry, offline queue: stated as acceptance conditions of the PL order, none built or measured.
10. G-017..G-020 confidence / freshness indicator: "the number equals the quality of its data"; absent, FPAC would mislead (also reused by PMC screens as "data freshness").
Runners-up: G-108 (support escalation never notifies owner), G-109 (45 unmapped error codes), G-069 (no PDF export), G-107 (email verification).

## H. Promises that contradict each other (or the code/status docs)
1. FPAC "closed" vs ordered: todo.md:367 `[x]`, REMAINING_INVENTORY.md section 1 ("العمليات التجارية وFPAC PROVEN") and STATE.md:189 treat FPAC as done; WORK_ORDER_PROJECT_PL (21 Aug) defines it far beyond the 26 Aug proxy page, whose own text says "proxy / not a statutory profit statement" and uses EAC-less "forecast". REMAINING_INVENTORY's "no known engineering gap" cannot hold alongside this list.
2. PL:45 "extend EVM snapshots, no new snapshot mechanism" vs PL:47 per-WBS `EAC_now - EAC_last_snapshot`: evm_snapshots is project-level, so a per-WBS history table is unavoidable; PL:30 "do not recompute EAC" vs needing a per-WBS EAC the engine does not produce.
3. PMC:87 Phase B closure (500 units x 60 activities) vs hard import limits MAX_IMPORT_ROWS 10,000 / COLUMNS 60 / 5 MiB (excelWorkbook.ts:5-7; IMPORT_EXPORT.md and REMAINING_INVENTORY cite them as hardening). One must change.
4. PMC:24 "verification states configurable per TENANT" vs schema (per project, PMC:17 wants tenant_id+project_id on all) - minor; PMC:54 "GeoJSON polygons" vs MASTER_PLAN: rectangles in a 100x100 space (MP:15) and a separate entity table; two competing site-plan models.
5. EXT:98 (2.7: material issue writes actual cost) vs EXT:101 (2.10: material receipt raises actual cost): both implemented as posted actual cost (db.ts:1970 GRN, no WBS; db.ts:2550 issue, with WBS). Operational EVM sums all posted actual entries, so received-then-issued material is counted twice in AC unless one is reclassified - this also corrupts the PL "issue changes AC -> EAC -> FPAC" proof.
6. PL:54-55 "open commitment" and "cash-flow engine" vs cashFlow.ts: engine defines exposure = actual + full commitment (no netting of received goods, no inflows) while EXT:101 defines open commitment net of receipts.
7. PL:25-29 "original contract value from the contracts register" vs data model: value lives in `projects.contractValue` (stored, editable) AND `contracts.contractValue` (no client/subcontract flag); PL:29 says "computed, not an editable stored field".
8. EXT:66 / B0.5 "never display zero for a missing input" vs ProjectProfitability.tsx (zeros on failed sources) and EXT:105-108 "indicator shows its number, formula, date" vs most non-PMO KPIs.
9. B6:45-58 roles vs ACC:20 "entitlement/permission enforced": role catalogue says "does not own X", enforcement uses generic project.write; docs report operational-role work as PROVEN.
10. Stale status docs: ACCEPTANCE_CRITERIA:75-77 (245 unit tests / 58 integration / 97 of 102 procedures) vs STATE.md (335-364 tests, 185/180 procedures); MODULE_MAP all "مخطط"; IMPLEMENTATION_PLAN Phase-0 rows "قيد التنفيذ" (repo, CI exist); REMAINING_INVENTORY (18 Sep) says "no known engineering gap" while the order set above is unmet.
11. B6:39 / EXT deploy gate `BLOCKED_BY_PLATFORM` (no auto deploy) vs project CLAUDE.md section 5, which says every Manus checkpoint auto-deploys and calls DEPLOYMENT.md:34 stale - process contradiction, not code.

## I. ما أُغلق بعد اللقطة

(يُحدَّث في الطلب الذي يغلق الصف، مع رقم الصف والدليل.)

### شاشة الربحية (PR: FPAC) — المغلق والمتبقي

| الصف | الحال بعد الطلب | الدليل |
|---|---|---|
| G-001..G-006 | أُغلقت | `server/domain/profitability.ts` + `profitability.test.ts` (دوال نقية)؛ والحي `server/profitability.database.test.ts`: AC 400 ← EAC 1000 ← عقد معدّل 1300 (1200 + 100 معتمد؛ الـ50 قيد المراجعة لا تُحتسب) ← FPAC 300. |
| G-007 | أُغلق | كل رقم في جدول الرئيس بمعادلته ومصدره وتاريخه (`ProjectFpac.tsx`، `ProjectFpac.test.tsx`). |
| G-008..G-011 | أُغلقت | `evm_snapshots.adjustedContractValue/fpac` + `evm_wbs_snapshots` (الترحيل `0054`)؛ لقطة شهرية من cron بلا مستخدم (`/api/scheduled/profitabilitySnapshots`، idempotent لكل شهر)؛ الحركة بثلاثة أسباب تجمع التغير كاملًا (حي: −50 = +50 −100 +0)؛ منحنى FPAC من `profitability.history`. |
| G-012, G-014 | أُغلقا | الالتزام المفتوح = قيمة أوامر الشراء − max(المستلم، المفوتر)؛ تحذير الربح الموجب مع التدفق السالب. **قيد معلَن:** فواتير الموردين غير مسجلة في المنصة فالمفوتر = 0 (G-012 يبقى جزئيًا حتى تُسجَّل). |
| G-013 | جزئي | صافي التدفق = المقبوضات المدفوعة (`project_commercial_invoices` بحالة paid) − التكلفة الفعلية المرحّلة؛ ليس محرك تدفق نقدي مستقلًا بجدول مدفوعات. |
| G-017..G-020 | أُغلقت | `dataFreshness` (نقية) + شريط الثقة وتحذير التقادم ورابط المصدر الأقدم (`#manager-schedule` / `#manager-site`). |
| G-021, G-022 | أُغلقا | أعلى 5 بنود بانحراف؛ `cost_entries.category/sourceType/sourceId` (الترحيل `0054`) وكل مواقع الإدراج الخمسة تضبطها. الصفوف القديمة تبقى `other` بلا مصدر (لا backfill). |
| G-023 | جزئي | يُعرض نوع المستند المصدر ومعرّفه المختصر؛ لا رابط انتقال إلى شاشة المستند بعد. |
| G-024 | جزئي | المخطط والفعلي والمتوقع والانحراف على مستوى البند؛ **الملتزَم غائب لأن أوامر الشراء لا تحمل بند WBS.** |
| G-015, G-016 | **مفتوحان** | `loadedHourlyCost` دالة نقية مختبرة، لكنها غير موصولة: لا جدول إعدادات للمستأجر لمعامل التحميل (يتطلب قرار مالك على الجدول وموضعه في الإدارة). |
| صف جديد G-139 | مفتوح | الصفوف القديمة في `cost_entries` بلا فئة/مصدر؛ الكسر بحسب الفئة يبدأ من الإدخالات الجديدة. |
| صف جديد G-140 | مفتوح | `ProjectProfitability.tsx` القديمة تُبقي «المؤشر التقريبي» (مفوتر − فعلي) تحت اللوحة الجديدة بإفصاحها الخاص؛ يُحذف حين يقرّر المالك. |

### سرعة الإدخال من الجوال — المغلق والمتبقي

| الصف | الحال بعد الطلب | الدليل |
|---|---|---|
| G-029 (صرف مادة ≤ 20 ث، تقدم نشاط ≤ 15 ث) | أُغلق | `/m/:tenantId/:projectId`. صرف مادة: 3 نقرات + حقل الكمية فقط (سعر الوحدة والمستودع وبند العمل مملوءة من آخر استعمال): 1.12 ث آلية، ≈8.5 ث بنموذج الأفعال المعلن. تقدم نشاط: 3 نقرات (البند، النسبة، حفظ): 4.11 ث آلية (مع أول تحميل)، ≈4.5 ث. القياس: `scripts/measure-mobile-entry.mjs` على 390×844 مع التحقق من وصول الصفوف. |
| G-030 (ساعات فريق كامل ≤ 45 ث) | **مفتوح** | لم تُبنَ شاشة إدخال ساعات الفريق دفعة واحدة (الخادم يقبل تسجيلًا واحدًا لكل نداء). |
| G-031 (استلام مواد مقابل أمر شراء ≤ 30 ث) | **مفتوح** | نموذج الاستلام القائم لم يُعَد تصميمه للجوال ولم يُقَس. |
| G-032 (≥ 44px، افتراضات ذكية، حقول إلزامية فقط) | أُغلق للإجرائين | اختبار DOM يفحص أن كل زر وحقل في الشاشة `min-h-[44px]`؛ الافتراضات من `fieldEntry.context`. بقية الشاشات القائمة لم تُراجع. |
| G-033 (حفظ محلي وإرسال عند العودة) | **مفتوح** | لا قائمة انتظار دون اتصال، والخادم بلا مفتاح idempotency يمنع تكرار الإرسال؛ بناؤها قبل ذلك يخاطر بصرف مادة مرتين. |
| G-037 (اختبار زمن لكل إجراء) | جزئي | يغطي إجرائين من أربعة؛ الأزمنة آلية على هذا الجهاز، والتقدير البشري نموذج معلن (1.5 ث للنقرة، 4 ث للحقل) لا قياس بشري. |

### PMC المرحلة A — الفجوات داخل «المغلقة»

| الصف | الحال بعد الطلب | الدليل |
|---|---|---|
| G-040 (حالة تحقق/صرف لكل خلية) | أُغلق | `pmc_unit_activity_progress.verificationStatusId` (الترحيل `0055`) بمفتاح أجنبي؛ القائمة قائمة المشروع (`pmc_verification_statuses`) لا المستأجر، وهذا اختيار الأقل أثرًا لأن الجدول القائم بمفتاح المشروع؛ الأسماء من المستأجر لا من الكود. حي: `pmc.database.test.ts` «keeps the verification list the project's own». |
| G-041 (طلب الفحص) | أُغلق | عمود `contractorLabel`، وجدول علائقي `pmc_inspection_request_units` بدل JSON، وخمس خطوات تُنشأ مع الطلب بترتيب (`CONFIGURATIONS`، `MANAGER_APPROVAL`، `TECHNICAL_ASSISTANT`، `WAITING_CONSULTANT`، `RESULT_RECEIVING`) و`holderLabel` لـ«عند من الطلب»؛ الرد A/B/C/UR لا يُسجَّل إلا عند الخطوة الأخيرة ومرة واحدة. حي: «runs an inspection request through its five steps…». العمود `unitIdsJson` صار اختياريًا للتوافق. |
| G-042 (خط الأساس بتاريخي بداية/نهاية) | **مفتوح** | النسبة الشهرية فقط؛ الصيغة بالبداية/النهاية لم تُبنَ. |
| G-043 (مؤشرات المشروع المالية) و G-044 (بيانات المستفيد) | **مفتوحان** | لم يُبنيا؛ G-044 مؤجل صراحةً من الاستيراد الأول. |
| G-045 (معاملات الحالة) | أُغلق | `pmc_status_factors` + `pmc.setStatusFactors` (التحقق: لا يربح الأسبق أكثر من اللاحق ولا يتجاوز 1) + `pmc.statusFactors`؛ تدخل القاعدة 1 فعلًا (حي: 60 + 40×0.9 = 96). |
| G-046 (كل قاعدة باختبار وحدة وتكامل) | جزئي | القواعد 1 و2 و3 و4 صارت تُستدعى من مسار قراءة حقيقي (`pmc.progress`) وتُثبت حيًا بأرقام يدوية (96، 48، 72، 50%)؛ القواعد 5 و6 و7 تنتظر الاستيراد (B) والتقارير (C) والربط بـEVM (D). |
| G-047 (رفض حفظ نموذج أوزانه ≠ 100) | جزئي | عند القراءة: الوحدة بنموذج أوزانه لا تساوي 100 لا تحمل رقمًا ويُذكر السبب `MODEL_WEIGHTS_NOT_100` (حي: 80 → بلا رقم)؛ الرفض عند الحفظ يأتي مع مسار الاستيراد (المرحلة B). |
| G-048 (≤100%) | أُغلق | الخلية لا تُنشأ إلا لوحدة من نموذج النشاط نفسه (`PROJECT_OS_PMC_ACTIVITY_NOT_IN_UNIT_MODEL`) والفهرس الفريد يمنع التكرار، فالمنجز لا يتجاوز المشمول؛ والتجميع يمر عبر `calculateActivityCompletion`. |
| G-049 (صلاحية PMC مسمّاة + استحقاق) | أُغلق | `project.pmc.read/update/manage` في الكتالوج وأدوار المدير والمخطط والموقع وQA/QC والمالية، ومنحها لأصحاب الشركات القائمين في الترحيل؛ وميزة `PMC` في الباقات تُفحص عبر `assertTenantFeatureAccess`. حي: ثلاثة أدوار (إدارة/قراءة/بلا) وحجب بتعطيل الميزة ثم عودتها. |
| G-050 (سجل التغيير: من، إلى، من، متى) | أُغلق | `pmc.setUnitActivityStatus` يكتب الخلية والتاريخ وسجل التدقيق في معاملة واحدة، والتكرار بلا أثر؛ تغيير حالة التحقق وحدها لا يكتب تاريخ حالة. |

### PMC المرحلة B — الاستيراد

| الصف | الحال بعد الطلب | الدليل |
|---|---|---|
| G-055 (خمسة قوالب) | أُغلق | `server/domain/pmcImport.ts`: المواقع، الكتالوج والأوزان، حالة الوحدة-النشاط، الطلبات والردود، خط الأساس؛ Excel وCSV، رؤوس عربية أو إنجليزية. القالب غير المعتمد أو العمود الناقص يُرفض قبل قراءة أي صف. |
| G-056 (تقرير التحقق قبل الحفظ) | أُغلق | `pmc.analyzeImport` لا يكتب شيئًا ويُعيد: صفوفًا مرفوضة بأرقامها وأسبابها، النموذج المخالف الوزن بالاسم، نشاطًا بلا مجموعة، وحدات مكررة، العدد الذي سيُنشأ/يُحدَّث/يبقى؛ و`pmc.confirmImport` لا يحفظ إلا الملف نفسه (بصمة SHA-256 ظهرت في التقرير) وبعد إعادة الفحص على حالة المشروع الآن. |
| G-057 (إعادة استيراد بلا تكرار) | أُغلق | المفتاح الطبيعي (المشروع + الوحدة + النشاط، ورقم الوحدة، ورمز الطلب، والنشاط/الشهر): إعادة الملف نفسه = صفر إنشاء وصفر تحديث. |
| G-058 (500 وحدة × 60 نشاطًا مرتين، العدد ثابت) | أُغلق | حي في `server/pmc.import.database.test.ts`: 30,000 صف حالة + 30,000 سجل تاريخ + 300 تعريف نشاط + 1,800 شهر خط أساس + 50 طلبًا، ثم الملفات الخمسة نفسها مرة ثانية فلا تتغير الأعداد. **قرار اتُّخذ:** حد صفوف الاستيراد العام 10,000 لا يتسع لذلك، فحُدّد حد خاص بوحدات PMC (60,000 صف و20 عمودًا و8 ميغابايت) دون المساس بحد بقية الوحدات. |
| G-059 (ملف خاطئ عمدًا يُرفض بتقرير صحيح) | أُغلق | حي: نموذج أوزانه 99 ← `PMC_MODEL_WEIGHTS_NOT_100` باسمه؛ صف بلا مجموعة؛ وحدة غير موجودة، حالة غير معروفة، نشاط غير معروف، مهندس ليس عضوًا، تكرار — كل منها برقم صفه؛ والتأكيد يُرفض ولا يُحفظ شيء. |
| G-047 (رفض حفظ نموذج أوزانه ≠ 100) | أُغلق | الرفض عند الاستيراد (القاعدة 4) مع القراءة الحذرة من المرحلة A2. |
| G-058 جانبي: حد `data_imports` | مفتوح (خارج النطاق) | الفهرس الفريد `(tenantId, fileHash)` في `data_imports` يمنع إعادة رفع الملف نفسه في المحرك العام؛ مسار PMC بلا تخزين ولا يتأثر. |

### PMC المرحلة C — الشاشات 1 و2 و4–9 و11

| الصف | الحال بعد الطلب | الدليل |
|---|---|---|
| G-060..G-067 (الشاشات 1 و2 و4 و5 و6 و7 و8 و9 و11) | أُغلقت | `server/domain/pmcScreens.ts` (دوال نقية) + `pmcScreensService.ts` + `pmc.latestUpdates/approvals/inspectionFlow/activitiesMatrix/zonesView/weeklyReport/monthlyReport/pendingAtVerifier/stagesView` + `client/src/pages/ProjectPmc.tsx` (`/projects/:tenantId/:projectId/pmc`). |
| G-068 (مرشحات موحدة) | أُغلق | المنطقة، البلوك، نطاق الوحدات، المجموعة، المرحلة، النشاط، الفترة (آخر 7/30/90 يومًا/12 شهرًا/كل الفترة)، ومرشحا المقاول والاستشاري على الاعتمادات. |
| G-069 (تصدير Excel وPDF) | جزئي بقرار | Excel: `pmc.exportScreen` (جدول مسطح لكل شاشة بعناوين عربية أو إنجليزية، وقيم تبدأ بـ`=+-@` تُحمى من تنفيذها صيغةً). **PDF = طباعة المتصفح** (`window.print()` مع إخفاء الأدوات): لا مكتبة PDF في المشروع، وتشكيل العربية في مكتبات PDF مكلف ويُخطئ؛ الطباعة تحفظ العربية كما تُعرض. لم يُبنَ مولّد PDF على الخادم. |
| G-070 (حداثة البيانات؛ القسم الناقص يقول «لا توجد بيانات») | أُغلق | كل شاشة تعرض عمر آخر تحديث لكل مصدر (المواقع، الكتالوج، حالة الأنشطة، الطلبات، خط الأساس)، وحالات تحميل/خطأ مع إعادة محاولة/«لا توجد بيانات» لكل شاشة على حدة. |
| G-071 (لقطة لكل شاشة بالعربية وعلى الجوال + رقمان بحساب يدوي) | أُغلق | `docs/screenshots/pmc/` (عشر شاشات × سطح مكتب وجوال 390px، بيانات 500×60 مستوردة عبر الواجهة البرمجية نفسها)؛ و`docs/PMC_PHASE_C_HAND_CHECKS.md` يحسب بالقلم أكثر من رقمين لكل شاشة، ويطابقها اختبار الدوال النقية واختبار القاعدة الحية. |
| G-051 (تبويب «ضبط المشروع PMC»، عربي أولًا، جوال) | جزئي | الصفحة وروابطها من رأس ضوابط المشروع، تتبع لغة الواجهة (عربية RTL عند اختيارها)؛ لم تُدمج كتبويب داخل صفحة الضوابط نفسها. |
| G-075 (مخطط الموقع: صورة + GeoJSON + بطاقة الوحدة) | أُغلق | `PmcSitePlan.tsx` + أربعة إجراءات `pmc.*` + الترحيل `0057`؛ حي 5 + DOM 5 + وحدة 5؛ لم يُرَ في متصفح حقيقي، والرفع جُرّب على تخزين ذاكرة لا R2. |
<<<<<<< HEAD
| G-076..G-079 (البرنامج الزمني، مطابقة خط الأساس، ربط WBS، EV قبل/بعد) | أُغلقت | `programme()` + `pmcEvmBridge.ts` + `pmc.programme`؛ حي 5 + وحدة 7 + DOM؛ لقطات `d-11…d-14`. «المستهدفة» تعريف مني لا معتمَد من المالك، والمبالغ قبل الضريبة. |
=======
>>>>>>> origin/main
