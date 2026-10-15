import { AxiosError, type AxiosAdapter, type AxiosResponse } from "axios";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AUTH_EXPIRED_EVENT } from "@/auth/token";

import { api } from "./client";

function failWith(status: number): AxiosAdapter {
  return async (config) => {
    throw new AxiosError("fail", "ERR", config, undefined, {
      status,
      statusText: "",
      data: {},
      headers: {},
      config,
    } as AxiosResponse);
  };
}

describe("401 handling", () => {
  let store: Map<string, string>;
  let expired: number;
  const onExpired = () => {
    expired += 1;
  };

  beforeEach(() => {
    store = new Map();
    expired = 0;
    const windowStub = new EventTarget();
    vi.stubGlobal("window", windowStub);
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    });
    windowStub.addEventListener(AUTH_EXPIRED_EVENT, onExpired);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("clears the token and announces the expiry when a token was sent", async () => {
    store.set("trainerapp_access_token", "old-token");
    await expect(api.get("/x", { adapter: failWith(401) })).rejects.toBeDefined();
    expect(store.has("trainerapp_access_token")).toBe(false);
    expect(expired).toBe(1);
  });

  it("does not treat a failed login (no token) as an expired session", async () => {
    await expect(api.post("/auth/login", {}, { adapter: failWith(401) })).rejects.toBeDefined();
    expect(expired).toBe(0);
  });

  it("keeps the token on other errors", async () => {
    store.set("trainerapp_access_token", "valid");
    await expect(api.get("/x", { adapter: failWith(500) })).rejects.toBeDefined();
    expect(store.get("trainerapp_access_token")).toBe("valid");
    expect(expired).toBe(0);
  });
});
