import { describe, it, expect } from "vitest";
import { CourseStatus } from "~/db/schema";
import { hasCourseAnalytics } from "./courseAnalyticsAccess";

describe("hasCourseAnalytics", () => {
  it("is false for a draft course", () => {
    expect(hasCourseAnalytics(CourseStatus.Draft)).toBe(false);
  });

  it("is true for published and archived courses", () => {
    expect(hasCourseAnalytics(CourseStatus.Published)).toBe(true);
    expect(hasCourseAnalytics(CourseStatus.Archived)).toBe(true);
  });
});
