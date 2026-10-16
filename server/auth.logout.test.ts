import { beforeEach, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => ({ revoke: vi.fn(async () => true), revokeAllForUser: vi.fn(async () => 2), create: vi.fn(), findLive: vi.fn() }));
vi.mock("./_core/sessionStore", () => ({ sessionStore: store }));

import { appRouter } from "./routers";
import { COOKIE_NAME } from "../shared/const";
import type { TrpcContext } from "./_core/context";

type CookieCall = {
  name: string;
  options: Record<string, unknown>;
};

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(): { ctx: TrpcContext; clearedCookies: CookieCall[] } {
  const clearedCookies: CookieCall[] = [];

  const user: AuthenticatedUser = {
    id: 1,
    openId: "sample-user",
    email: "sample@example.com",
    name: "Sample User",
    loginMethod: "email",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  const ctx: TrpcContext = {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: (name: string, options: Record<string, unknown>) => {
        clearedCookies.push({ name, options });
      },
    } as TrpcContext["res"],
  };

  return { ctx, clearedCookies };
}

beforeEach(() => { store.revoke.mockClear(); store.revokeAllForUser.mockClear(); });

describe("auth.logout", () => {
  it("clears the session cookie and reports success", async () => {
    const { ctx, clearedCookies } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.auth.logout();

    expect(result).toEqual({ success: true });
    expect(clearedCookies).toHaveLength(1);
    expect(clearedCookies[0]?.name).toBe(COOKIE_NAME);
    expect(clearedCookies[0]?.options).toMatchObject({
      maxAge: -1,
      secure: true,
      sameSite: "lax",
      httpOnly: true,
      path: "/",
    });
  });

  it("ends the session it was called from in the server, before clearing the cookie", async () => {
    const { ctx, clearedCookies } = createAuthContext();
    await appRouter.createCaller({ ...ctx, sessionId: "session-1" }).auth.logout();
    expect(store.revoke).toHaveBeenCalledWith("session-1");
    expect(clearedCookies).toHaveLength(1);
  });

  it("still clears the cookie, and revokes nothing, when the caller has no session", async () => {
    const { ctx, clearedCookies } = createAuthContext();
    await appRouter.createCaller({ ...ctx, user: null }).auth.logout();
    expect(store.revoke).not.toHaveBeenCalled();
    expect(clearedCookies).toHaveLength(1);
  });

  it("'sign out everywhere' revokes every session of the signed-in user, refuses a stranger, and clears the cookie", async () => {
    const { ctx, clearedCookies } = createAuthContext();
    expect(await appRouter.createCaller(ctx).auth.logoutEverywhere()).toEqual({ success: true, ended: 2 });
    expect(store.revokeAllForUser).toHaveBeenCalledWith(1);
    expect(clearedCookies).toHaveLength(1);
    await expect(appRouter.createCaller({ ...ctx, user: null }).auth.logoutEverywhere()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(store.revokeAllForUser).toHaveBeenCalledTimes(1);
  });
});
