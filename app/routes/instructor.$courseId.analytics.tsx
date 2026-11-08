import { Link, data, isRouteErrorResponse } from "react-router";
import type { Route } from "./+types/instructor.$courseId.analytics";
import { getCourseById } from "~/services/courseService";
import { getUserById } from "~/services/userService";
import { getCourseAnalytics } from "~/services/courseAnalyticsService";
import { getCurrentUserId } from "~/lib/session";
import { CourseStatus, UserRole } from "~/db/schema";
import { Button } from "~/components/ui/button";
import { AlertTriangle, ArrowLeft } from "lucide-react";
import { StudentsSection } from "~/components/course-analytics/students-section";
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
  const currentUserId = await getCurrentUserId(request);

  if (!currentUserId) {
    throw data("Select a user from the DevUI panel to view course analytics.", {
      status: 401,
    });
  }

  const user = getUserById(currentUserId);

  if (!user || user.role !== UserRole.Instructor) {
    throw data("Only instructors can access course analytics.", {
      status: 403,
    });
  }

  const courseId = parseInt(params.courseId, 10);
  if (isNaN(courseId)) {
    throw data("Invalid course ID.", { status: 400 });
  }

  const course = getCourseById(courseId);

  if (!course) {
    throw data("Course not found.", { status: 404 });
  }

  if (course.instructorId !== currentUserId) {
    throw data("You can only view analytics for your own courses.", {
      status: 403,
    });
  }

  if (course.status === CourseStatus.Draft) {
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
    analytics: getCourseAnalytics(course.id, currentUserId),
  };
}

export default function CourseAnalyticsPage({ loaderData }: Route.ComponentProps) {
  const { course, analytics } = loaderData;

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

      {/* One component per section; later sections slot in below. */}
      <StudentsSection students={analytics.students} feedback={analytics.feedback} />
      <TrendsSection trends={analytics.trends} />
      <QuizzesSection quizzes={analytics.quizzes} />
      <ProgressSection progress={analytics.progress} />
      <FeedbackSection feedback={analytics.feedback} />
      <SalesSection sales={analytics.sales} isFree={course.price === 0} />
    </div>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let title = "Something went wrong";
  let message = "An unexpected error occurred while loading course analytics.";

  if (isRouteErrorResponse(error)) {
    if (error.status === 404) {
      title = "Not found";
      message =
        typeof error.data === "string"
          ? error.data
          : "The course you're looking for doesn't exist or may have been removed.";
    } else if (error.status === 401) {
      title = "Sign in required";
      message = typeof error.data === "string" ? error.data : "Please select a user from the DevUI panel.";
    } else if (error.status === 403) {
      title = "Access denied";
      message = typeof error.data === "string" ? error.data : "You don't have permission to view these analytics.";
    } else {
      title = `Error ${error.status}`;
      message = typeof error.data === "string" ? error.data : error.statusText;
    }
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
