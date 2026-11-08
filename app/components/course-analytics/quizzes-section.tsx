import type {
  QuizAnalytics,
  QuizAttemptMode,
} from "~/services/courseAnalyticsService";
import { Button } from "~/components/ui/button";
import { QUIZ_MODE_LABELS, SectionCard, SectionEmpty, formatPercent } from "./shared";

// ─── Quizzes section ───
// Per-quiz table and hardest questions. Both attempt modes arrive
// precomputed; the first/best toggle shown here is page component state (it
// also drives the headline quiz pass rate), so it defaults to "first" on
// every load and never triggers a request.

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
      {(Object.keys(QUIZ_MODE_LABELS) as QuizAttemptMode[]).map((value) => (
        <Button
          key={value}
          type="button"
          size="sm"
          variant={mode === value ? "default" : "ghost"}
          aria-pressed={mode === value}
          onClick={() => onChange(value)}
        >
          {QUIZ_MODE_LABELS[value]}
        </Button>
      ))}
    </div>
  );
}

export function QuizzesSection({
  quizzes,
  mode,
  onModeChange,
}: {
  quizzes: QuizAnalytics;
  mode: QuizAttemptMode;
  onModeChange: (mode: QuizAttemptMode) => void;
}) {
  const figures = quizzes[mode];
  const hasQuizzes = figures.quizzes.length > 0;

  return (
    <SectionCard
      title="Quizzes"
      description={`All time · ${QUIZ_MODE_LABELS[mode].toLowerCase()} per student per quiz`}
      action={hasQuizzes ? <AttemptToggle mode={mode} onChange={onModeChange} /> : undefined}
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
