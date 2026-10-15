import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const reply = { id: "r1", created: 1, model: "m", choices: [{ index: 0, message: { role: "assistant", content: "ok" }, finish_reason: "stop" }] };

async function load(env: Record<string, string>) {
  vi.resetModules();
  for (const [key, value] of Object.entries({ LLM_ENABLED: "", LLM_API_KEY: "", LLM_BASE_URL: "", ...env })) vi.stubEnv(key, value);
  return import("./llm");
}
const fetchMock = vi.fn();
beforeEach(() => { fetchMock.mockReset().mockImplementation(async () => new Response(JSON.stringify(reply), { status: 200 })); vi.stubGlobal("fetch", fetchMock); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

const params = { messages: [{ role: "user" as const, content: "hello" }] };

describe("language model switch", () => {
  it("is off by default and never calls out", async () => {
    const { invokeLLM, isLlmEnabled, LlmDisabledError, listLLMModels } = await load({});
    expect(isLlmEnabled()).toBe(false);
    await expect(invokeLLM(params)).rejects.toBeInstanceOf(LlmDisabledError);
    await expect(listLLMModels()).rejects.toBeInstanceOf(LlmDisabledError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("stays off when the switch is on but the provider is not configured, or the key is set but the switch is off", async () => {
    for (const env of [{ LLM_ENABLED: "true" }, { LLM_ENABLED: "true", LLM_API_KEY: "k" }, { LLM_ENABLED: "true", LLM_BASE_URL: "https://llm.example.test/v1" }, { LLM_ENABLED: "false", LLM_API_KEY: "k", LLM_BASE_URL: "https://llm.example.test/v1" }, { LLM_ENABLED: "TRUE", LLM_API_KEY: "k", LLM_BASE_URL: "https://llm.example.test/v1" }]) {
      const { isLlmEnabled, invokeLLM } = await load(env);
      expect(isLlmEnabled(), JSON.stringify(env)).toBe(false);
      await expect(invokeLLM(params)).rejects.toThrow("disabled");
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("calls the configured OpenAI-compatible endpoint with the configured key", async () => {
    const { invokeLLM, isLlmEnabled } = await load({ LLM_ENABLED: "true", LLM_API_KEY: "key-for-tests", LLM_BASE_URL: "https://llm.example.test/v1/" });
    expect(isLlmEnabled()).toBe(true);
    await expect(invokeLLM(params)).resolves.toMatchObject({ model: "m" });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://llm.example.test/v1/chat/completions");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer key-for-tests");
  });

  it("reports a provider failure by status only, never the body", async () => {
    fetchMock.mockImplementation(async () => new Response("prompt echo: budget 1234567", { status: 400 }));
    const { invokeLLM } = await load({ LLM_ENABLED: "true", LLM_API_KEY: "k", LLM_BASE_URL: "https://llm.example.test/v1" });
    vi.useFakeTimers();
    try {
      const pending = invokeLLM(params).catch(e => e as Error);
      await vi.advanceTimersByTimeAsync(120_000);
      expect(((await pending) as Error).message).toBe("LLM invoke failed: 400");
    } finally {
      vi.useRealTimers();
    }
  });
});
