# D-3 screenshots (before = main 6cffcf1, after = feat/design-pages 7a95371)

Synthetic demo company only (seed-demo-tenant.mjs, *.example.test), local production build, local test database.
Pages: login, two-step verification (mfa), workspace, project page (controls, empty project: start card), PMC tab, level 3 (project), phone entry (field).
Widths 390 and 1280; Arabic and English. report.json: banners/main count and horizontal scroll per shot (after: one banner and one main on framed pages, none horizontal-scrolling).
The servers ran with MFA_ENFORCEMENT=off for every shot except mfa-*.

## d-3/eb3989a/ — design-review fixes (#216), from eb3989a

Production client build of eb3989a; no server and no database: every API reply is a fixed synthetic fake (*.example.test).
Login (email, code step, wrong-code error) and two-step verification (setup, setup with wrong code, verify with wrong code), 390 and 1280, Arabic, English and Urdu.
report.json per shot: dir, horizontal scroll (none), buttons/links under 44px (none on 390; 40px on 1280 is the ds desktop size), alert text (Urdu errors are in Urdu).
