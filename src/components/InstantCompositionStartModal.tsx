import { X, Mic, Keyboard, Star } from 'lucide-react'
import { useState } from 'react'

interface InstantCompositionStartModalProps {
  isOpen: boolean
  onClose: () => void
  lesson: any
  onStart: (mode: 'ai' | 'typing') => void
}

export default function InstantCompositionStartModal({
  isOpen,
  onClose,
  lesson,
  onStart
}: InstantCompositionStartModalProps) {
  const [isVoiceEnabled, setIsVoiceEnabled] = useState(true)
  const [difficulty, setDifficulty] = useState<'normal' | 'easy' | 'hard' | 'extreme'>('normal')

  if (!isOpen) return null

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-surface" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">レッスン設定</h2>
          <button className="modal-close" onClick={onClose}>
            <X size={24} />
          </button>
        </div>

        <div className="modal-body">
          <div className="lesson-info">
            <h3 className="lesson-title">{lesson.title}</h3>
            <div className="lesson-stats">
              <div className="stat-item">
                <span className="stat-label">目標タイム</span>
                <span className="stat-value">1分00秒</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">ベスト</span>
                <span className="stat-value">{lesson.time || '--'}</span>
              </div>
            </div>
          </div>

          <div className="setting-section">
            <h4 className="setting-title">難易度</h4>
            <div className="difficulty-selector">
              {(['normal', 'easy', 'hard', 'extreme'] as const).map((d) => (
                <button
                  key={d}
                  className={`difficulty-btn ${difficulty === d ? 'active' : ''}`}
                  onClick={() => setDifficulty(d)}
                >
                  {d === 'normal' && '普通'}
                  {d === 'easy' && '簡単'}
                  {d === 'hard' && '難しい'}
                  {d === 'extreme' && '激ムズ'}
                </button>
              ))}
            </div>
            <p className="difficulty-desc">
              {difficulty === 'normal' && '標準的なモードです。日本語を見て英語を答えます。'}
              {difficulty === 'easy' && 'ヒントが表示される初心者向けモードです。'}
              {difficulty === 'hard' && '制限時間が短く設定されています。'}
              {difficulty === 'extreme' && '一度間違えると即終了のスパルタモードです。'}
            </p>
          </div>

          <div className="setting-section">
            <div className="toggle-row">
              <div className="toggle-label">
                <h4 className="setting-title" style={{ margin: 0 }}>声を出して学習</h4>
                <p className="setting-desc">マイクを使って発音判定を行います</p>
              </div>
              <button
                className={`toggle-switch ${isVoiceEnabled ? 'active' : ''}`}
                onClick={() => setIsVoiceEnabled(!isVoiceEnabled)}
              >
                <div className="toggle-knob" />
              </button>
            </div>
          </div>

          <div className="mode-indicator">
            {isVoiceEnabled ? (
              <>
                <Mic size={20} className="mode-icon" />
                <span>AI判定モードで開始</span>
              </>
            ) : (
              <>
                <Keyboard size={20} className="mode-icon" />
                <span>タイピングモードで開始</span>
              </>
            )}
          </div>

          <button
            className="btn btn-primary start-button"
            onClick={() => onStart(isVoiceEnabled ? 'ai' : 'typing')}
          >
            開始
          </button>
        </div>
      </div>

      <style>{`
        .lesson-info {
          text-align: center;
          margin-bottom: 24px;
        }
        .lesson-title {
          font-size: 20px;
          font-weight: bold;
          color: var(--fg);
          margin: 0 0 12px;
        }
        .lesson-stats {
          display: flex;
          justify-content: center;
          gap: 24px;
        }
        .stat-item {
          display: flex;
          flex-direction: column;
          align-items: center;
        }
        .stat-label {
          font-size: 12px;
          color: var(--muted);
        }
        .stat-value {
          font-size: 18px;
          font-weight: bold;
          color: var(--primary);
        }
        .setting-section {
          margin-bottom: 24px;
        }
        .setting-title {
          font-size: 14px;
          font-weight: bold;
          color: var(--fg);
          margin: 0 0 12px;
        }
        .setting-desc {
          font-size: 12px;
          color: var(--muted);
          margin: 4px 0 0;
        }
        .difficulty-selector {
          display: flex;
          gap: 8px;
          margin-bottom: 8px;
        }
        .difficulty-btn {
          flex: 1;
          padding: 8px;
          border-radius: 8px;
          border: 1px solid rgba(51, 65, 85, 0.5);
          background: rgba(15, 23, 42, 0.5);
          color: var(--muted);
          font-size: 13px;
          cursor: pointer;
          transition: all 0.2s;
        }
        .difficulty-btn.active {
          background: var(--primary);
          color: #0f172a;
          border-color: var(--primary);
          font-weight: bold;
        }
        .difficulty-desc {
          font-size: 12px;
          color: var(--muted);
          margin: 0;
          line-height: 1.4;
        }
        .toggle-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .toggle-switch {
          width: 52px;
          height: 32px;
          border-radius: 16px;
          background: rgba(51, 65, 85, 0.5);
          border: none;
          position: relative;
          cursor: pointer;
          transition: background 0.2s;
        }
        .toggle-switch.active {
          background: var(--primary);
        }
        .toggle-knob {
          width: 24px;
          height: 24px;
          border-radius: 50%;
          background: white;
          position: absolute;
          top: 4px;
          left: 4px;
          transition: transform 0.2s;
        }
        .toggle-switch.active .toggle-knob {
          transform: translateX(20px);
        }
        .mode-indicator {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          color: var(--primary);
          font-weight: bold;
          margin-bottom: 16px;
          font-size: 14px;
        }
        .start-button {
          width: 100%;
          padding: 16px;
          font-size: 18px;
          font-weight: bold;
          border-radius: 12px;
        }
      `}</style>
    </div>
  )
}
