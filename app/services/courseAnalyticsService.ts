import { and, asc, desc, eq, inArray, isNotNull, isNull, ne, sql, type SQL } from "drizzle-orm";
import type { SQLiteColumn, SQLiteSelect, SQLiteTable } from "drizzle-orm/sqlite-core";
import { db } from "~/db";
import {
  comments,
  coupons,
  courseRatings,
  courses,
  enrollments,
  purchases,
  lessonProgress,
  lessons,
  LessonProgressStatus,
  modules,
  quizAnswers,
  quizAttempts,
  quizOptions,
  quizQuestions,
  quizzes,
} from "~/db/schema";
import {
  TREND_KEYS,
  type DailyValues,
  type TrendKey,
} from "~/lib/courseAnalyticsTrends";

// ─── Course Analytics Service ───
// Per-course analytics for the course's own instructor
// (/instructor/:courseId/analytics). One entry point returns the whole page
// payload; each section is computed by its own function under its own key.
// Every query excludes the instructor's own rows.
// Uses positional parameters (project convention).

// ─── Shared queries ───

/** Course order: module position, then lesson position, then lesson id. */
const LESSON_ORDER = [asc(modules.position), asc(lessons.position), asc(lessons.id)];

/**
 * Narrows a dynamic select over `lessons` to the course's lessons, joined to
 * their modules and in course order. Callers add their own fields, extra joins
 * and grouping.
 */
function inCourseLessons<T extends SQLiteSelect>(query: T, courseId: number) {
  return query
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .where(eq(modules.courseId, courseId))
    .orderBy(...LESSON_ORDER);
}

/** A per-UTC-day total: a count, or cents for revenue. */
interface DayTotal {
  day: string;
  total: number;
}

/**
 * Sums `value` per UTC day of `dateColumn` over the rows of `table` matching
 * `where`. Rows with no date are skipped.
 */
function getTotalsPerDay(
  table: SQLiteTable,
  dateColumn: SQLiteColumn,
  value: SQL<number>,
  where: SQL | undefined
): DayTotal[] {
  const day = sql<string>`substr(${dateColumn}, 1, 10)`;
  return db
    .select({ day, total: value })
    .from(table)
    .where(and(isNotNull(dateColumn), where))
    .groupBy(day)
    .all();
}

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

// ─── Quizzes ───

/** Which attempt stands for a student on a quiz. */
export type QuizAttemptMode = "first" | "best";

/** Every quiz figure for one attempt mode. */
export interface QuizModeFigures {
  /** Passed ÷ selected attempts across all quizzes, 0..1; null with no attempts. */
  passRate: number | null;
  /** Every quiz in the course, in course order. */
  quizzes: QuizFigures[];
  /** Up to five answered questions with the lowest share correct, worst first. */
  hardestQuestions: HardQuestion[];
}

export interface HardQuestion {
  questionId: number;
  questionText: string;
  quizTitle: string;
  /** Answers to this question across the selected attempts. */
  answers: number;
  /** Share of those answers whose selected option is correct, 0..1. */
  correctRate: number;
}

const HARDEST_QUESTION_COUNT = 5;

export interface QuizFigures {
  quizId: number;
  title: string;
  lessonTitle: string;
  /** Students with at least one attempt (one selected attempt each). */
  attempts: number;
  /** 0..1; null when nobody has attempted the quiz. */
  passRate: number | null;
  /** Mean score of the selected attempts, 0..1; null with no attempts. */
  averageScore: number | null;
}

export interface QuizAnalytics {
  first: QuizModeFigures;
  best: QuizModeFigures;
}

/**
 * One attempt per student per quiz in the course, excluding the instructor:
 * the earliest for "first", the highest-scoring for "best" (a pass wins a
 * tie on score, then the earlier attempt).
 */
function selectedAttempts(courseId: number, instructorId: number, mode: QuizAttemptMode) {
  const order =
    mode === "first"
      ? sql`${quizAttempts.attemptedAt} asc, ${quizAttempts.id} asc`
      : sql`${quizAttempts.score} desc, ${quizAttempts.passed} desc, ${quizAttempts.attemptedAt} asc, ${quizAttempts.id} asc`;

  return db.$with("selected_attempt").as(
    db
      .select({
        attemptId: sql<number>`${quizAttempts.id}`.as("selected_attempt_id"),
        quizId: sql<number>`${quizAttempts.quizId}`.as("selected_quiz_id"),
        score: sql<number>`${quizAttempts.score}`.as("selected_score"),
        passed: sql<number>`${quizAttempts.passed}`.as("selected_passed"),
        rank: sql<number>`row_number() over (partition by ${quizAttempts.userId}, ${quizAttempts.quizId} order by ${order})`.as(
          "selected_rank"
        ),
      })
      .from(quizAttempts)
      .innerJoin(quizzes, eq(quizAttempts.quizId, quizzes.id))
      .innerJoin(lessons, eq(quizzes.lessonId, lessons.id))
      .innerJoin(modules, eq(lessons.moduleId, modules.id))
      .where(and(eq(modules.courseId, courseId), ne(quizAttempts.userId, instructorId)))
  );
}

function getQuizModeFigures(
  courseId: number,
  instructorId: number,
  mode: QuizAttemptMode
): QuizModeFigures {
  const selected = selectedAttempts(courseId, instructorId, mode);

  const rows = db
    .with(selected)
    .select({
      quizId: quizzes.id,
      title: quizzes.title,
      lessonTitle: lessons.title,
      attempts: sql<number>`count(${selected.attemptId})`,
      passed: sql<number>`coalesce(sum(${selected.passed}), 0)`,
      scoreSum: sql<number>`coalesce(sum(${selected.score}), 0)`,
    })
    .from(quizzes)
    .innerJoin(lessons, eq(quizzes.lessonId, lessons.id))
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .leftJoin(selected, and(eq(selected.quizId, quizzes.id), eq(selected.rank, 1)))
    .where(eq(modules.courseId, courseId))
    .groupBy(quizzes.id)
    .orderBy(...LESSON_ORDER, asc(quizzes.id))
    .all();

  const correctRate = sql<number>`cast(sum(${quizOptions.isCorrect}) as real) / count(*)`;
  const hardestQuestions = db
    .with(selected)
    .select({
      questionId: quizQuestions.id,
      questionText: quizQuestions.questionText,
      quizTitle: quizzes.title,
      answers: sql<number>`count(*)`,
      correctRate,
    })
    .from(selected)
    .innerJoin(quizAnswers, eq(quizAnswers.attemptId, selected.attemptId))
    .innerJoin(quizOptions, eq(quizAnswers.selectedOptionId, quizOptions.id))
    .innerJoin(quizQuestions, eq(quizAnswers.questionId, quizQuestions.id))
    .innerJoin(quizzes, eq(quizQuestions.quizId, quizzes.id))
    .innerJoin(lessons, eq(quizzes.lessonId, lessons.id))
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .where(eq(selected.rank, 1))
    .groupBy(quizQuestions.id)
    .orderBy(
      asc(correctRate),
      ...LESSON_ORDER,
      asc(quizzes.id),
      asc(quizQuestions.position),
      asc(quizQuestions.id)
    )
    .limit(HARDEST_QUESTION_COUNT)
    .all();

  const attempts = rows.reduce((sum, row) => sum + row.attempts, 0);
  const passed = rows.reduce((sum, row) => sum + row.passed, 0);

  return {
    passRate: attempts === 0 ? null : passed / attempts,
    quizzes: rows.map((row) => ({
      quizId: row.quizId,
      title: row.title,
      lessonTitle: row.lessonTitle,
      attempts: row.attempts,
      passRate: row.attempts === 0 ? null : row.passed / row.attempts,
      averageScore: row.attempts === 0 ? null : row.scoreSum / row.attempts,
    })),
    hardestQuestions,
  };
}

function getQuizAnalytics(courseId: number, instructorId: number): QuizAnalytics {
  return {
    first: getQuizModeFigures(courseId, instructorId, "first"),
    best: getQuizModeFigures(courseId, instructorId, "best"),
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

const COUNT_ROWS = sql<number>`count(*)`;

function getEnrollmentsPerDay(courseId: number, instructorId: number): DayTotal[] {
  return getTotalsPerDay(
    enrollments,
    enrollments.enrolledAt,
    COUNT_ROWS,
    and(eq(enrollments.courseId, courseId), ne(enrollments.userId, instructorId))
  );
}

function getCompletionsPerDay(courseId: number, instructorId: number): DayTotal[] {
  return getTotalsPerDay(
    enrollments,
    enrollments.completedAt,
    COUNT_ROWS,
    and(eq(enrollments.courseId, courseId), ne(enrollments.userId, instructorId))
  );
}

function getLessonsCompletedPerDay(courseId: number, instructorId: number): DayTotal[] {
  return getTotalsPerDay(
    lessonProgress,
    lessonProgress.completedAt,
    COUNT_ROWS,
    and(
      inArray(
        lessonProgress.lessonId,
        inCourseLessons(db.select({ id: lessons.id }).from(lessons).$dynamic(), courseId)
      ),
      ne(lessonProgress.userId, instructorId),
      eq(lessonProgress.status, LessonProgressStatus.Completed)
    )
  );
}

/** Amount paid (cents) summed per UTC purchase day. */
function getRevenuePerDay(courseId: number, instructorId: number): DayTotal[] {
  return getTotalsPerDay(
    purchases,
    purchases.createdAt,
    sql<number>`sum(${purchases.amountPaid})`,
    and(eq(purchases.courseId, courseId), ne(purchases.userId, instructorId))
  );
}

/** Merges per-key day totals into one row per active day, sorted by date. */
function mergeDaily(perKey: Record<TrendKey, DayTotal[]>): DailyActivity[] {
  const byDay = new Map<string, DailyActivity>();
  for (const key of TREND_KEYS) {
    for (const { day, total } of perKey[key]) {
      let row = byDay.get(day);
      if (!row) {
        row = { date: day } as DailyActivity;
        for (const k of TREND_KEYS) row[k] = 0;
        byDay.set(day, row);
      }
      row[key] += total;
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
      revenue: getRevenuePerDay(courseId, instructorId),
    }),
  };
}

// ─── Progress ───

export interface LessonCompletion {
  lessonId: number;
  lessonTitle: string;
  moduleTitle: string;
  /** Students who completed this lesson (not "reached at least this lesson"). */
  completed: number;
}

export interface CourseProgress {
  /** Every lesson in course order (module position, then lesson position). */
  lessons: LessonCompletion[];
}

function getProgress(courseId: number, instructorId: number): CourseProgress {
  const rows = inCourseLessons(
    db
      .select({
        lessonId: lessons.id,
        lessonTitle: lessons.title,
        moduleTitle: modules.title,
        completed: sql<number>`count(${lessonProgress.id})`,
      })
      .from(lessons)
      .$dynamic(),
    courseId
  )
    .leftJoin(
      lessonProgress,
      and(
        eq(lessonProgress.lessonId, lessons.id),
        eq(lessonProgress.status, LessonProgressStatus.Completed),
        ne(lessonProgress.userId, instructorId)
      )
    )
    .groupBy(lessons.id)
    .all();

  return { lessons: rows };
}

// ─── Feedback ───

export interface StarCount {
  /** 1..5 */
  stars: number;
  count: number;
}

export interface CourseFeedback {
  /** Mean of all ratings, 1..5; null when nobody has rated. */
  averageRating: number | null;
  ratingCount: number;
  /** One entry per star value, 1 to 5, including zero counts. */
  distribution: StarCount[];
  /** Every lesson in course order with its comment count (soft-deleted excluded). */
  commentsPerLesson: LessonComments[];
}

export interface LessonComments {
  lessonId: number;
  lessonTitle: string;
  moduleTitle: string;
  comments: number;
}

const STAR_VALUES = [1, 2, 3, 4, 5];

function getCommentsPerLesson(courseId: number, instructorId: number): LessonComments[] {
  return inCourseLessons(
    db
      .select({
        lessonId: lessons.id,
        lessonTitle: lessons.title,
        moduleTitle: modules.title,
        comments: sql<number>`count(${comments.id})`,
      })
      .from(lessons)
      .$dynamic(),
    courseId
  )
    .leftJoin(
      comments,
      and(
        eq(comments.lessonId, lessons.id),
        isNull(comments.deletedAt),
        ne(comments.userId, instructorId)
      )
    )
    .groupBy(lessons.id)
    .all();
}

function getFeedback(courseId: number, instructorId: number): CourseFeedback {
  const rows = db
    .select({ stars: courseRatings.rating, count: sql<number>`count(*)` })
    .from(courseRatings)
    .where(and(eq(courseRatings.courseId, courseId), ne(courseRatings.userId, instructorId)))
    .groupBy(courseRatings.rating)
    .all();

  const countByStars = new Map(rows.map((row) => [row.stars, row.count]));
  const distribution = STAR_VALUES.map((stars) => ({
    stars,
    count: countByStars.get(stars) ?? 0,
  }));
  const ratingCount = rows.reduce((sum, row) => sum + row.count, 0);
  const starTotal = rows.reduce((sum, row) => sum + row.stars * row.count, 0);

  return {
    averageRating: ratingCount === 0 ? null : starTotal / ratingCount,
    ratingCount,
    distribution,
    commentsPerLesson: getCommentsPerLesson(courseId, instructorId),
  };
}

// ─── Sales ───

export interface SalesAnalytics {
  /** All-time revenue in cents, excluding the instructor's purchases. */
  revenue: number;
  /** Purchase rows; a team purchase counts once. */
  purchases: number;
  /** Seats paid for: one per solo purchase, one per coupon for a team purchase. */
  seats: number;
  /** revenue ÷ seats in cents; null with no purchases. */
  averagePrice: number | null;
  /** Coupons created by team purchases. */
  teamSeatsSold: number;
  /** Of those, coupons redeemed by someone other than the instructor. */
  teamSeatsRedeemed: number;
  /** Revenue and purchases per buyer country, highest revenue first. */
  byCountry: CountrySales[];
}

export interface CountrySales {
  /** ISO 3166-1 alpha-2 code; null when the purchase recorded no country. */
  country: string | null;
  revenue: number;
  purchases: number;
}

function getSalesByCountry(courseId: number, instructorId: number): CountrySales[] {
  const revenue = sql<number>`sum(${purchases.amountPaid})`;
  return db
    .select({
      country: purchases.country,
      revenue,
      purchases: sql<number>`count(*)`,
    })
    .from(purchases)
    .where(and(eq(purchases.courseId, courseId), ne(purchases.userId, instructorId)))
    .groupBy(purchases.country)
    .orderBy(desc(revenue), asc(purchases.country))
    .all();
}

function getSales(courseId: number, instructorId: number): SalesAnalytics {
  const couponCounts = db.$with("purchase_coupons").as(
    db
      .select({
        purchaseId: sql<number>`${coupons.purchaseId}`.as("coupon_purchase_id"),
        seats: sql<number>`count(*)`.as("coupon_seats"),
        redeemed: sql<number>`sum(case when ${coupons.redeemedByUserId} is not null and ${coupons.redeemedByUserId} <> ${instructorId} then 1 else 0 end)`.as(
          "coupon_redeemed"
        ),
      })
      .from(coupons)
      .groupBy(coupons.purchaseId)
  );

  const row = db
    .with(couponCounts)
    .select({
      revenue: sql<number>`coalesce(sum(${purchases.amountPaid}), 0)`,
      purchases: sql<number>`count(*)`,
      seats: sql<number>`coalesce(sum(coalesce(${couponCounts.seats}, 1)), 0)`,
      teamSeatsSold: sql<number>`coalesce(sum(${couponCounts.seats}), 0)`,
      teamSeatsRedeemed: sql<number>`coalesce(sum(${couponCounts.redeemed}), 0)`,
    })
    .from(purchases)
    .leftJoin(couponCounts, eq(couponCounts.purchaseId, purchases.id))
    .where(and(eq(purchases.courseId, courseId), ne(purchases.userId, instructorId)))
    .get();

  const revenue = row?.revenue ?? 0;
  const seats = row?.seats ?? 0;
  return {
    revenue,
    purchases: row?.purchases ?? 0,
    seats,
    averagePrice: seats === 0 ? null : revenue / seats,
    teamSeatsSold: row?.teamSeatsSold ?? 0,
    teamSeatsRedeemed: row?.teamSeatsRedeemed ?? 0,
    byCountry: getSalesByCountry(courseId, instructorId),
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
    quizzes: getQuizAnalytics(courseId, instructorId),
    trends: getTrends(courseId, instructorId, now),
    progress: getProgress(courseId, instructorId),
    feedback: getFeedback(courseId, instructorId),
    sales: getSales(courseId, instructorId),
  };
}

export type CourseAnalytics = ReturnType<typeof getCourseAnalytics>;
