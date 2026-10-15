/** Czech date/time and match-state formatting shared across pages. */

const DATE_TIME: Intl.DateTimeFormatOptions = {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
};

const DATE_ONLY: Intl.DateTimeFormatOptions = {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
};

function parse(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "23. 02. 2026 18:00"; unparsable input is returned as-is, empty input as "—". */
export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const d = parse(value);
  return d ? d.toLocaleString("cs-CZ", DATE_TIME) : value;
}

/** "23. 02. 2026"; unparsable input is returned as-is, empty input as "—". */
export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = parse(value);
  return d ? d.toLocaleDateString("cs-CZ", DATE_ONLY) : value;
}

/** Seconds -> "mm:ss" (minutes keep growing past 99, e.g. "105:03"). */
export function formatClock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

const STATUS_LABELS: Record<string, string> = {
  planned: "Plánováno",
  live_half_1: "1. poločas",
  half_time: "Poločas",
  live_half_2: "2. poločas",
  finished: "Ukončeno",
};

export function matchStatusLabel(status: string | null | undefined): string {
  if (!status) return "Načítám…";
  return STATUS_LABELS[status] ?? status;
}
