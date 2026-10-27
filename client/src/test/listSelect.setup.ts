import { vi } from "vitest";

// Every test gets the native stand-in for the design system's ListSelect (see nativeListSelect.tsx); the rest of the module (Option, optionsOf,
// EMPTY_VALUE) is the real one. A test of the real component undoes it with vi.unmock("@/components/ds/ListSelect").
vi.mock("@/components/ds/ListSelect", async () => {
  const actual = await vi.importActual<typeof import("@/components/ds/ListSelect")>("@/components/ds/ListSelect");
  const { makeNativeListSelect } = await import("./nativeListSelect");
  return { ...actual, ListSelect: makeNativeListSelect(actual.optionsOf) };
});
