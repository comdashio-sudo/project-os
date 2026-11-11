// D-85. Building an .xlsx loads ExcelJS (a large module, on first use in each test file) and then writes the workbook. Alone that takes a
// few hundred milliseconds; on a loaded 4-core machine (a full client run beside another, or the database suite) it measured 1.5 to 4 s,
// beyond waitFor's 1 s default and close to a test's 5 s. These are the deliberate limits for waiting on an export, not a blanket raise:
// a real hang (no download at all) still fails, after 15 s.
export const EXPORT_WAIT = { timeout: 15000 } as const;
/** for a describe whose tests wait on one or more exports */
export const EXPORT_TEST = { timeout: 30000 } as const;
