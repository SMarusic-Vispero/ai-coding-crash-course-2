import { useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import {
  ANALYTICS_RANGES,
  ANALYTICS_RANGE_LABELS,
  DEFAULT_ANALYTICS_RANGE,
  type AnalyticsRange,
} from "~/lib/analytics";
import {
  TREND_KEYS,
  groupTrendSeries,
  type TrendGranularity,
  type TrendKey,
  type TrendPoint,
} from "~/lib/courseAnalyticsTrends";
import type { CourseTrends } from "~/services/courseAnalyticsService";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "~/components/ui/chart";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { SectionCard, SectionEmpty } from "./shared";

// ─── Trends section ───
// Line charts of the daily activity series. The range lives in component
// state only (resets to 30 days on every load); changing it regroups the
// series already in the loader data, so no request is made.

interface TrendChartSpec {
  key: TrendKey;
  title: string;
  color: string;
  /** Formats a value for the axis and tooltip; defaults to a plain count. */
  format?: (value: number) => string;
}

/** One chart per series, in display order. Add an entry to add a chart. */
const TREND_CHARTS: TrendChartSpec[] = [
  { key: "enrollments", title: "New enrollments", color: "var(--chart-1)" },
  { key: "completions", title: "Course completions", color: "var(--chart-2)" },
  { key: "lessonsCompleted", title: "Lessons completed", color: "var(--chart-3)" },
];

const formatCount = (value: number) => value.toLocaleString();

const GRANULARITY_LABEL: Record<TrendGranularity, string> = {
  day: "day",
  week: "week",
  month: "month",
};

/** Labels a bucket's first day: "Jun 14", "Week of Jun 8", "Jun 2026". */
function formatBucket(bucket: string, granularity: TrendGranularity): string {
  const date = new Date(`${bucket}T00:00:00.000Z`);
  if (granularity === "month") {
    return date.toLocaleDateString("en-US", {
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    });
  }
  const day = date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
  return granularity === "week" ? `Week of ${day}` : day;
}

export function TrendsSection({ trends }: { trends: CourseTrends }) {
  const [range, setRange] = useState<AnalyticsRange>(DEFAULT_ANALYTICS_RANGE);

  const series = useMemo(
    () =>
      groupTrendSeries(trends.daily, TREND_KEYS, range, {
        start: trends.start,
        today: trends.today,
      }),
    [trends, range]
  );

  const picker = (
    <Select value={range} onValueChange={(value) => setRange(value as AnalyticsRange)}>
      <SelectTrigger className="w-40" aria-label="Trend range">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {ANALYTICS_RANGES.map((option) => (
          <SelectItem key={option} value={option}>
            {ANALYTICS_RANGE_LABELS[option]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  if (trends.daily.length === 0) {
    return (
      <SectionCard title="Trends">
        <SectionEmpty
          title="No activity yet"
          body="Enrollments, completions and lesson progress appear here once students start the course."
        />
      </SectionCard>
    );
  }

  return (
    <SectionCard
      title="Trends"
      description={`${ANALYTICS_RANGE_LABELS[range]}, per ${GRANULARITY_LABEL[series.granularity]} (UTC)`}
      action={picker}
    >
      <div className="grid gap-6 lg:grid-cols-2">
        {TREND_CHARTS.map((chart) => (
          <TrendLineChart
            key={chart.key}
            spec={chart}
            points={series.points}
            granularity={series.granularity}
          />
        ))}
      </div>
    </SectionCard>
  );
}

function TrendLineChart({
  spec,
  points,
  granularity,
}: {
  spec: TrendChartSpec;
  points: TrendPoint<TrendKey>[];
  granularity: TrendGranularity;
}) {
  const format = spec.format ?? formatCount;
  const config = {
    [spec.key]: { label: spec.title, color: spec.color },
  } satisfies ChartConfig;

  return (
    <div>
      <h3 className="mb-2 text-sm font-medium">{spec.title}</h3>
      <ChartContainer config={config} className="h-56 w-full">
        <LineChart data={points} margin={{ left: 8, right: 8, top: 8 }}>
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="bucket"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            minTickGap={24}
            tickFormatter={(bucket: string) =>
              formatBucket(bucket, granularity === "week" ? "day" : granularity)
            }
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={56}
            allowDecimals={false}
            tickFormatter={(value: number) => format(value)}
          />
          <ChartTooltip
            content={
              <ChartTooltipContent
                labelFormatter={(_, payload) =>
                  formatBucket(String(payload[0]?.payload?.bucket ?? ""), granularity)
                }
                formatter={(value) => (
                  <div className="flex w-full justify-between gap-4">
                    <span className="text-muted-foreground">{spec.title}</span>
                    <span className="font-mono font-medium tabular-nums">
                      {format(Number(value))}
                    </span>
                  </div>
                )}
              />
            }
          />
          <Line
            dataKey={spec.key}
            type="monotone"
            stroke={`var(--color-${spec.key})`}
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ChartContainer>
    </div>
  );
}
