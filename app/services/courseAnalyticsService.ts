import { and, eq, ne, sql } from "drizzle-orm";
import { db } from "~/db";
import { enrollments } from "~/db/schema";

// ─── Course Analytics Service ───
// Per-course analytics for the course's own instructor
// (/instructor/:courseId/analytics). One entry point returns the whole page
// payload; each section is computed by its own function so later sections
// (trends, sales, progress, quizzes, feedback) are added as new keys.
// Every query excludes the instructor's own rows.
// Uses positional parameters (project convention).

// ─── Students ───

export interface StudentTotals {
  /** All-time enrollments, excluding the instructor. */
  total: number;
  /** Enrollments with a completion date. */
  completed: number;
  /** completed ÷ total, 0..1; null when there are no enrollments. */
  completionRate: number | null;
}

function getStudentTotals(courseId: number, instructorId: number): StudentTotals {
  const row = db
    .select({
      total: sql<number>`count(*)`,
      completed: sql<number>`count(${enrollments.completedAt})`,
    })
    .from(enrollments)
    .where(
      and(eq(enrollments.courseId, courseId), ne(enrollments.userId, instructorId))
    )
    .get();

  const total = row?.total ?? 0;
  const completed = row?.completed ?? 0;
  return {
    total,
    completed,
    completionRate: total === 0 ? null : completed / total,
  };
}

// ─── Entry point ───

export function getCourseAnalytics(courseId: number, instructorId: number) {
  return {
    students: getStudentTotals(courseId, instructorId),
  };
}

export type CourseAnalytics = ReturnType<typeof getCourseAnalytics>;
