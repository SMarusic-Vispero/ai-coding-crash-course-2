import { useState } from "react";
import type {
  QuizAnalytics,
  QuizAttemptMode,
} from "~/services/courseAnalyticsService";
import { Button } from "~/components/ui/button";
import { SectionCard, SectionEmpty, StatTile, formatPercent } from "./shared";

// ─── Quizzes section ───
// Quiz pass rate, per-quiz table and hardest questions. Both attempt modes
// arrive precomputed; the first/best toggle lives in component state only,
// so it defaults to "first" on every load and never triggers a request.

const MODE_LABELS: Record<QuizAttemptMode, string> = {
  first: "First attempt",
  best: "Best attempt",
};

const thClass =
  "px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground";

function AttemptToggle({
  mode,
  onChange,
}: {
  mode: QuizAttemptMode;
  onChange: (mode: QuizAttemptMode) => void;
}) {
  return (
    <div role="group" aria-label="Quiz attempts" className="flex gap-1 rounded-md border p-1">
      {(Object.keys(MODE_LABELS) as QuizAttemptMode[]).map((value) => (
        <Button
          key={value}
          type="button"
          size="sm"
          variant={mode === value ? "default" : "ghost"}
          aria-pressed={mode === value}
          onClick={() => onChange(value)}
        >
          {MODE_LABELS[value]}
        </Button>
      ))}
    </div>
  );
}

export function QuizzesSection({ quizzes }: { quizzes: QuizAnalytics }) {
  const [mode, setMode] = useState<QuizAttemptMode>("first");
  const figures = quizzes[mode];
  const hasQuizzes = figures.quizzes.length > 0;

  return (
    <SectionCard
      title="Quizzes"
      description={`All time · ${MODE_LABELS[mode].toLowerCase()} per student per quiz`}
      action={hasQuizzes ? <AttemptToggle mode={mode} onChange={setMode} /> : undefined}
    >
      {!hasQuizzes ? (
        <SectionEmpty
          title="No quizzes in this course"
          body="Add a quiz to a lesson to see how students do on it."
        />
      ) : figures.passRate === null ? (
        <SectionEmpty
          title="No quiz attempts yet"
          body="Quiz figures appear here once a student takes a quiz."
        />
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <StatTile
              label="Quiz pass rate (all time)"
              value={formatPercent(figures.passRate)}
              hint={MODE_LABELS[mode]}
            />
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-y border-border bg-muted/50">
                  <th className={thClass}>Quiz</th>
                  <th className={`${thClass} text-right`}>Students</th>
                  <th className={`${thClass} text-right`}>Pass rate</th>
                  <th className={`${thClass} text-right`}>Average score</th>
                </tr>
              </thead>
              <tbody>
                {figures.quizzes.map((quiz) => (
                  <tr key={quiz.quizId} className="border-b border-border last:border-0">
                    <td className="px-4 py-3">
                      <div className="font-medium">{quiz.title}</div>
                      <div className="text-xs text-muted-foreground">{quiz.lessonTitle}</div>
                    </td>
                    <td className="px-4 py-3 text-right text-sm tabular-nums">
                      {quiz.attempts.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right text-sm tabular-nums">
                      {quiz.passRate === null ? "—" : formatPercent(quiz.passRate)}
                    </td>
                    <td className="px-4 py-3 text-right text-sm tabular-nums">
                      {quiz.averageScore === null ? "—" : formatPercent(quiz.averageScore)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div>
            <h3 className="mb-2 font-medium">Hardest questions</h3>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-y border-border bg-muted/50">
                    <th className={thClass}>Question</th>
                    <th className={`${thClass} text-right`}>Answers</th>
                    <th className={`${thClass} text-right`}>Correct</th>
                  </tr>
                </thead>
                <tbody>
                  {figures.hardestQuestions.map((question) => (
                    <tr key={question.questionId} className="border-b border-border last:border-0">
                      <td className="px-4 py-3">
                        <div className="font-medium">{question.questionText}</div>
                        <div className="text-xs text-muted-foreground">{question.quizTitle}</div>
                      </td>
                      <td className="px-4 py-3 text-right text-sm tabular-nums">
                        {question.answers.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right text-sm tabular-nums">
                        {formatPercent(question.correctRate)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </SectionCard>
  );
}
