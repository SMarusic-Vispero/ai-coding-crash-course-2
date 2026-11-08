import { CourseStatus } from "~/db/schema";

// ─── Course analytics availability ───
// One rule for whether a course has a per-course analytics page
// (/instructor/:courseId/analytics). Used by its loader and by every link to it.

/** Analytics exist once a course has left draft (published or archived). */
export function hasCourseAnalytics(status: CourseStatus): boolean {
  return status !== CourseStatus.Draft;
}
