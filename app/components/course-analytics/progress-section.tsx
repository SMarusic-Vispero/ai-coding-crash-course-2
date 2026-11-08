import type { CourseProgress } from "~/services/courseAnalyticsService";
import { LessonBarChart } from "./lesson-bar-chart";
import { SectionCard, SectionEmpty } from "./shared";

// ─── Progress section ───
// Lesson drop-off: completions per lesson in course order. Counting
// completions (not furthest lesson reached) makes skipped lessons visible.

export function ProgressSection({ progress }: { progress: CourseProgress }) {
  const hasProgress = progress.lessons.some((lesson) => lesson.completed > 0);

  return (
    <SectionCard
      title="Lesson drop-off"
      description="Students who completed each lesson, in course order"
    >
      {hasProgress ? (
        <LessonBarChart
          label="Completed"
          color="var(--chart-1)"
          bars={progress.lessons.map((lesson) => ({
            lessonId: lesson.lessonId,
            lessonTitle: lesson.lessonTitle,
            moduleTitle: lesson.moduleTitle,
            value: lesson.completed,
          }))}
        />
      ) : (
        <SectionEmpty
          title="No progress yet"
          body="Lesson completions appear here once students start completing lessons."
        />
      )}
    </SectionCard>
  );
}
