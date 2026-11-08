import { describe, it, expect } from "vitest";
import { groupTrendSeries } from "./courseAnalyticsTrends";

const KEYS = ["enrollments"] as const;

describe("groupTrendSeries — daily ranges", () => {
  it("returns one zero-filled point per UTC day for the last 7 days, today included", () => {
    const result = groupTrendSeries(
      [
        { date: "2026-06-10", enrollments: 2 },
        { date: "2026-06-15", enrollments: 1 },
      ],
      KEYS,
      "7d",
      { start: "2026-01-01", today: "2026-06-15" }
    );

    expect(result.granularity).toBe("day");
    expect(result.points).toEqual([
      { bucket: "2026-06-09", enrollments: 0 },
      { bucket: "2026-06-10", enrollments: 2 },
      { bucket: "2026-06-11", enrollments: 0 },
      { bucket: "2026-06-12", enrollments: 0 },
      { bucket: "2026-06-13", enrollments: 0 },
      { bucket: "2026-06-14", enrollments: 0 },
      { bucket: "2026-06-15", enrollments: 1 },
    ]);
  });
});

describe("groupTrendSeries — range cut-offs", () => {
  it("covers exactly the last 30 days and drops activity before them", () => {
    const result = groupTrendSeries(
      [
        { date: "2026-05-16", enrollments: 9 }, // 31st day back: outside
        { date: "2026-05-17", enrollments: 4 }, // 30th day back: inside
        { date: "2026-06-15", enrollments: 1 },
      ],
      KEYS,
      "30d",
      { start: "2026-01-01", today: "2026-06-15" }
    );

    expect(result.granularity).toBe("day");
    expect(result.points).toHaveLength(30);
    expect(result.points[0]).toEqual({ bucket: "2026-05-17", enrollments: 4 });
    expect(result.points.at(-1)).toEqual({ bucket: "2026-06-15", enrollments: 1 });
    expect(result.points.reduce((sum, p) => sum + p.enrollments, 0)).toBe(5);
  });
});

describe("groupTrendSeries — weekly (90 days)", () => {
  it("sums into Monday-start UTC weeks and drops days before the 90-day cut-off", () => {
    // today = Mon 2026-06-15 -> range starts Wed 2026-03-18 (week of Mon 03-16).
    const result = groupTrendSeries(
      [
        { date: "2026-03-17", enrollments: 50 }, // 91st day back: outside
        { date: "2026-03-18", enrollments: 1 },
        { date: "2026-03-22", enrollments: 2 }, // Sunday, same week
        { date: "2026-03-23", enrollments: 3 }, // Monday, next week
        { date: "2026-06-14", enrollments: 4 }, // Sunday
        { date: "2026-06-15", enrollments: 5 }, // Monday = last bucket
      ],
      KEYS,
      "90d",
      { start: "2026-01-01", today: "2026-06-15" }
    );

    expect(result.granularity).toBe("week");
    expect(result.points).toHaveLength(14);
    expect(result.points[0]).toEqual({ bucket: "2026-03-16", enrollments: 3 });
    expect(result.points[1]).toEqual({ bucket: "2026-03-23", enrollments: 3 });
    expect(result.points[2]).toEqual({ bucket: "2026-03-30", enrollments: 0 });
    expect(result.points.at(-2)).toEqual({ bucket: "2026-06-08", enrollments: 4 });
    expect(result.points.at(-1)).toEqual({ bucket: "2026-06-15", enrollments: 5 });
  });
});

describe("groupTrendSeries — monthly (all time)", () => {
  it("sums into UTC calendar months from course creation to today, zero-filling gaps", () => {
    const result = groupTrendSeries(
      [
        { date: "2025-11-20", enrollments: 1 },
        { date: "2025-11-30", enrollments: 2 },
        { date: "2025-12-01", enrollments: 3 },
        { date: "2025-12-31", enrollments: 4 },
        { date: "2026-02-28", enrollments: 5 },
      ],
      KEYS,
      "all",
      { start: "2025-11-15", today: "2026-03-02" }
    );

    expect(result.granularity).toBe("month");
    expect(result.points).toEqual([
      { bucket: "2025-11-01", enrollments: 3 },
      { bucket: "2025-12-01", enrollments: 7 },
      { bucket: "2026-01-01", enrollments: 0 },
      { bucket: "2026-02-01", enrollments: 5 },
      { bucket: "2026-03-01", enrollments: 0 },
    ]);
  });

  it("returns a single zero month for a new course with no activity", () => {
    const result = groupTrendSeries([], KEYS, "all", {
      start: "2026-06-03",
      today: "2026-06-15",
    });

    expect(result.points).toEqual([{ bucket: "2026-06-01", enrollments: 0 }]);
  });
});

describe("groupTrendSeries — several series and money", () => {
  it("sums every requested series per bucket, including revenue in cents", () => {
    const result = groupTrendSeries(
      [
        { date: "2026-06-08", enrollments: 1, revenue: 4999 },
        { date: "2026-06-10", enrollments: 2, revenue: 2501 },
        { date: "2026-06-14", enrollments: 0, revenue: 1 },
      ],
      ["enrollments", "revenue"] as const,
      "90d",
      { start: "2026-01-01", today: "2026-06-15" }
    );

    expect(result.points.at(-2)).toEqual({
      bucket: "2026-06-08",
      enrollments: 3,
      revenue: 7501,
    });
    expect(result.points.at(-1)).toEqual({
      bucket: "2026-06-15",
      enrollments: 0,
      revenue: 0,
    });
  });
});
