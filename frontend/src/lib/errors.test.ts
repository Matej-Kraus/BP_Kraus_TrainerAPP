import { AxiosError, type AxiosResponse } from "axios";
import { describe, expect, it } from "vitest";

import { getErrorMessage } from "./errors";

function apiError(data: unknown, message = "Request failed with status code 400") {
  return new AxiosError(message, "ERR_BAD_REQUEST", undefined, undefined, {
    data,
    status: 400,
    statusText: "Bad Request",
    headers: {},
    config: {},
  } as AxiosResponse);
}

describe("getErrorMessage", () => {
  it("returns the FastAPI string detail", () => {
    expect(getErrorMessage(apiError({ detail: "Match is not live" }))).toBe("Match is not live");
  });

  it("serializes non-string detail (validation errors)", () => {
    const detail = [{ loc: ["body", "email"], msg: "field required" }];
    expect(getErrorMessage(apiError({ detail }))).toBe(JSON.stringify(detail));
  });

  it("falls back to the axios message without a detail", () => {
    expect(getErrorMessage(apiError({}, "Network Error"))).toBe("Network Error");
    expect(getErrorMessage(new AxiosError("timeout"))).toBe("timeout");
  });

  it("handles plain errors and unknown values", () => {
    expect(getErrorMessage(new Error("boom"))).toBe("boom");
    expect(getErrorMessage("weird")).toBe("Operace selhala");
    expect(getErrorMessage(undefined)).toBe("Operace selhala");
  });
});
