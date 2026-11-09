import { describe, expect, it } from "vitest";
import { choosePoolerHost, POOLER_HOST_CANDIDATES } from "../../scripts/bootstrap/lib";

// D-69, run 42532475589: the release picked the first pooler host that accepted the OWNER, then the restricted role was refused there with 28P01.
const [first, second] = POOLER_HOST_CANDIDATES;
const table = (answers: Record<string, { owner: string; app: string }>) => {
  const calls: string[] = [];
  const login = async (host: string, role: "owner" | "app") => { calls.push(`${host}/${role}`); return answers[host]?.[role] ?? "XX000"; };
  return { login, calls };
};

describe("choosePoolerHost: the host where the owner AND the application role sign in", () => {
  it("negative (the failing release): the first host takes the owner but refuses the app role with 28P01; the second takes both, and the second is chosen", async () => {
    const { login } = table({ [first]: { owner: "ok", app: "28P01" }, [second]: { owner: "ok", app: "ok" } });
    const choice = await choosePoolerHost(POOLER_HOST_CANDIDATES, login);
    expect(choice.host).toBe(second);
    expect(choice.appRoleProven).toBe(true);
    expect(choice.tried).toEqual([{ host: first, owner: "ok", app: "28P01" }, { host: second, owner: "ok", app: "ok" }]);
  });

  it("positive: one host serves the project (the other says Tenant or user not found); it is chosen, and the app role is never tried where the owner was refused", async () => {
    const { login, calls } = table({ [first]: { owner: "XX000", app: "ok" }, [second]: { owner: "ok", app: "ok" } });
    const choice = await choosePoolerHost(POOLER_HOST_CANDIDATES, login);
    expect(choice).toMatchObject({ host: second, appRoleProven: true });
    expect(calls).not.toContain(`${first}/app`);
  });

  it("the first run (the role has no password yet): the first host that takes the owner, reported as not proven for the app role", async () => {
    const { login } = table({ [first]: { owner: "ok", app: "28P01" }, [second]: { owner: "ok", app: "28P01" } });
    expect(await choosePoolerHost(POOLER_HOST_CANDIDATES, login)).toMatchObject({ host: first, appRoleProven: false });
  });

  it("negative: no host takes the owner, so no host is chosen", async () => {
    const { login } = table({ [first]: { owner: "28P01", app: "ok" }, [second]: { owner: "XX000", app: "ok" } });
    expect((await choosePoolerHost(POOLER_HOST_CANDIDATES, login)).host).toBe("");
  });

  it("the report names hosts, roles and codes only: nothing a login was given", async () => {
    const { login } = table({ [first]: { owner: "ok", app: "ok" } });
    const text = JSON.stringify(await choosePoolerHost([first], login));
    expect(Object.keys(JSON.parse(text))).toEqual(["host", "appRoleProven", "tried"]);
    expect(text).not.toMatch(/password|postgres(ql)?:\/\//i);
  });
});
