import type { CourseFeedback, StudentTotals } from "~/services/courseAnalyticsService";
import { formatRating } from "./feedback-section";
import { SectionCard, SectionEmpty, StatTile, formatPercent } from "./shared";

// ─── Students section ───
// All-time headline numbers: student totals, completion rate and, when
// given, the average rating and rating count.

export function StudentsSection({
  students,
  feedback,
}: {
  students: StudentTotals;
  feedback?: Pick<CourseFeedback, "averageRating" | "ratingCount">;
}) {
  return (
    <SectionCard title="Students" description="All time">
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
          {feedback && (
            <>
              <StatTile
                label="Average rating (all time)"
                value={
                  feedback.averageRating === null
                    ? "—"
                    : `${formatRating(feedback.averageRating)} ★`
                }
                hint={feedback.averageRating === null ? "No ratings yet" : "out of 5"}
              />
              <StatTile
                label="Ratings (all time)"
                value={feedback.ratingCount.toLocaleString()}
              />
            </>
          )}
        </div>
      )}
    </SectionCard>
  );
}
