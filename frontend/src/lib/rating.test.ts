import { describe, expect, it } from "vitest";

import { previewFinalRating } from "./rating";

describe("previewFinalRating", () => {
  it("mixes 80 % system and 20 % coach", () => {
    expect(previewFinalRating(6.0, 10)).toBe(6.8);
  });

  it("rounds half up like the backend", () => {
    expect(previewFinalRating(5.1, 10)).toBe(6.1);
  });

  it("returns the system rating without a valid coach mark", () => {
    expect(previewFinalRating(6.3, null)).toBe(6.3);
    expect(previewFinalRating(6.3, undefined)).toBe(6.3);
    expect(previewFinalRating(6.3, 0)).toBe(6.3);
    expect(previewFinalRating(6.3, 11)).toBe(6.3);
    expect(previewFinalRating(6.3, Number.NaN)).toBe(6.3);
  });

  it("uses the weights it is given", () => {
    expect(previewFinalRating(6, 10, { auto_weight: 0.5, coach_weight: 0.5 })).toBe(8);
  });
});
