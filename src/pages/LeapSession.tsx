import { useCallback, useEffect, useMemo, useState, type KeyboardEvent, type MouseEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from '~/components/Toast'
import { addWord } from '~/db/sqlite'
import { useLeapStore } from '~/state/leap'

export default function LeapSession() {
  const nav = useNavigate()
  const {
    config,
    current,
    currentSource,
    remaining,
    retry,
    markKnown,
    markWrong,
    exitSession,
    startSession,
    sessionWords
  } = useLeapStore(state => ({
    config: state.config,
    current: state.current,
    currentSource: state.currentSource,
    remaining: state.remaining,
    retry: state.retry,
    markKnown: state.markKnown,
    markWrong: state.markWrong,
    exitSession: state.exitSession,
    startSession: state.startSession,
    sessionWords: state.sessionWords
  }))
  const [busy, setBusy] = useState(false)
  const [flipped, setFlipped] = useState(false)
  const [restartBusy, setRestartBusy] = useState(false)
  const [speechAvailable, setSpeechAvailable] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const [voice, setVoice] = useState<SpeechSynthesisVoice | null>(null)

  useEffect(() => {
    if (!config) {
      nav('/leap')
    }
  }, [config, nav])

  useEffect(() => {
    setFlipped(false)
  }, [current])
  useEffect(() => {
    const available =
      typeof window !== 'undefined' &&
      'speechSynthesis' in window &&
      typeof SpeechSynthesisUtterance !== 'undefined'
    setSpeechAvailable(available)
  }, [])

  useEffect(() => {
    if (!speechAvailable || typeof window === 'undefined' || !window.speechSynthesis) return
    const synth = window.speechSynthesis

    const selectVoice = () => {
      const voices = synth.getVoices()
      if (!voices.length) return

      const scoreVoice = (entry: SpeechSynthesisVoice) => {
        const lang = entry.lang?.toLowerCase() ?? ''
        const name = entry.name?.toLowerCase() ?? ''
        let score = 0
        if (lang.startsWith('en')) score += 10
        if (lang === 'en-us') score += 8
        if (entry.default) score += 2
        if (name.includes('google')) score += 6
        if (name.includes('microsoft')) score += 5
        if (name.includes('natural') || name.includes('neural')) score += 4
        if (name.includes('premium')) score += 3
        if (name.includes('female')) score += 1
        return score
      }

      const best = voices
        .map(entry => ({ entry, score: scoreVoice(entry) }))
        .sort((a, b) => b.score - a.score)[0]?.entry

      setVoice(best ?? voices[0] ?? null)
    }

    selectVoice()

    if (typeof synth.addEventListener === 'function') {
      synth.addEventListener('voiceschanged', selectVoice)
      return () => {
        synth.removeEventListener('voiceschanged', selectVoice)
      }
    }

    const previousHandler = synth.onvoiceschanged
    const handler = function (this: SpeechSynthesis, event: Event) {
      if (typeof previousHandler === 'function') {
        previousHandler.call(this, event)
      }
      selectVoice()
    }

    synth.onvoiceschanged = handler

    return () => {
      if (synth.onvoiceschanged === handler) {
        synth.onvoiceschanged = previousHandler ?? null
      }
    }
  }, [speechAvailable])

  useEffect(() => {
    if (!speechAvailable || typeof window === 'undefined' || !window.speechSynthesis) return
    window.speechSynthesis.cancel()
    setSpeaking(false)
    return () => {
      window.speechSynthesis.cancel()
    }
  }, [current, speechAvailable])

  const speakPhrase = useCallback(() => {
    if (!speechAvailable || !current?.phrase || typeof window === 'undefined' || !window.speechSynthesis) return
    const utterance = new SpeechSynthesisUtterance(current.phrase)
    if (voice) utterance.voice = voice
    utterance.lang = voice?.lang ?? 'en-US'
    utterance.onend = () => setSpeaking(false)
    utterance.onerror = () => setSpeaking(false)
    window.speechSynthesis.cancel()
    setSpeaking(true)
    window.speechSynthesis.speak(utterance)
  }, [current, speechAvailable, voice])

  const handleSpeechClick = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation()
      event.preventDefault()
      if (!current?.phrase || !speechAvailable || typeof window === 'undefined' || !window.speechSynthesis) return
      if (speaking) {
        window.speechSynthesis.cancel()
        setSpeaking(false)
        return
      }
      speakPhrase()
    },
    [current, speakPhrase, speaking, speechAvailable]
  )

  const cardContent = useMemo(() => {
    if (!current) return null
    return (
      <div
        className='card tap review-card'
        role='button'
        tabIndex={0}
        onClick={() => setFlipped(state => !state)}
        onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            setFlipped(state => !state)
          }
        }}
      >
        {!flipped ? (
          <div className='review-face main'>
            <span className='muted' style={{ fontSize:14, letterSpacing:'0.08em', display:'block', marginBottom:12 }}>#{current.heading}</span>
            <div>{current.phrase}</div>
          </div>
        ) : (
          <div className='review-face back'>
            <div className='review-meaning'>{current.meaning || '-'}</div>
            {current.example && <div className='review-extra'>{current.example}</div>}
            {current.source && (
              <div className='review-extra'>
                Source:{' '}
                {isHttpUrl(current.source) ? (
                  <a
                    href={current.source}
                    target='_blank'
                    rel='noopener noreferrer'
                    onClick={event => event.stopPropagation()}
                  >
                    {current.source}
                  </a>
                ) : (
                  current.source
                )}
              </div>
            )}
          </div>
        )}
      </div>
    )
  }, [current, flipped])

  async function handleKnown() {
    if (busy || !current) return
    markKnown()
  }

  async function handleWrong() {
    if (busy || !current) return
    setBusy(true)
    try {
      const wrongWord = await markWrong()
      if (wrongWord && config?.addWrongToWordlist) {
        try {
          await addWord({
            phrase: wrongWord.phrase,
            meaning: wrongWord.meaning,
            example: wrongWord.example,
            source: wrongWord.source ?? `[Leap]見出し番号 ${wrongWord.heading}`
          })
          toast(`「${wrongWord.phrase}」をWord Libraryへ追加しました。`)
        } catch (error) {
          const message = error instanceof Error ? error.message : ''
          if (message === 'DUPLICATE_PHRASE') {
            toast('既にWord Libraryに登録済みです。')
          } else if (message === 'VALIDATION_EMPTY_PHRASE') {
            toast('単語の保存に失敗しました。')
          } else {
            console.error('Failed to add Leap word', error)
            toast('Word Libraryへの保存に失敗しました。')
          }
        }
      }
    } finally {
      setBusy(false)
    }
  }

  async function handleRestart() {
    if (restartBusy) return
    if (!config) {
      nav('/leap')
      return
    }
    setRestartBusy(true)
    try {
      const override = sessionWords.length ? sessionWords : undefined
      const result = await startSession(config, override)
      if (!result.success) {
        if (result.error) toast(result.error)
        exitSession()
        nav('/leap')
      }
    } finally {
      setRestartBusy(false)
    }
  }

  const sessionFinished = !current && remaining.length === 0 && retry.length === 0
  const remainingCount = remaining.length + (current && currentSource === 'remaining' ? 1 : 0)
  const retryCount = retry.length + (current && currentSource === 'retry' ? 1 : 0)
  const totalSelected = sessionWords.length
  const totalSelectedLabel = totalSelected.toLocaleString('ja-JP')

  return (
    <div className='home-screen leap-session-screen'>
      <header className='home-header leap-header'>
        <div className='home-header__brand'>Leap出題中</div>
        <div className='home-header__actions'>
          <button
            className='icon-button'
            onClick={() => {
              exitSession()
              nav('/leap')
            }}
            aria-label='End Leap session'
          >
            <CloseIcon />
          </button>
        </div>
      </header>

      <main className='leap-session-main'>
        {sessionFinished ? (
          <div className='card center leap-finished-card'>
            <div className='leap-finished-title'>お疲れさまでした！</div>
            <p className='muted'>{totalSelectedLabel}単語の学習が終了しました。</p>
            <div className='leap-finished-actions'>
              <button
                type='button'
                className='btn btn-primary'
                onClick={handleRestart}
                disabled={restartBusy || sessionWords.length === 0}
              >
                もう一度繰り返す
              </button>
              <button
                type='button'
                className='btn'
                onClick={() => {
                  exitSession()
                  nav('/leap')
                }}
                disabled={restartBusy}
              >
                出題設定に戻る
              </button>
              <button
                type='button'
                className='btn'
                onClick={() => {
                  exitSession()
                  nav('/')
                }}
                disabled={restartBusy}
              >
                ホームに戻る
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:16, width:'100%' }}>
            {cardContent}
            {speechAvailable && current?.phrase && (
              <button
                type='button'
                className='icon-button'
                aria-label={speaking ? 'Stop pronunciation' : 'Play pronunciation'}
                title={speaking ? 'Stop pronunciation' : 'Play pronunciation'}
                aria-pressed={speaking}
                onClick={handleSpeechClick}
              >
                <SpeakerIcon active={speaking} />
              </button>
            )}
          </div>
        )}
      </main>

      {!sessionFinished && (
        <footer className='leap-session-footer'>
          <div className='leap-session-stats'>
            <span>Remaining: {remainingCount}</span>
            <span>Retry later: {retryCount}</span>
          </div>
          <div className='leap-session-actions'>
            <button
              className='btn btn-accent'
              onClick={handleKnown}
              disabled={busy || !current}
            >
              覚えた
            </button>
            <button
              className='btn btn-danger'
              onClick={handleWrong}
              disabled={busy || !current}
            >
              間違えた
            </button>
          </div>
        </footer>
      )}
    </div>
  )
}

function CloseIcon() {
  return (
    <svg width='22' height='22' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.8' strokeLinecap='round' strokeLinejoin='round' aria-hidden='true'>
      <line x1='18' y1='6' x2='6' y2='18' />
      <line x1='6' y1='6' x2='18' y2='18' />
    </svg>
  )
}

function SpeakerIcon({ active }: { active: boolean }) {
  return (
    <svg
      width='24'
      height='24'
      viewBox='0 0 24 24'
      fill='none'
      stroke='currentColor'
      strokeWidth='1.8'
      strokeLinecap='round'
      strokeLinejoin='round'
      aria-hidden='true'
    >
      <polygon points='3 9 7 9 11 5 11 19 7 15 3 15' fill='currentColor' />
      <path d='M15 9a4 4 0 0 1 0 6' opacity={active ? 1 : 0.4} />
      <path d='M17.5 5.5a7 7 0 0 1 0 12.99' opacity={active ? 1 : 0.3} />
    </svg>
  )
}

function isHttpUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}
