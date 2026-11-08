import { describe, it, expect, beforeEach, vi } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";

let testDb: ReturnType<typeof createTestDb>;
let base: ReturnType<typeof seedBaseData>;

vi.mock("~/db", () => ({
  get db() {
    return testDb;
  },
}));

// Import after mock so the module picks up our test db
import { getCourseAnalytics } from "./courseAnalyticsService";

// ─── Local fixtures ───

let counter = 0;

function createStudent() {
  counter++;
  return testDb
    .insert(schema.users)
    .values({
      name: `Student ${counter}`,
      email: `student${counter}@example.com`,
      role: schema.UserRole.Student,
    })
    .returning()
    .get();
}

function enroll(userId: number, courseId: number, completedAt: string | null = null) {
  return testDb
    .insert(schema.enrollments)
    .values({
      userId,
      courseId,
      enrolledAt: "2026-06-01T10:00:00.000Z",
      completedAt,
    })
    .returning()
    .get();
}

beforeEach(() => {
  testDb = createTestDb();
  base = seedBaseData(testDb);
});

// ─── Students ───

describe("getCourseAnalytics — students", () => {
  it("computes completion rate from enrollments with a completion date", () => {
    enroll(base.user.id, base.course.id, "2026-06-10T10:00:00.000Z");
    enroll(createStudent().id, base.course.id, "2026-06-11T10:00:00.000Z");
    enroll(createStudent().id, base.course.id);
    enroll(createStudent().id, base.course.id);

    const analytics = getCourseAnalytics(base.course.id, base.instructor.id);

    expect(analytics.students).toEqual({
      total: 4,
      completed: 2,
      completionRate: 0.5,
    });
  });

  it("excludes the instructor's own enrollment", () => {
    enroll(base.instructor.id, base.course.id, "2026-06-10T10:00:00.000Z");
    enroll(base.user.id, base.course.id);

    const analytics = getCourseAnalytics(base.course.id, base.instructor.id);

    expect(analytics.students).toEqual({
      total: 1,
      completed: 0,
      completionRate: 0,
    });
  });

  it("ignores enrollments in other courses", () => {
    const other = testDb
      .insert(schema.courses)
      .values({
        title: "Other Course",
        slug: "other-course",
        description: "Another course",
        salesCopy: "Sales copy",
        instructorId: base.instructor.id,
        categoryId: base.category.id,
        status: schema.CourseStatus.Published,
      })
      .returning()
      .get();
    enroll(base.user.id, other.id, "2026-06-10T10:00:00.000Z");
    enroll(createStudent().id, base.course.id);

    const analytics = getCourseAnalytics(base.course.id, base.instructor.id);

    expect(analytics.students.total).toBe(1);
    expect(analytics.students.completed).toBe(0);
  });

  it("returns a null completion rate for a course with no enrollments", () => {
    const analytics = getCourseAnalytics(base.course.id, base.instructor.id);

    expect(analytics.students).toEqual({
      total: 0,
      completed: 0,
      completionRate: null,
    });
  });
});

// ─── Quizzes ───

let quizLessonCounter = 0;

/**
 * Creates a lesson with a quiz in the given course. Each question gets one
 * correct and one wrong option.
 */
function createQuiz(courseId: number, title: string, questionTexts: string[]) {
  quizLessonCounter++;
  const mod = testDb
    .insert(schema.modules)
    .values({ courseId, title: `Module ${quizLessonCounter}`, position: quizLessonCounter })
    .returning()
    .get();
  const lesson = testDb
    .insert(schema.lessons)
    .values({ moduleId: mod.id, title: `Lesson ${quizLessonCounter}`, position: 1 })
    .returning()
    .get();
  const quiz = testDb
    .insert(schema.quizzes)
    .values({ lessonId: lesson.id, title, passingScore: 0.7 })
    .returning()
    .get();
  const questions = questionTexts.map((questionText, i) => {
    const question = testDb
      .insert(schema.quizQuestions)
      .values({
        quizId: quiz.id,
        questionText,
        questionType: schema.QuestionType.MultipleChoice,
        position: i + 1,
      })
      .returning()
      .get();
    const correct = testDb
      .insert(schema.quizOptions)
      .values({ questionId: question.id, optionText: "Right", isCorrect: true })
      .returning()
      .get();
    const wrong = testDb
      .insert(schema.quizOptions)
      .values({ questionId: question.id, optionText: "Wrong", isCorrect: false })
      .returning()
      .get();
    return { id: question.id, correctOptionId: correct.id, wrongOptionId: wrong.id };
  });
  return { quiz, lesson, questions };
}

/**
 * Records an attempt. `answers[i]` says whether question i was answered
 * correctly; score is the fraction correct and passed follows the quiz's 0.7
 * passing score.
 */
function attemptQuiz(
  userId: number,
  quiz: ReturnType<typeof createQuiz>,
  attemptedAt: string,
  answers: boolean[]
) {
  const score = answers.filter(Boolean).length / answers.length;
  const attempt = testDb
    .insert(schema.quizAttempts)
    .values({ userId, quizId: quiz.quiz.id, score, passed: score >= 0.7, attemptedAt })
    .returning()
    .get();
  answers.forEach((isCorrect, i) => {
    const question = quiz.questions[i];
    testDb
      .insert(schema.quizAnswers)
      .values({
        attemptId: attempt.id,
        questionId: question.id,
        selectedOptionId: isCorrect ? question.correctOptionId : question.wrongOptionId,
      })
      .run();
  });
  return attempt;
}

describe("getCourseAnalytics — quizzes", () => {
  it("uses the earliest attempt for first and the highest-scoring for best", () => {
    const quiz = createQuiz(base.course.id, "Basics", ["Q1", "Q2"]);
    // Fails first, then passes.
    attemptQuiz(base.user.id, quiz, "2026-06-01T10:00:00.000Z", [false, true]);
    attemptQuiz(base.user.id, quiz, "2026-06-02T10:00:00.000Z", [true, true]);

    const { quizzes } = getCourseAnalytics(base.course.id, base.instructor.id);

    expect(quizzes.first.passRate).toBe(0);
    expect(quizzes.best.passRate).toBe(1);
  });

  it("reports pass rate and average score per quiz in course order", () => {
    const basics = createQuiz(base.course.id, "Basics", ["Q1", "Q2"]);
    const advanced = createQuiz(base.course.id, "Advanced", ["Q1", "Q2"]);
    const other = createStudent();
    // Student 1 fails then passes Basics.
    attemptQuiz(base.user.id, basics, "2026-06-01T10:00:00.000Z", [false, false]);
    attemptQuiz(base.user.id, basics, "2026-06-02T10:00:00.000Z", [true, true]);
    // Student 2 scores half on Basics, retries and does no better.
    attemptQuiz(other.id, basics, "2026-06-01T11:00:00.000Z", [true, false]);
    attemptQuiz(other.id, basics, "2026-06-03T11:00:00.000Z", [false, false]);

    const { quizzes } = getCourseAnalytics(base.course.id, base.instructor.id);

    expect(quizzes.first.quizzes).toEqual([
      {
        quizId: basics.quiz.id,
        title: "Basics",
        lessonTitle: basics.lesson.title,
        attempts: 2,
        passRate: 0,
        averageScore: 0.25,
      },
      {
        quizId: advanced.quiz.id,
        title: "Advanced",
        lessonTitle: advanced.lesson.title,
        attempts: 0,
        passRate: null,
        averageScore: null,
      },
    ]);
    expect(quizzes.best.quizzes[0]).toMatchObject({
      attempts: 2,
      passRate: 0.5,
      averageScore: 0.75,
    });
    expect(quizzes.first.passRate).toBe(0);
    expect(quizzes.best.passRate).toBe(0.5);
  });

  it("ranks the five hardest questions by percentage correct, worst first", () => {
    const quiz = createQuiz(base.course.id, "Basics", ["A", "B", "C", "D", "E", "F"]);
    const s2 = createStudent();
    // First attempts: A 0/2, B 1/2, C 2/2, D 1/2, E 0/2, F 2/2.
    attemptQuiz(base.user.id, quiz, "2026-06-01T10:00:00.000Z", [false, true, true, false, false, true]);
    attemptQuiz(s2.id, quiz, "2026-06-01T11:00:00.000Z", [false, false, true, true, false, true]);
    // Student 1 retries and gets everything but E right (best attempt).
    attemptQuiz(base.user.id, quiz, "2026-06-02T10:00:00.000Z", [true, true, true, true, false, true]);

    const { quizzes } = getCourseAnalytics(base.course.id, base.instructor.id);

    const summarise = (rows: typeof quizzes.first.hardestQuestions) =>
      rows.map((q) => [q.questionText, q.answers, q.correctRate]);

    // Ties broken by course order (question position).
    expect(summarise(quizzes.first.hardestQuestions)).toEqual([
      ["A", 2, 0],
      ["E", 2, 0],
      ["B", 2, 0.5],
      ["D", 2, 0.5],
      ["C", 2, 1],
    ]);
    expect(summarise(quizzes.best.hardestQuestions)).toEqual([
      ["E", 2, 0],
      ["A", 2, 0.5],
      ["B", 2, 0.5],
      ["C", 2, 1],
      ["D", 2, 1],
    ]);
    expect(quizzes.first.hardestQuestions[0]).toMatchObject({
      questionId: quiz.questions[0].id,
      quizTitle: "Basics",
    });
  });

  it("excludes the instructor's own attempts and other courses' quizzes", () => {
    const quiz = createQuiz(base.course.id, "Basics", ["Q1", "Q2"]);
    const other = testDb
      .insert(schema.courses)
      .values({
        title: "Other Course",
        slug: "other-course-quizzes",
        description: "Another course",
        salesCopy: "Sales copy",
        instructorId: base.instructor.id,
        categoryId: base.category.id,
        status: schema.CourseStatus.Published,
      })
      .returning()
      .get();
    const otherQuiz = createQuiz(other.id, "Elsewhere", ["Q1"]);
    attemptQuiz(base.instructor.id, quiz, "2026-06-01T09:00:00.000Z", [true, true]);
    attemptQuiz(base.user.id, quiz, "2026-06-01T10:00:00.000Z", [false, false]);
    attemptQuiz(base.user.id, otherQuiz, "2026-06-01T10:00:00.000Z", [true]);

    const { quizzes } = getCourseAnalytics(base.course.id, base.instructor.id);

    for (const mode of [quizzes.first, quizzes.best]) {
      expect(mode.passRate).toBe(0);
      expect(mode.quizzes).toHaveLength(1);
      expect(mode.quizzes[0]).toMatchObject({ attempts: 1, averageScore: 0 });
      expect(mode.hardestQuestions.map((q) => [q.answers, q.correctRate])).toEqual([
        [1, 0],
        [1, 0],
      ]);
    }
  });

  it("returns empty figures for a course without quizzes", () => {
    const { quizzes } = getCourseAnalytics(base.course.id, base.instructor.id);

    const empty = { passRate: null, quizzes: [], hardestQuestions: [] };
    expect(quizzes).toEqual({ first: empty, best: empty });
  });

  it("lists quizzes but no hardest questions when nobody has attempted", () => {
    createQuiz(base.course.id, "Basics", ["Q1"]);

    const { quizzes } = getCourseAnalytics(base.course.id, base.instructor.id);

    expect(quizzes.first.passRate).toBeNull();
    expect(quizzes.first.quizzes).toHaveLength(1);
    expect(quizzes.first.hardestQuestions).toEqual([]);
  });
});

// ─── Trends ───

describe("getCourseAnalytics — trends", () => {
  const NOW = new Date("2026-06-15T12:00:00.000Z");

  function addLesson() {
    const mod = testDb
      .insert(schema.modules)
      .values({ courseId: base.course.id, title: "Module", position: 1 })
      .returning()
      .get();
    return testDb
      .insert(schema.lessons)
      .values({ moduleId: mod.id, title: "Lesson", position: 1 })
      .returning()
      .get();
  }

  function enrollAt(userId: number, enrolledAt: string, completedAt: string | null = null) {
    testDb
      .insert(schema.enrollments)
      .values({ userId, courseId: base.course.id, enrolledAt, completedAt })
      .run();
  }

  function trackLesson(
    userId: number,
    lessonId: number,
    completedAt: string | null,
    status = schema.LessonProgressStatus.Completed
  ) {
    testDb
      .insert(schema.lessonProgress)
      .values({ userId, lessonId, status, completedAt })
      .run();
  }

  it("buckets enrollments, completions and lesson completions by UTC date", () => {
    const lesson = addLesson();
    const a = createStudent();
    const b = createStudent();
    enrollAt(a.id, "2026-06-10T00:00:00.000Z", "2026-06-12T23:59:59.999Z");
    enrollAt(b.id, "2026-06-10T23:59:59.999Z");
    enrollAt(base.user.id, "2026-06-11T00:00:00.000Z", "2026-06-12T01:00:00.000Z");
    trackLesson(a.id, lesson.id, "2026-06-11T08:00:00.000Z");
    trackLesson(b.id, lesson.id, "2026-06-12T08:00:00.000Z");
    trackLesson(base.user.id, lesson.id, null, schema.LessonProgressStatus.InProgress);

    const { trends } = getCourseAnalytics(base.course.id, base.instructor.id, NOW);

    expect(trends.today).toBe("2026-06-15");
    expect(trends.start).toBe(base.course.createdAt.slice(0, 10));
    expect(trends.daily).toEqual([
      { date: "2026-06-10", enrollments: 2, completions: 0, lessonsCompleted: 0, revenue: 0 },
      { date: "2026-06-11", enrollments: 1, completions: 0, lessonsCompleted: 1, revenue: 0 },
      { date: "2026-06-12", enrollments: 0, completions: 2, lessonsCompleted: 1, revenue: 0 },
    ]);
  });

  it("excludes the instructor's own enrollments and lesson completions", () => {
    const lesson = addLesson();
    enrollAt(base.instructor.id, "2026-06-10T10:00:00.000Z", "2026-06-11T10:00:00.000Z");
    trackLesson(base.instructor.id, lesson.id, "2026-06-11T10:00:00.000Z");
    enrollAt(base.user.id, "2026-06-13T10:00:00.000Z");

    const { trends } = getCourseAnalytics(base.course.id, base.instructor.id, NOW);

    expect(trends.daily).toEqual([
      { date: "2026-06-13", enrollments: 1, completions: 0, lessonsCompleted: 0, revenue: 0 },
    ]);
  });

  it("returns an empty daily series for a course with no activity", () => {
    const { trends } = getCourseAnalytics(base.course.id, base.instructor.id, NOW);

    expect(trends.daily).toEqual([]);
  });
});

// ─── Sales ───

describe("getCourseAnalytics — sales", () => {
  let couponCounter = 0;

  function buy(
    userId: number,
    amountPaid: number,
    country: string | null = "US",
    createdAt = "2026-06-10T10:00:00.000Z"
  ) {
    return testDb
      .insert(schema.purchases)
      .values({ userId, courseId: base.course.id, amountPaid, country, createdAt })
      .returning()
      .get();
  }

  /** A team purchase: one purchase row plus one coupon per seat. */
  function buyTeam(
    userId: number,
    amountPaid: number,
    seats: number,
    redeemedBy: number[] = [],
    country: string | null = "US"
  ) {
    const purchase = buy(userId, amountPaid, country);
    const team = testDb.insert(schema.teams).values({}).returning().get();
    for (let i = 0; i < seats; i++) {
      couponCounter++;
      const redeemer = redeemedBy[i] ?? null;
      testDb
        .insert(schema.coupons)
        .values({
          teamId: team.id,
          courseId: base.course.id,
          code: `CODE-${couponCounter}`,
          purchaseId: purchase.id,
          redeemedByUserId: redeemer,
          redeemedAt: redeemer === null ? null : "2026-06-11T10:00:00.000Z",
        })
        .run();
    }
    return purchase;
  }

  it("totals revenue, purchases and average price per seat across solo and team purchases", () => {
    buy(base.user.id, 5000);
    buy(createStudent().id, 3000);
    buyTeam(createStudent().id, 16000, 4);

    const { sales } = getCourseAnalytics(base.course.id, base.instructor.id);

    expect(sales.revenue).toBe(24000);
    expect(sales.purchases).toBe(3);
    expect(sales.seats).toBe(6);
    expect(sales.averagePrice).toBe(4000);
  });

  it("counts team seats sold (coupons) and redeemed (coupons with a redeeming user)", () => {
    const a = createStudent();
    const b = createStudent();
    buy(base.user.id, 5000);
    buyTeam(createStudent().id, 12000, 3, [a.id]);
    buyTeam(createStudent().id, 8000, 2, [b.id]);

    const { sales } = getCourseAnalytics(base.course.id, base.instructor.id);

    expect(sales.teamSeatsSold).toBe(5);
    expect(sales.teamSeatsRedeemed).toBe(2);
  });

  it("breaks revenue and purchase count down by buyer country, highest revenue first", () => {
    buy(base.user.id, 2000, "IN");
    buy(createStudent().id, 2500, "IN");
    buy(createStudent().id, 5000, "US");
    buyTeam(createStudent().id, 9000, 3, [], "DE");
    buy(createStudent().id, 1000, null);

    const { sales } = getCourseAnalytics(base.course.id, base.instructor.id);

    expect(sales.byCountry).toEqual([
      { country: "DE", revenue: 9000, purchases: 1 },
      { country: "US", revenue: 5000, purchases: 1 },
      { country: "IN", revenue: 4500, purchases: 2 },
      { country: null, revenue: 1000, purchases: 1 },
    ]);
  });

  it("excludes the instructor's own purchases and their team seats", () => {
    buy(base.instructor.id, 9900, "GB");
    buyTeam(base.instructor.id, 20000, 5, [base.user.id]);
    buy(base.user.id, 5000, "US");

    const { sales } = getCourseAnalytics(base.course.id, base.instructor.id);

    expect(sales).toEqual({
      revenue: 5000,
      purchases: 1,
      seats: 1,
      averagePrice: 5000,
      teamSeatsSold: 0,
      teamSeatsRedeemed: 0,
      byCountry: [{ country: "US", revenue: 5000, purchases: 1 }],
    });
  });

  it("returns zeroes and no average for a course with no purchases", () => {
    const { sales } = getCourseAnalytics(base.course.id, base.instructor.id);

    expect(sales).toEqual({
      revenue: 0,
      purchases: 0,
      seats: 0,
      averagePrice: null,
      teamSeatsSold: 0,
      teamSeatsRedeemed: 0,
      byCountry: [],
    });
  });

  it("adds revenue summed per UTC day to the trend series, excluding the instructor", () => {
    buy(base.user.id, 5000, "US", "2026-06-10T00:00:00.000Z");
    buy(createStudent().id, 3000, "US", "2026-06-10T23:59:59.999Z");
    buyTeam(createStudent().id, 12000, 3);
    buy(createStudent().id, 2000, "US", "2026-06-12T08:00:00.000Z");
    buy(base.instructor.id, 9900, "US", "2026-06-11T08:00:00.000Z");

    const { trends } = getCourseAnalytics(
      base.course.id,
      base.instructor.id,
      new Date("2026-06-15T12:00:00.000Z")
    );

    expect(trends.daily).toEqual([
      { date: "2026-06-10", enrollments: 0, completions: 0, lessonsCompleted: 0, revenue: 20000 },
      { date: "2026-06-12", enrollments: 0, completions: 0, lessonsCompleted: 0, revenue: 2000 },
    ]);
  });
});
