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
      { date: "2026-06-10", enrollments: 2, completions: 0, lessonsCompleted: 0 },
      { date: "2026-06-11", enrollments: 1, completions: 0, lessonsCompleted: 1 },
      { date: "2026-06-12", enrollments: 0, completions: 2, lessonsCompleted: 1 },
    ]);
  });

  it("excludes the instructor's own enrollments and lesson completions", () => {
    const lesson = addLesson();
    enrollAt(base.instructor.id, "2026-06-10T10:00:00.000Z", "2026-06-11T10:00:00.000Z");
    trackLesson(base.instructor.id, lesson.id, "2026-06-11T10:00:00.000Z");
    enrollAt(base.user.id, "2026-06-13T10:00:00.000Z");

    const { trends } = getCourseAnalytics(base.course.id, base.instructor.id, NOW);

    expect(trends.daily).toEqual([
      { date: "2026-06-13", enrollments: 1, completions: 0, lessonsCompleted: 0 },
    ]);
  });

  it("returns an empty daily series for a course with no activity", () => {
    const { trends } = getCourseAnalytics(base.course.id, base.instructor.id, NOW);

    expect(trends.daily).toEqual([]);
  });
});
