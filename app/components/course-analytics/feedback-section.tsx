import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import type { CourseFeedback } from "~/services/courseAnalyticsService";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "~/components/ui/chart";
import { LessonBarChart } from "./lesson-bar-chart";
import { SectionCard, SectionEmpty } from "./shared";

// ─── Feedback section ───
// Star-rating distribution and comment counts per lesson. The average
// rating and rating count also appear in the headline numbers.

const starConfig = {
  count: { label: "Ratings", color: "var(--chart-4)" },
} satisfies ChartConfig;

export function FeedbackSection({ feedback }: { feedback: CourseFeedback }) {
  const hasComments = feedback.commentsPerLesson.some((lesson) => lesson.comments > 0);

  return (
    <SectionCard title="Feedback" description="All time">
      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <h3 className="mb-2 text-sm font-medium">Star ratings</h3>
          {feedback.ratingCount === 0 ? (
            <SectionEmpty title="No ratings yet" body="Ratings appear here once students rate the course." />
          ) : (
            <ChartContainer config={starConfig} className="h-56 w-full">
              <BarChart
                data={feedback.distribution.map((d) => ({ ...d, label: `${d.stars}★` }))}
                margin={{ left: 8, right: 8, top: 8 }}
              >
                <CartesianGrid vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
                <YAxis tickLine={false} axisLine={false} width={40} allowDecimals={false} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="count" fill="var(--color-count)" radius={4} />
              </BarChart>
            </ChartContainer>
          )}
        </div>
        <div>
          <h3 className="mb-2 text-sm font-medium">Comments per lesson</h3>
          {hasComments ? (
            <LessonBarChart
              label="Comments"
              color="var(--chart-5)"
              bars={feedback.commentsPerLesson.map((lesson) => ({
                lessonId: lesson.lessonId,
                lessonTitle: lesson.lessonTitle,
                moduleTitle: lesson.moduleTitle,
                value: lesson.comments,
              }))}
            />
          ) : (
            <SectionEmpty title="No comments yet" body="Lesson comments appear here once students post them." />
          )}
        </div>
      </div>
    </SectionCard>
  );
}
