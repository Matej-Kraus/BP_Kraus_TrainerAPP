import axios from "axios";

/** Human-readable message from an API/network error (FastAPI returns `{ detail }`). */
export function getErrorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data;
    if (typeof data === "object" && data !== null && "detail" in data) {
      const detail = (data as { detail?: unknown }).detail;
      if (typeof detail === "string") return detail;
      if (detail != null) return JSON.stringify(detail);
    }
    return err.message;
  }
  if (err instanceof Error) return err.message;
  return "Operace selhala";
}
