import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "~/components/ui/chart";

// ─── Lesson bar chart ───
// Horizontal bars, one per lesson in course order, labelled with lesson
// titles. Shared by the drop-off and per-lesson comment charts.

export interface LessonBar {
  lessonId: number;
  lessonTitle: string;
  moduleTitle: string;
  value: number;
}

const ROW_HEIGHT = 32;
const MIN_HEIGHT = 160;

export function LessonBarChart({
  bars,
  label,
  color,
}: {
  bars: LessonBar[];
  /** Series name shown in the tooltip, e.g. "Completed". */
  label: string;
  color: string;
}) {
  const config = { value: { label, color } } satisfies ChartConfig;
  const height = Math.max(MIN_HEIGHT, bars.length * ROW_HEIGHT + 40);

  return (
    <ChartContainer config={config} className="w-full" style={{ height }}>
      <BarChart data={bars} layout="vertical" margin={{ left: 8, right: 16, top: 8 }}>
        <CartesianGrid horizontal={false} />
        <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} />
        <YAxis
          type="category"
          dataKey="lessonId"
          width={160}
          tickLine={false}
          axisLine={false}
          interval={0}
          tickFormatter={(lessonId: number) => {
            const title = bars.find((bar) => bar.lessonId === lessonId)?.lessonTitle ?? "";
            return title.length > 24 ? `${title.slice(0, 23)}…` : title;
          }}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              labelFormatter={(_, payload) => {
                const bar = payload[0]?.payload as LessonBar | undefined;
                return bar ? `${bar.moduleTitle} › ${bar.lessonTitle}` : "";
              }}
            />
          }
        />
        <Bar dataKey="value" fill="var(--color-value)" radius={4} />
      </BarChart>
    </ChartContainer>
  );
}
