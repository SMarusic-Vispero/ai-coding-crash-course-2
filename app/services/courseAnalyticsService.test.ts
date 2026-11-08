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
