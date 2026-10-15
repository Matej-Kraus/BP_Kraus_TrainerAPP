import type { RatingConfig } from "@/api/ratings";

/** Used until the weights are loaded from GET /rating-config (mirrors the backend defaults). */
export const DEFAULT_RATING_CONFIG: RatingConfig = { auto_weight: 0.8, coach_weight: 0.2 };

/**
 * Live preview of the final rating while the coach is typing a mark.
 * The saved/official value always comes from the backend (`final_rating`).
 */
export function previewFinalRating(
  auto: number,
  coach: number | null | undefined,
  config: RatingConfig = DEFAULT_RATING_CONFIG,
): number {
  if (coach == null || !Number.isFinite(coach) || coach < 1 || coach > 10) return auto;
  const mixed = config.auto_weight * auto + config.coach_weight * coach;
  return Math.floor(mixed * 10 + 0.5) / 10; // round half up, like the backend
}
