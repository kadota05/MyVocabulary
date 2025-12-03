import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, Mic, Play, Check, ChevronRight, Save, AlertCircle, RotateCcw, Home } from 'lucide-react'
import { useStore } from '../state/store'
import { checkAnswer } from '../lib/gemini'
import { addWord } from '../db/sqlite'

interface InstantCompositionSessionProps {
  lesson: any
  mode: 'ai' | 'typing'
  onClose: () => void
}

interface QuestionResult {
  question: any
  userAnswer: string
  isCorrect: boolean
  explanation: string
}

export default function InstantCompositionSession({
  lesson,
  mode,
  onClose
}: InstantCompositionSessionProps) {
  const { geminiApiKey } = useStore()

  // Initialize active questions with all questions from the lesson
  const [activeQuestions, setActiveQuestions] = useState<any[]>(lesson.questions || [])
  const [currentIndex, setCurrentIndex] = useState(0)

  const [input, setInput] = useState('')
  const [isRecording, setIsRecording] = useState(false)
  const [status, setStatus] = useState<'answering' | 'judging' | 'checking' | 'results'>('answering')
  const [results, setResults] = useState<QuestionResult[]>([])
  const [currentResult, setCurrentResult] = useState<QuestionResult | null>(null)

  // Speech Recognition Setup
  const recognitionRef = useRef<any>(null)

  useEffect(() => {
    if (typeof window !== 'undefined' && (window as any).webkitSpeechRecognition) {
      const SpeechRecognition = (window as any).webkitSpeechRecognition
      const recognition = new SpeechRecognition()
      recognition.continuous = true
      recognition.interimResults = true
      recognition.lang = 'en-US'

      recognition.onresult = (event: any) => {
        let finalTranscript = ''
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript
          }
        }
        if (finalTranscript) {
          setInput(prev => prev + (prev ? ' ' : '') + finalTranscript)
        }
      }

      recognition.onerror = (event: any) => {
        console.error('Speech recognition error', event.error)
        setIsRecording(false)
      }

      recognitionRef.current = recognition
    }
  }, [])

  useEffect(() => {
    if (isRecording) {
      recognitionRef.current?.start()
    } else {
      recognitionRef.current?.stop()
    }
  }, [isRecording])

  const currentQuestion = activeQuestions[currentIndex] || {
    japanese: 'No question',
    english: 'No question'
  }

  const handleCheck = async () => {
    if (!input.trim()) return

    setStatus('judging')

    // Stop recording if active
    if (isRecording) setIsRecording(false)

    let isCorrect = false
    let explanation = ''

    if (geminiApiKey) {
      try {
        const result = await checkAnswer(geminiApiKey, currentQuestion.japanese, currentQuestion.english, input)
        isCorrect = result.isCorrect
        explanation = result.explanation
      } catch (e) {
        console.error(e)
        explanation = 'AI判定に失敗しました。'
      }
    } else {
      // Fallback simple check if no API key
      isCorrect = input.toLowerCase().trim() === currentQuestion.english.toLowerCase().trim()
      explanation = isCorrect ? 'Perfect match!' : 'API Key not set. Simple string match used.'
    }

    const result = {
      question: currentQuestion,
      userAnswer: input,
      isCorrect,
      explanation
    }

    setCurrentResult(result)
    setResults([...results, result])
    setStatus('checking')
  }

  const navigate = useNavigate()

  const handleNext = () => {
    if (currentIndex < activeQuestions.length - 1) {
      setCurrentIndex(currentIndex + 1)
      setStatus('answering')
      setInput('')
      setCurrentResult(null)
    } else {
      navigate('/instant-composition/results', {
        state: {
          results: results,
          lesson
        }
      })
    }
  }

  const handleRetryIncorrect = () => {
    const incorrectQuestions = results
      .filter(r => !r.isCorrect)
      .map(r => r.question)

    if (incorrectQuestions.length > 0) {
      setActiveQuestions(incorrectQuestions)
      setCurrentIndex(0)
      setResults([])
      setCurrentResult(null)
      setInput('')
      setStatus('answering')
    }
  }

  const handleSaveToWordlist = async (question: any) => {
    try {
      await addWord({
        phrase: question.english,
        meaning: question.japanese,
        source: 'Instant Composition'
      })
      // You might want to show a toast here
      alert(`Saved "${question.english}" to wordlist!`)
    } catch (e: any) {
      if (e.message === 'DUPLICATE_PHRASE') {
        alert('This word is already in your wordlist.')
      } else {
        console.error(e)
        alert('Failed to save word.')
      }
    }
  }



  return (
    <div className="session-screen">
      <header className="session-header">
        <button className="close-button" onClick={onClose}>
          <ChevronLeft size={24} />
          <span style={{ fontSize: 14 }}>Back</span>
        </button>
        <div className="progress-indicator">
          {currentIndex + 1} / {activeQuestions.length}
        </div>
        <div style={{ width: 60 }}></div>
      </header>

      <div className="session-body">
        <div className="question-card">
          <div className="japanese-text">{currentQuestion.japanese}</div>
        </div>

        <div className="answer-area">
          {status === 'checking' || status === 'judging' ? (
            <div className="result-display">
              {status === 'judging' ? (
                <div className="judging-indicator">
                  <div className="spinner"></div>
                  <span>AI Judging...</span>
                </div>
              ) : (
                <>
                  <div className="judgment-banner">
                    {currentResult?.isCorrect ? (
                      <div className="judgment-correct">
                        <Check size={32} />
                        <span>Correct</span>
                      </div>
                    ) : (
                      <div className="judgment-incorrect">
                        <AlertCircle size={32} />
                        <span>Incorrect</span>
                      </div>
                    )}
                  </div>

                  <div className="english-text">{currentQuestion.english}</div>

                  <div className="explanation-box">
                    <p className="explanation-text">{currentResult?.explanation}</p>
                  </div>

                  <div className="user-input-display">
                    <span className="label">Your Answer:</span>
                    <span className="value">{input}</span>
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="input-container">
              {mode === 'typing' ? (
                <textarea
                  className="typing-input"
                  placeholder="英文を入力してください"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  autoFocus
                />
              ) : (
                <div className="voice-controls">
                  <button
                    className={`mic-button ${isRecording ? 'recording' : ''}`}
                    onClick={() => setIsRecording(!isRecording)}
                  >
                    <Mic size={32} color="white" />
                    <span className="mic-label">{isRecording ? 'Stop' : 'Record'}</span>
                  </button>
                  {isRecording && <div className="recording-wave">Listening...</div>}
                  {input && <div className="voice-transcript">{input}</div>}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <footer className="session-footer">
        {status === 'answering' ? (
          <button className="btn btn-primary action-button" onClick={handleCheck} disabled={!input}>
            <Check size={20} />
            Check Answer
          </button>
        ) : status === 'checking' ? (
          <button className="btn btn-primary action-button" onClick={handleNext}>
            Next
            <ChevronRight size={20} />
          </button>
        ) : null}
      </footer>

      <style>{`
        .session-screen {
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
          padding: 16px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          background: rgba(15, 23, 42, 0.9);
        }
        .header-title {
          font-weight: bold;
          font-size: 16px;
        }
        .progress-indicator {
          font-size: 14px;
          font-weight: bold;
          color: var(--muted);
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
        .session-body {
          flex: 1;
          display: flex;
          flex-direction: column;
          padding: 24px;
          gap: 32px;
          overflow-y: auto;
        }
        .question-card {
          text-align: center;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 16px;
          margin-top: 40px;
        }
        .japanese-text {
          font-size: 24px;
          font-weight: bold;
          line-height: 1.4;
        }
        .answer-area {
          flex: 1;
          display: flex;
          flex-direction: column;
          justify-content: center;
        }
        .typing-input {
          width: 100%;
          height: 120px;
          background: rgba(30, 41, 59, 0.5);
          border: 1px solid rgba(51, 65, 85, 0.5);
          border-radius: 12px;
          padding: 16px;
          color: var(--fg);
          font-size: 18px;
          resize: none;
          box-sizing: border-box;
        }
        .typing-input:focus {
          outline: none;
          border-color: var(--primary);
        }
        .voice-controls {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 16px;
        }
        .mic-button {
          width: 80px;
          height: 80px;
          border-radius: 50%;
          background: var(--primary);
          border: none;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          box-shadow: 0 4px 12px rgba(56, 189, 248, 0.3);
          transition: all 0.2s;
        }
        .mic-button.recording {
          background: var(--danger);
          animation: pulse 1.5s infinite;
        }
        .mic-label {
          font-size: 10px;
          color: white;
          margin-top: 4px;
          font-weight: bold;
        }
        .recording-wave {
          color: var(--danger);
          font-weight: bold;
          animation: fade 1s infinite;
        }
        .voice-transcript {
          background: rgba(30, 41, 59, 0.5);
          padding: 12px;
          border-radius: 8px;
          color: var(--fg);
          font-size: 16px;
          max-width: 100%;
          text-align: center;
        }
        .result-display {
          text-align: center;
          animation: slideUp 0.3s ease;
          display: flex;
          flex-direction: column;
          gap: 16px;
          align-items: center;
        }
        .judging-indicator {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
          color: var(--primary);
        }
        .spinner {
          width: 32px;
          height: 32px;
          border: 3px solid rgba(56, 189, 248, 0.3);
          border-top-color: var(--primary);
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }
        .judgment-banner {
          margin-bottom: 8px;
        }
        .judgment-correct {
          color: #4ade80;
          display: flex;
          flex-direction: column;
          align-items: center;
          font-weight: bold;
          font-size: 18px;
        }
        .judgment-incorrect {
          color: #f87171;
          display: flex;
          flex-direction: column;
          align-items: center;
          font-weight: bold;
          font-size: 18px;
        }
        .english-text {
          font-size: 20px;
          color: var(--primary);
          font-weight: bold;
        }
        .explanation-box {
          background: rgba(30, 41, 59, 0.5);
          padding: 12px;
          border-radius: 8px;
          width: 100%;
        }
        .explanation-text {
          font-size: 14px;
          color: var(--muted);
          line-height: 1.5;
          margin: 0;
        }
        .user-input-display {
          font-size: 14px;
          color: var(--muted);
          background: rgba(30, 41, 59, 0.3);
          padding: 12px;
          border-radius: 8px;
          display: inline-block;
          width: 100%;
          text-align: left;
        }
        .user-input-display .label {
          display: block;
          font-size: 11px;
          margin-bottom: 4px;
        }
        .user-input-display .value {
          color: var(--fg);
          font-size: 16px;
        }
        .session-footer {
          padding: 24px;
          background: rgba(15, 23, 42, 0.9);
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
        @keyframes pulse {
          0% { transform: scale(1); }
          50% { transform: scale(1.1); }
          100% { transform: scale(1); }
        }
        @keyframes fade {
          0% { opacity: 0.5; }
          50% { opacity: 1; }
          100% { opacity: 0.5; }
        }
        @keyframes slideUp {
          from { transform: translateY(20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
