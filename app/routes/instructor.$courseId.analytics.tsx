import { useState } from "react";
import { Link, data, isRouteErrorResponse } from "react-router";
import type { Route } from "./+types/instructor.$courseId.analytics";
import { getCourseById } from "~/services/courseService";
import {
  getCourseAnalytics,
  type QuizAttemptMode,
} from "~/services/courseAnalyticsService";
import { requireInstructorOrAdmin } from "~/lib/access.server";
import { hasCourseAnalytics } from "~/lib/courseAnalyticsAccess";
import { Button } from "~/components/ui/button";
import { AlertTriangle, ArrowLeft } from "lucide-react";
import { HeadlineSection } from "~/components/course-analytics/headline-section";
import { TrendsSection } from "~/components/course-analytics/trends-section";
import { QuizzesSection } from "~/components/course-analytics/quizzes-section";
import { ProgressSection } from "~/components/course-analytics/progress-section";
import { FeedbackSection } from "~/components/course-analytics/feedback-section";
import { SalesSection } from "~/components/course-analytics/sales-section";

export function meta({ loaderData }: Route.MetaArgs) {
  const title = loaderData?.course?.title ?? "Course Analytics";
  return [
    { title: `Analytics: ${title} — Cadence` },
    { name: "description", content: `Analytics for ${title}` },
  ];
}

export async function loader({ params, request }: Route.LoaderArgs) {
  // 401 when signed out, 403 for non-instructors. Admins pass this guard but
  // are then refused by the ownership check: the page is owner-only.
  const { userId } = await requireInstructorOrAdmin(request);

  const courseId = parseInt(params.courseId, 10);
  if (isNaN(courseId)) {
    throw data("Invalid course ID.", { status: 400 });
  }

  const course = getCourseById(courseId);

  if (!course) {
    throw data("Course not found.", { status: 404 });
  }

  if (course.instructorId !== userId) {
    throw data("You can only view analytics for your own courses.", {
      status: 403,
    });
  }

  if (!hasCourseAnalytics(course.status)) {
    throw data("Analytics are available once the course is published", {
      status: 404,
    });
  }

  return {
    course: {
      id: course.id,
      title: course.title,
      status: course.status,
      price: course.price,
    },
    analytics: getCourseAnalytics(course.id, userId),
  };
}

export default function CourseAnalyticsPage({ loaderData }: Route.ComponentProps) {
  const { course, analytics } = loaderData;
  const isFree = course.price === 0;
  // Page state only (no URL): every quiz figure follows this one toggle.
  const [quizMode, setQuizMode] = useState<QuizAttemptMode>("first");

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6 lg:p-8">
      <div>
        <Link
          to={`/instructor/${course.id}`}
          className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Back to course
        </Link>
        <h1 className="text-3xl font-bold">Analytics</h1>
        <p className="mt-1 text-muted-foreground">{course.title}</p>
      </div>

      <HeadlineSection
        students={analytics.students}
        feedback={analytics.feedback}
        quizMode={quizMode}
        quizzes={analytics.quizzes[quizMode]}
        sales={analytics.sales}
        isFree={isFree}
      />
      <TrendsSection trends={analytics.trends} />
      <QuizzesSection
        quizzes={analytics.quizzes}
        mode={quizMode}
        onModeChange={setQuizMode}
      />
      <ProgressSection progress={analytics.progress} />
      <FeedbackSection feedback={analytics.feedback} />
      <SalesSection sales={analytics.sales} isFree={isFree} />
    </div>
  );
}

const ERROR_TITLES: Record<number, string> = {
  401: "Sign in required",
  403: "Access denied",
  404: "Not found",
};

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let title = "Something went wrong";
  let message = "An unexpected error occurred while loading course analytics.";

  if (isRouteErrorResponse(error)) {
    title = ERROR_TITLES[error.status] ?? `Error ${error.status}`;
    message = typeof error.data === "string" ? error.data : error.statusText || message;
  }

  return (
    <div className="flex min-h-[50vh] items-center justify-center p-6">
      <div className="text-center">
        <AlertTriangle className="mx-auto mb-4 size-12 text-muted-foreground" />
        <h1 className="mb-2 text-2xl font-bold">{title}</h1>
        <p className="mb-6 text-muted-foreground">{message}</p>
        <div className="flex items-center justify-center gap-3">
          <Link to="/instructor">
            <Button variant="outline">My Courses</Button>
          </Link>
          <Link to="/">
            <Button>Go Home</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
