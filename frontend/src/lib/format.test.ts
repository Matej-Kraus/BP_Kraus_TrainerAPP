import { describe, expect, it } from "vitest";

import { formatClock, formatDate, formatDateTime, matchStatusLabel } from "./format";

// Intl uses non-breaking spaces in some ICU versions; compare with normalized spaces.
const norm = (s: string) => s.replace(/\s/g, " ");

describe("formatClock", () => {
  it("formats seconds as mm:ss", () => {
    expect(formatClock(0)).toBe("00:00");
    expect(formatClock(65)).toBe("01:05");
    expect(formatClock(45 * 60)).toBe("45:00");
  });

  it("keeps counting minutes past 99", () => {
    expect(formatClock(105 * 60 + 3)).toBe("105:03");
  });

  it("clamps negative values and drops fractions", () => {
    expect(formatClock(-5)).toBe("00:00");
    expect(formatClock(59.9)).toBe("00:59");
  });
});

describe("formatDateTime / formatDate", () => {
  it("formats an ISO datetime in Czech style", () => {
    expect(norm(formatDateTime("2026-02-23T18:00:00"))).toBe("23. 02. 2026 18:00");
    expect(norm(formatDate("2026-02-23T18:00:00"))).toBe("23. 02. 2026");
  });

  it("shows a dash for empty input and echoes unparsable input", () => {
    expect(formatDateTime(null)).toBe("—");
    expect(formatDate(undefined)).toBe("—");
    expect(formatDateTime("not a date")).toBe("not a date");
  });
});

describe("matchStatusLabel", () => {
  it("translates every match status", () => {
    expect(matchStatusLabel("planned")).toBe("Plánováno");
    expect(matchStatusLabel("live_half_1")).toBe("1. poločas");
    expect(matchStatusLabel("half_time")).toBe("Poločas");
    expect(matchStatusLabel("live_half_2")).toBe("2. poločas");
    expect(matchStatusLabel("finished")).toBe("Ukončeno");
  });

  it("handles missing and unknown statuses", () => {
    expect(matchStatusLabel(null)).toBe("Načítám…");
    expect(matchStatusLabel("something_new")).toBe("something_new");
  });
});
