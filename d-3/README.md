# D-3 screenshots (before = main 6cffcf1, after = feat/design-pages 7a95371)

Synthetic demo company only (seed-demo-tenant.mjs, *.example.test), local production build, local test database.
Pages: login, two-step verification (mfa), workspace, project page (controls, empty project: start card), PMC tab, level 3 (project), phone entry (field).
Widths 390 and 1280; Arabic and English. report.json: banners/main count and horizontal scroll per shot (after: one banner and one main on framed pages, none horizontal-scrolling).
The servers ran with MFA_ENFORCEMENT=off for every shot except mfa-*.

## d-3/eb3989a/ — design-review fixes (#216), from eb3989a

Production client build of eb3989a; no server and no database: every API reply is a fixed synthetic fake (*.example.test).
Login (email, code step, wrong-code error) and two-step verification (setup, setup with wrong code, verify with wrong code), 390 and 1280, Arabic, English and Urdu.
report.json per shot: dir, horizontal scroll (none), buttons/links under 44px (none on 390; 40px on 1280 is the ds desktop size), alert text (Urdu errors are in Urdu).

## d-3/part-2/5fcd35e/ — D-3 (2/8) workspace and project page

before-* = client build of main 8f333b9; after-* = client build of 5fcd35e. No server and no database: every tRPC reply is a fixed synthetic fake (Demo Builders Co., Demo Tower, *.example.test); queries without a fixture answer NOT_FOUND, so lower sections may show their own error state.
Workspace (/) and project page (/projects/:t/:p/controls), 390 and 1280, Arabic, English and Urdu, full page.
before-report.json / after-report.json per shot: dir, horizontal scroll, main count, buttons/links under 44px inside main on 390, Arabic-Indic digits in the page text.

## d-3/part-2/ef1439b/ — review fixes for #217

after-* = client build of ef1439b; before-* = main 8f333b9 (unchanged since 5fcd35e, copied). Same fixed fake tRPC replies, no server, no database.
Fixes visible here: health/EVM results on a muted surface with full-contrast text and the overdue HSE line inside the health card; one column (no empty "Schedule & cost updates" panel at 1280); cut-off date full width under its label at 390 and 1280; company and project names in <bdi> (the full stop stays at the end in ar/ur).

## d-3/part-3/3453191/ — D-3 (3/8) PMC, level dashboards and phone screens

before-* = client build of main 08b037e; after-* = client build of 3453191. No server and no database: tRPC replies are fixed synthetic fakes (level data from client/src/test/levelFixtures.ts; *.example.test style names); queries without a fixture answer NOT_FOUND, so a section may show its own error state (e.g. warehouses on level 3).
Pages: PMC tab (pmc), level 1 company (level-company), level 3 project (level-project), quick site entry (field), quick issue (issue), daily report (report); 390 and 1280; Arabic, English and Urdu; full page.
before-report.json / after-report.json: dir, horizontal scroll, main count, buttons/links under 44px inside main on 390, Arabic-Indic digits.

## d-3/part-3/2cc1c61/ — review fixes for #222

before-* = client build of main b0e5b91; after-* = client build of 2cc1c61 (main merged in). Same fixed fake tRPC replies (freshness now uses the server's real source names: status, requests, baseline).
Visible fixes: wide tables scroll inside their frame with a hint and an edge fade (PMC, level 1, level 3); unit range reads "1 – 4"; data freshness translated with correct plurals; the level-3 profitability error card carries its section title with a 44px retry.

## d-3/part-4/306de4e/ — D-3 (4/8) start card and "+ Add" / "Upload file"

before-* = client build of main 935516d; after-* = client build of 306de4e. No server and no database: fixed synthetic tRPC replies.
controls-empty-* = an empty project (PRJ-002 "New Villas": no activities, budget or progress) — the start card, its steps bar, and the empty sections with + Add / Upload file. controls-* = a project with data (no start card: activities, budget and progress recorded... the fixture has activities and budget and progress, so the card is hidden).
390 and 1280, Arabic, English and Urdu, full page. *-report.json: horizontal scroll, main count, buttons under 44px on 390 (34 inherited, unchanged), Arabic-Indic digits.

## d-3/part-4/c938bb1/ — review fixes for #224

before-* = main 935516d; after-* = c938bb1. Same fixed synthetic replies. The empty project (controls-empty-*) now says each section is empty and what to do ("No schedule recorded yet. Add an activity or upload the programme."), not "not in your access scope".

## d-3/part-5a/c72fb2d/ — D-3 (5a/8) CheckedForm on D-63's forms

before-* = client build of main 7dcb6ec; after-* = client build of c72fb2d. Fixed synthetic tRPC replies; each shot submits one empty form, then captures the viewport around it.
Forms: the unit-number box of the field screens (report-unit), the contract form (contracts) and the supplier/material-request form (procurement) on the project page. 390 and 1280; Arabic, English and Urdu.
Before: the browser's own bubble, in English whatever the page language. After: a summary at the top and each message under its field in the page's language. *-report.json: checkedErrors = messages under fields, horizontal scroll.
