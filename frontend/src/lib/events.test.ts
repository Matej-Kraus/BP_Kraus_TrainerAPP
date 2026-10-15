import { describe, expect, it } from "vitest";

import { EVENT_LABELS, EVENT_ORDER, EVENT_TO_STATS_KEY } from "./events";

describe("event definitions", () => {
  const types = Object.keys(EVENT_LABELS).sort();

  it("lists every event type exactly once in EVENT_ORDER", () => {
    expect([...EVENT_ORDER].sort()).toEqual(types);
    expect(new Set(EVENT_ORDER).size).toBe(EVENT_ORDER.length);
  });

  it("maps every event type to its own stats column", () => {
    expect(Object.keys(EVENT_TO_STATS_KEY).sort()).toEqual(types);
    const columns = Object.values(EVENT_TO_STATS_KEY);
    expect(new Set(columns).size).toBe(columns.length);
  });

  it("uses a single Czech name for the error event", () => {
    expect(EVENT_LABELS.error).toBe("Chyba");
  });
});
