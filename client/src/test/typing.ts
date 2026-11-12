// D-85. A form test types into its fields with userEvent: every key is an input event and a React render. Alone a whole form takes well
// under a second; on a loaded 4-core machine (busy cores beside the client suite) forms of five to a dozen fields measured 5 to 9 s, past
// the 5 s test limit. The tests that type a whole form take this limit on purpose; a test that hangs still fails.
export const TYPING_TEST = { timeout: 20000 } as const;
