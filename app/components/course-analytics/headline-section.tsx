import type {
  CourseFeedback,
  QuizAttemptMode,
  QuizModeFigures,
  SalesAnalytics,
  StudentTotals,
} from "~/services/courseAnalyticsService";
import { formatCents } from "~/lib/utils";
import {
  QUIZ_MODE_LABELS,
  SectionCard,
  SectionEmpty,
  StatTile,
  formatPercent,
  formatRating,
} from "./shared";

// ─── Headline section ───
// All-time headline numbers in one card: students, completion rate, average
// rating, quiz pass rate (following the page's first/best toggle) and, for
// paid courses, revenue, purchases and average price paid.

export function HeadlineSection({
  students,
  feedback,
  quizMode,
  quizzes,
  sales,
  isFree,
}: {
  students: StudentTotals;
  feedback: Pick<CourseFeedback, "averageRating" | "ratingCount">;
  quizMode: QuizAttemptMode;
  quizzes: QuizModeFigures;
  sales: Pick<SalesAnalytics, "revenue" | "purchases" | "seats" | "averagePrice">;
  isFree: boolean;
}) {
  return (
    <SectionCard title="Headline numbers" description="All time">
      {students.total === 0 || students.completionRate === null ? (
        <SectionEmpty
          title="No enrollments yet"
          body="Student numbers appear here once someone enrolls."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile
            label="Total students (all time)"
            value={students.total.toLocaleString()}
          />
          <StatTile
            label="Completion rate (all time)"
            value={formatPercent(students.completionRate)}
            hint={`${students.completed.toLocaleString()} of ${students.total.toLocaleString()} completed`}
          />
          <StatTile
            label="Average rating (all time)"
            value={
              feedback.averageRating === null
                ? "—"
                : `${formatRating(feedback.averageRating)} ★`
            }
            hint={
              feedback.averageRating === null
                ? "No ratings yet"
                : `out of 5 · ${feedback.ratingCount.toLocaleString()} ratings`
            }
          />
          <StatTile
            label="Quiz pass rate (all time)"
            value={quizzes.passRate === null ? "—" : formatPercent(quizzes.passRate)}
            hint={
              quizzes.quizzes.length === 0
                ? "No quizzes in this course"
                : quizzes.passRate === null
                  ? "No quiz attempts yet"
                  : QUIZ_MODE_LABELS[quizMode]
            }
          />
          {!isFree && (
            <>
              <StatTile
                label="Total revenue (all time)"
                value={formatCents(sales.revenue)}
              />
              <StatTile
                label="Purchases (all time)"
                value={sales.purchases.toLocaleString()}
              />
              <StatTile
                label="Average price paid (all time)"
                value={
                  sales.averagePrice === null
                    ? "—"
                    : formatCents(Math.round(sales.averagePrice))
                }
                hint={
                  sales.averagePrice === null
                    ? "No sales yet"
                    : `per seat · ${sales.seats.toLocaleString()} seats paid for`
                }
              />
            </>
          )}
        </div>
      )}
    </SectionCard>
  );
}
