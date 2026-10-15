import type { components } from "./schema";

/**
 * Types generated from the backend OpenAPI schema (run `npm run gen:api` after changing
 * the backend API). Use these in new code, e.g. `Schemas["MatchOut"]`.
 */
export type Schemas = components["schemas"];
