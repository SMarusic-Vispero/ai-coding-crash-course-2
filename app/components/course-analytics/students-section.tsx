import type { StudentTotals } from "~/services/courseAnalyticsService";
import { SectionCard, SectionEmpty, StatTile, formatPercent } from "./shared";

// ─── Students section ───
// All-time student totals and completion rate.

export function StudentsSection({ students }: { students: StudentTotals }) {
  return (
    <SectionCard title="Students" description="All time">
      {students.total === 0 || students.completionRate === null ? (
        <SectionEmpty
          title="No enrollments yet"
          body="Student numbers appear here once someone enrolls."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <StatTile
            label="Total students (all time)"
            value={students.total.toLocaleString()}
          />
          <StatTile
            label="Completion rate (all time)"
            value={formatPercent(students.completionRate)}
            hint={`${students.completed.toLocaleString()} of ${students.total.toLocaleString()} completed`}
          />
        </div>
      )}
    </SectionCard>
  );
}
