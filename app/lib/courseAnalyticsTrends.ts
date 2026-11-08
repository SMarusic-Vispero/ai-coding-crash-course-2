import type { AnalyticsRange } from "~/lib/analytics";

// ─── Course analytics trends ───
// Pure grouping of the per-course daily activity series into chart points.
// The service returns one entry per UTC day with activity; the page keeps the
// selected range in component state and calls this on every change, so no
// request is made. Every value series is summed per bucket — counts and money
// (cents) alike — and empty buckets are zero-filled so lines stay continuous.
// All dates are UTC `YYYY-MM-DD` strings.

/**
 * Series of the course's daily activity series, shared by the service (which
 * fills them) and the page (which charts them). Add a key to add a series.
 */
export const TREND_KEYS = [
  "enrollments",
  "completions",
  "lessonsCompleted",
  "revenue",
] as const;
export type TrendKey = (typeof TREND_KEYS)[number];

export type TrendGranularity = "day" | "week" | "month";

/** One day of activity: a UTC date plus a numeric value per series key. */
export type DailyValues<K extends string> = { date: string } & Record<K, number>;

/** One chart point: the bucket's first UTC day plus each series' sum. */
export type TrendPoint<K extends string> = { bucket: string } & Record<K, number>;

export interface TrendSeries<K extends string> {
  granularity: TrendGranularity;
  points: TrendPoint<K>[];
}

export interface TrendWindow {
  /** First day of the full series (course creation); used by "all". */
  start: string;
  /** Today (UTC), the last day of every range. */
  today: string;
}

const RANGE_DAYS: Record<Exclude<AnalyticsRange, "all">, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

const GRANULARITY: Record<AnalyticsRange, TrendGranularity> = {
  "7d": "day",
  "30d": "day",
  "90d": "week",
  all: "month",
};

function parseDay(day: string): Date {
  return new Date(`${day}T00:00:00.000Z`);
}

function formatDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(day: string, days: number): string {
  const date = parseDay(day);
  date.setUTCDate(date.getUTCDate() + days);
  return formatDay(date);
}

/** The first day of the bucket that contains `day`. Weeks start on Monday. */
function bucketStart(day: string, granularity: TrendGranularity): string {
  if (granularity === "day") return day;
  if (granularity === "month") return `${day.slice(0, 7)}-01`;
  const date = parseDay(day);
  const daysSinceMonday = (date.getUTCDay() + 6) % 7;
  return addDays(day, -daysSinceMonday);
}

function nextBucket(bucket: string, granularity: TrendGranularity): string {
  if (granularity === "day") return addDays(bucket, 1);
  if (granularity === "week") return addDays(bucket, 7);
  const date = parseDay(bucket);
  date.setUTCMonth(date.getUTCMonth() + 1);
  return formatDay(date);
}

/**
 * Groups a daily series into chart points for `range`: days for 7d/30d,
 * Monday-start weeks for 90d, calendar months for all time (all UTC).
 * Days before the range's first day are left out; the first week or month
 * bucket is labelled by its own first day even when that precedes the range.
 */
export function groupTrendSeries<K extends string>(
  daily: readonly DailyValues<K>[],
  keys: readonly K[],
  range: AnalyticsRange,
  window: TrendWindow
): TrendSeries<K> {
  const granularity = GRANULARITY[range];
  const from =
    range === "all"
      ? minDay(window.start, daily[0]?.date ?? window.start)
      : addDays(window.today, -(RANGE_DAYS[range] - 1));

  const sums = new Map<string, Record<K, number>>();
  const zero = () =>
    Object.fromEntries(keys.map((key) => [key, 0])) as Record<K, number>;

  const lastBucket = bucketStart(window.today, granularity);
  for (
    let bucket = bucketStart(from, granularity);
    bucket <= lastBucket;
    bucket = nextBucket(bucket, granularity)
  ) {
    sums.set(bucket, zero());
  }

  for (const day of daily) {
    if (day.date < from || day.date > window.today) continue;
    const totals = sums.get(bucketStart(day.date, granularity));
    if (!totals) continue;
    for (const key of keys) totals[key] += day[key];
  }

  return {
    granularity,
    points: [...sums].map(
      ([bucket, totals]) => ({ bucket, ...totals }) as TrendPoint<K>
    ),
  };
}

function minDay(a: string, b: string): string {
  return a < b ? a : b;
}
