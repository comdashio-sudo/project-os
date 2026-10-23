// A stand-in for the `trpc.dataImports` hooks the import screen uses, shared by its three interaction tests. Mutations run the hook's own onSuccess like the real client does.
import { vi } from "vitest";

type Options = { onSuccess?: (result: any) => void };
export type ImportsMockState = {
  list: unknown[]; detail: unknown; progress: unknown;
  createUpload: ReturnType<typeof vi.fn>; registerUpload: ReturnType<typeof vi.fn>; reanalyze: ReturnType<typeof vi.fn>; confirm: ReturnType<typeof vi.fn>;
  /** The differences preview of an export → re-import file; absent in a test that does not exercise it, which then sees a module without a preview. */
  diff?: unknown; template?: ReturnType<typeof vi.fn>;
};

export function importsTrpc(state: ImportsMockState) {
  const mutation = (run: () => ReturnType<typeof vi.fn>) => (options?: Options) => ({
    mutate: (input: unknown) => { void Promise.resolve(run()(input)).then(result => options?.onSuccess?.(result)); },
    mutateAsync: async (input: unknown) => { const result = await run()(input); options?.onSuccess?.(result); return result; },
    isPending: false, error: null, data: null, reset: vi.fn(),
  });
  return {
    dataImports: {
      list: { useQuery: () => ({ data: state.list, refetch: vi.fn() }) },
      detail: { useQuery: () => ({ data: state.detail, refetch: vi.fn(), error: null }) },
      progress: { useQuery: (_input: unknown, options?: { enabled?: boolean }) => ({ data: options?.enabled === false ? undefined : state.progress, refetch: vi.fn(), error: null }) },
      createUpload: { useMutation: mutation(() => state.createUpload) },
      registerUpload: { useMutation: mutation(() => state.registerUpload) },
      reanalyze: { useMutation: mutation(() => state.reanalyze) },
      confirm: { useMutation: mutation(() => state.confirm) },
      template: { useMutation: mutation(() => state.template ?? vi.fn()) },
      diff: { useQuery: (_input: unknown, options?: { enabled?: boolean }) => ({ data: options?.enabled === false ? undefined : state.diff, isLoading: false, error: null, refetch: vi.fn() }) },
    },
  };
}
