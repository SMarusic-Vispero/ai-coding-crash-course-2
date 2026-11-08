import { and, eq, isNotNull, ne, sql } from "drizzle-orm";
import { db } from "~/db";
import {
  courses,
  enrollments,
  lessonProgress,
  lessons,
  LessonProgressStatus,
  modules,
} from "~/db/schema";
import {
  TREND_KEYS,
  type DailyValues,
  type TrendKey,
} from "~/lib/courseAnalyticsTrends";

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

// ─── Trends ───

/** One UTC day with activity; zero-filling happens client-side. */
export type DailyActivity = DailyValues<TrendKey>;

export interface CourseTrends {
  /** UTC day the course was created: first day of the "all time" range. */
  start: string;
  /** Today's UTC day: last day of every range. */
  today: string;
  /** One entry per UTC day with any activity, ascending by date. */
  daily: DailyActivity[];
}

interface DayCount {
  day: string;
  count: number;
}

function getEnrollmentsPerDay(courseId: number, instructorId: number): DayCount[] {
  const day = sql<string>`substr(${enrollments.enrolledAt}, 1, 10)`;
  return db
    .select({ day, count: sql<number>`count(*)` })
    .from(enrollments)
    .where(and(eq(enrollments.courseId, courseId), ne(enrollments.userId, instructorId)))
    .groupBy(day)
    .all();
}

function getCompletionsPerDay(courseId: number, instructorId: number): DayCount[] {
  const day = sql<string>`substr(${enrollments.completedAt}, 1, 10)`;
  return db
    .select({ day, count: sql<number>`count(*)` })
    .from(enrollments)
    .where(
      and(
        eq(enrollments.courseId, courseId),
        ne(enrollments.userId, instructorId),
        isNotNull(enrollments.completedAt)
      )
    )
    .groupBy(day)
    .all();
}

function getLessonsCompletedPerDay(courseId: number, instructorId: number): DayCount[] {
  const day = sql<string>`substr(${lessonProgress.completedAt}, 1, 10)`;
  return db
    .select({ day, count: sql<number>`count(*)` })
    .from(lessonProgress)
    .innerJoin(lessons, eq(lessons.id, lessonProgress.lessonId))
    .innerJoin(modules, eq(modules.id, lessons.moduleId))
    .where(
      and(
        eq(modules.courseId, courseId),
        ne(lessonProgress.userId, instructorId),
        eq(lessonProgress.status, LessonProgressStatus.Completed),
        isNotNull(lessonProgress.completedAt)
      )
    )
    .groupBy(day)
    .all();
}

/** Merges per-key day totals into one row per active day, sorted by date. */
function mergeDaily(perKey: Record<TrendKey, DayCount[]>): DailyActivity[] {
  const byDay = new Map<string, DailyActivity>();
  for (const key of TREND_KEYS) {
    for (const { day, count } of perKey[key]) {
      let row = byDay.get(day);
      if (!row) {
        row = { date: day } as DailyActivity;
        for (const k of TREND_KEYS) row[k] = 0;
        byDay.set(day, row);
      }
      row[key] += count;
    }
  }
  return [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function getTrends(courseId: number, instructorId: number, now: Date): CourseTrends {
  const course = db
    .select({ createdAt: courses.createdAt })
    .from(courses)
    .where(eq(courses.id, courseId))
    .get();
  const today = now.toISOString().slice(0, 10);

  return {
    start: course?.createdAt.slice(0, 10) ?? today,
    today,
    daily: mergeDaily({
      enrollments: getEnrollmentsPerDay(courseId, instructorId),
      completions: getCompletionsPerDay(courseId, instructorId),
      lessonsCompleted: getLessonsCompletedPerDay(courseId, instructorId),
    }),
  };
}

// ─── Entry point ───

export function getCourseAnalytics(
  courseId: number,
  instructorId: number,
  now: Date = new Date()
) {
  return {
    students: getStudentTotals(courseId, instructorId),
    trends: getTrends(courseId, instructorId, now),
  };
}

export type CourseAnalytics = ReturnType<typeof getCourseAnalytics>;
