import { useLocation, useNavigate } from 'react-router-dom'
import { ChevronLeft, RotateCcw, Home, Save, Check, AlertCircle } from 'lucide-react'
import { addWord } from '../db/sqlite'
import { toast } from '../components/Toast'

export default function InstantCompositionResults() {
  const location = useLocation()
  const navigate = useNavigate()
  const { results, lesson } = location.state || {}

  if (!results || !lesson) {
    return <div>No results found.</div>
  }

  const correctCount = results.filter((r: any) => r.isCorrect).length
  const totalCount = results.length
  const score = Math.round((correctCount / totalCount) * 100)
  const hasIncorrect = correctCount < totalCount

  const handleRetryIncorrect = () => {
    // Navigate back to the course page, but we might need a way to trigger the session immediately with incorrect questions.
    // For now, let's just go back to the course page and let the user restart.
    // Ideally, we should pass state to the course page to auto-open the modal or session.
    // But the user request was just "Review Incorrect", implying a flow.
    // Let's navigate back to the course page with a state that indicates we want to retry.
    navigate(`/instant-composition/${lesson.courseId || '1'}`, {
      state: {
        retryLessonId: lesson.id,
        incorrectQuestions: results.filter((r: any) => !r.isCorrect).map((r: any) => r.question)
      }
    })
  }

  const handleSaveToWordlist = async (question: any) => {
    try {
      await addWord({
        phrase: question.english,
        meaning: question.japanese,
        source: 'Instant Composition'
      })
      toast(`Saved "${question.english}"`)
    } catch (e: any) {
      if (e.message === 'DUPLICATE_PHRASE') {
        toast('Already in wordlist')
      } else {
        console.error(e)
        toast('Failed to save')
      }
    }
  }

  return (
    <div className="page-screen">
      <header className="session-header">
        <button className="close-button" onClick={() => navigate(`/instant-composition/${lesson.courseId || '1'}`)}>
          <ChevronLeft size={24} />
          <span style={{ fontSize: 14 }}>Back</span>
        </button>
      </header>
      <div className="session-body results-body">
        <div className="score-card">
          <div className="score-label">Score</div>
          <div className="score-value">{score}%</div>
          <div className="score-detail">{correctCount} / {totalCount} Correct</div>
        </div>

        <div className="results-actions">
          {hasIncorrect && (
            <button className="btn btn-secondary action-button" onClick={handleRetryIncorrect}>
              <RotateCcw size={20} />
              Review Incorrect ({totalCount - correctCount})
            </button>
          )}
          <button className="btn btn-primary action-button" onClick={() => navigate(`/instant-composition/${lesson.courseId || '1'}`)}>
            <Home size={20} />
            Return to Course
          </button>
        </div>

        <div className="results-list">
          {results.map((result: any, idx: number) => (
            <div key={idx} className="result-item">
              <div className="result-header">
                <span className="result-number">Q{idx + 1}</span>
                {result.isCorrect ? (
                  <span className="badge-correct">Correct</span>
                ) : (
                  <span className="badge-incorrect">Incorrect</span>
                )}
              </div>
              <div className="result-content">
                <div className="result-row">
                  <span className="label">Japanese:</span>
                  <span className="text">{result.question.japanese}</span>
                </div>
                <div className="result-row">
                  <span className="label">Correct:</span>
                  <span className="text highlight">{result.question.english}</span>
                </div>
                <div className="result-row">
                  <span className="label">Your Answer:</span>
                  <span className={`text ${result.isCorrect ? 'good' : 'bad'}`}>{result.userAnswer}</span>
                </div>
                {!result.isCorrect && (
                  <button
                    className="save-button"
                    onClick={() => handleSaveToWordlist(result.question)}
                  >
                    <Save size={16} />
                    Save to Wordlist
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
      <style>{`
        .page-screen {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: var(--bg, #0f172a);
          z-index: 3000;
          display: flex;
          flex-direction: column;
          color: var(--fg);
        }
        .session-header {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          height: 72px; /* var(--header-height) */
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: calc(12px + env(safe-area-inset-top, 0px)) clamp(24px, 7vw, 128px) 12px;
          background: rgba(15, 23, 42, 0.9);
          backdrop-filter: blur(18px);
          border-bottom: 1px solid #1f2937;
          z-index: 40;
        }
        .header-title {
          font-weight: bold;
          font-size: 16px;
        }
        .close-button {
          background: none;
          border: none;
          color: var(--muted);
          cursor: pointer;
          padding: 4px;
          display: flex;
          align-items: center;
          gap: 4px;
        }
        .results-body {
          padding: 16px;
          padding-top: calc(72px + 4px); /* Header height + minimal spacing */
          flex: 1;
          overflow-y: auto;
        }
        .score-card {
          background: rgba(30, 41, 59, 0.5);
          border-radius: 16px;
          padding: 24px;
          text-align: center;
          margin-bottom: 24px;
          border: 1px solid rgba(51, 65, 85, 0.5);
        }
        .score-label {
          font-size: 14px;
          color: var(--muted);
          text-transform: uppercase;
          letter-spacing: 1px;
        }
        .score-value {
          font-size: 48px;
          font-weight: 800;
          color: var(--primary);
          line-height: 1.2;
        }
        .score-detail {
          font-size: 14px;
          color: var(--fg);
        }
        .results-actions {
          display: flex;
          flex-direction: column;
          gap: 12px;
          margin-bottom: 24px;
        }
        .action-button {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 16px;
          font-size: 16px;
        }
        .results-list {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .result-item {
          background: rgba(15, 23, 42, 0.5);
          border-radius: 12px;
          padding: 16px;
          border: 1px solid rgba(51, 65, 85, 0.5);
        }
        .result-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
        }
        .result-number {
          font-size: 14px;
          font-weight: bold;
          color: var(--muted);
        }
        .badge-correct {
          background: rgba(34, 197, 94, 0.2);
          color: #4ade80;
          font-size: 12px;
          padding: 2px 8px;
          border-radius: 4px;
          font-weight: bold;
        }
        .badge-incorrect {
          background: rgba(239, 68, 68, 0.2);
          color: #f87171;
          font-size: 12px;
          padding: 2px 8px;
          border-radius: 4px;
          font-weight: bold;
        }
        .result-content {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .result-row {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .label {
          font-size: 11px;
          color: var(--muted);
        }
        .text {
          font-size: 14px;
          color: var(--fg);
        }
        .text.highlight {
          color: var(--primary);
        }
        .text.good {
          color: #4ade80;
        }
        .text.bad {
          color: #f87171;
        }
        .save-button {
          margin-top: 8px;
          display: flex;
          align-items: center;
          gap: 6px;
          background: rgba(51, 65, 85, 0.5);
          border: none;
          color: var(--fg);
          padding: 8px 12px;
          border-radius: 6px;
          font-size: 12px;
          cursor: pointer;
          width: fit-content;
        }
        .btn-secondary {
          background: rgba(51, 65, 85, 0.5);
          color: var(--fg);
          border: 1px solid rgba(148, 163, 184, 0.2);
        }
      `}</style>
    </div>
  )
}
