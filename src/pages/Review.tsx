import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type MouseEvent
} from 'react'
import { useNavigate } from 'react-router-dom'
import type { Grade } from '~/db/sqlite'
import { useStore } from '~/state/store'

const VOICE_STORAGE_KEY = 'review:speechVoiceURI'

export default function Review() {
  const nav = useNavigate()
  const {
    current,
    currentSide,
    remaining,
    again,
    loading,
    startToday,
    grade
  } = useStore(state => ({
    current: state.current,
    currentSide: state.currentSide,
    remaining: state.remaining,
    again: state.again,
    loading: state.loading,
    startToday: state.startToday,
    grade: state.grade
  }))

  const [initialized, setInitialized] = useState(false)
  const [busy, setBusy] = useState(false)
  const [restartBusy, setRestartBusy] = useState(false)
  const [flipped, setFlipped] = useState(false)
  const [speechAvailable, setSpeechAvailable] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([])
  const [preferredVoiceURI, setPreferredVoiceURI] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null
    try {
      return window.localStorage.getItem(VOICE_STORAGE_KEY)
    } catch {
      return null
    }
  })
  const [voice, setVoice] = useState<SpeechSynthesisVoice | null>(null)

  useEffect(() => {
    let cancelled = false
    setInitialized(false)
    startToday()
      .finally(() => {
        if (!cancelled) setInitialized(true)
      })
    return () => {
      cancelled = true
    }
  }, [startToday])

  useEffect(() => {
    setFlipped(false)
  }, [current?.id])

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

    const updateVoices = () => {
      const voices = synth.getVoices()
      if (!voices.length) return
      setAvailableVoices(voices)
    }

    updateVoices()

    if (typeof synth.addEventListener === 'function') {
      synth.addEventListener('voiceschanged', updateVoices)
      return () => {
        synth.removeEventListener('voiceschanged', updateVoices)
      }
    }

    const previousHandler = synth.onvoiceschanged
    const handler = function (this: SpeechSynthesis, event: Event) {
      if (typeof previousHandler === 'function') {
        previousHandler.call(this, event)
      }
      updateVoices()
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

  useEffect(() => {
    if (!availableVoices.length) return
    const preferred = preferredVoiceURI
      ? availableVoices.find(entry => entry.voiceURI === preferredVoiceURI) ?? null
      : null

    const best =
      availableVoices
        .map(entry => ({ entry, score: scoreVoice(entry) }))
        .sort((a, b) => b.score - a.score)[0]?.entry ?? null

    const nextVoice = preferred ?? best ?? availableVoices[0] ?? null

    setVoice(currentVoice => (currentVoice?.voiceURI === nextVoice?.voiceURI ? currentVoice : nextVoice))

    if (!preferredVoiceURI && nextVoice?.voiceURI) {
      setPreferredVoiceURI(nextVoice.voiceURI)
    } else if (preferredVoiceURI && !preferred && preferredVoiceURI !== nextVoice?.voiceURI) {
      setPreferredVoiceURI(nextVoice?.voiceURI ?? null)
    }
  }, [availableVoices, preferredVoiceURI])

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      if (preferredVoiceURI) {
        window.localStorage.setItem(VOICE_STORAGE_KEY, preferredVoiceURI)
      } else {
        window.localStorage.removeItem(VOICE_STORAGE_KEY)
      }
    } catch {
      // ignore storage failures
    }
  }, [preferredVoiceURI])

  const speakPhrase = useCallback(() => {
    if (!speechAvailable || !current?.phrase || typeof window === 'undefined' || !window.speechSynthesis) return
    const utterance = new SpeechSynthesisUtterance(current.phrase)
    if (voice) utterance.voice = voice
    utterance.lang = voice?.lang ?? 'en-US'
    utterance.rate = 1
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

  const handleVoiceChange = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) => {
      const selectedURI = event.target.value
      if (!selectedURI || !availableVoices.length) return
      const next = availableVoices.find(entry => entry.voiceURI === selectedURI)
      if (!next) return
      if (preferredVoiceURI !== next.voiceURI) {
        setPreferredVoiceURI(next.voiceURI)
      }
      setVoice(currentVoice => (currentVoice?.voiceURI === next.voiceURI ? currentVoice : next))
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel()
        setSpeaking(false)
      }
    },
    [availableVoices, preferredVoiceURI]
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
            <div>{current.phrase}</div>
          </div>
        ) : (
          <div className='review-face back' style={{ gap:16 }}>
            <div className='review-extra muted' style={{ fontSize:14, letterSpacing:'0.08em', textTransform:'uppercase' }}>
              Since: {current.nextDueDate}
            </div>
            <div className='review-extra' style={{ display:'flex', flexDirection:'column', gap:4 }}>
              <span className='muted' style={{ fontSize:12, letterSpacing:'0.12em', textTransform:'uppercase' }}>Source</span>
              {current.source
                ? isHttpUrl(current.source)
                  ? (
                    <a
                      href={current.source}
                      target='_blank'
                      rel='noopener noreferrer'
                      onClick={event => event.stopPropagation()}
                    >
                      {current.source}
                    </a>
                    )
                  : current.source
                : <span>-</span>}
            </div>
            <div className='review-meaning' style={{ display:'flex', flexDirection:'column', gap:8 }}>
              <span className='muted' style={{ fontSize:12, letterSpacing:'0.12em', textTransform:'uppercase' }}>Meaning</span>
              <div>{current.meaning || '-'}</div>
            </div>
            <div className='review-extra' style={{ display:'flex', flexDirection:'column', gap:4 }}>
              <span className='muted' style={{ fontSize:12, letterSpacing:'0.12em', textTransform:'uppercase' }}>Tips</span>
              {current.example ? current.example : <span>-</span>}
            </div>
          </div>
        )}
      </div>
    )
  }, [current, flipped])

  const voiceOptions = useMemo(() => {
    if (!availableVoices.length) return []
    return availableVoices
      .map(entry => ({ entry, score: scoreVoice(entry) }))
      .sort((a, b) => b.score - a.score)
      .map(({ entry }) => ({
        voiceURI: entry.voiceURI,
        label: formatVoiceLabel(entry)
      }))
  }, [availableVoices])
  const selectedVoiceURI = voice?.voiceURI ?? (voiceOptions[0]?.voiceURI ?? '')

  const sessionFinished = initialized && !loading && !current && remaining.length === 0 && again.length === 0
  const showLoading = !initialized || loading
  const remainingCount = remaining.length + (current && currentSide === 'left' ? 1 : 0)
  const retryCount = again.length + (current && currentSide === 'right' ? 1 : 0)

  const requestGrade = useCallback(
    async (value: Grade) => {
      if (!current || busy) return
      setFlipped(false)
      setBusy(true)
      try {
        await grade(value)
      } finally {
        setBusy(false)
      }
    },
    [busy, current, grade]
  )

  const handleRestart = useCallback(async () => {
    if (restartBusy) return
    setRestartBusy(true)
    setInitialized(false)
    try {
      await startToday()
    } finally {
      setInitialized(true)
      setRestartBusy(false)
    }
  }, [restartBusy, startToday])

  return (
    <div className='home-screen leap-session-screen review-session-screen'>
      <header className='home-header leap-header'>
        <div className='home-header__brand'>Review Session</div>
        <div className='home-header__actions'>
          <button
            className='icon-button'
            onClick={() => nav('/')}
            aria-label='End review session'
          >
            <CloseIcon />
          </button>
        </div>
      </header>

      <main className='leap-session-main'>
        {showLoading ? (
          <div className='card center leap-finished-card'>Loading...</div>
        ) : sessionFinished ? (
          <div className='card center leap-finished-card'>
            <div className='leap-finished-title'>All done for today!</div>
            <p className='muted'>Everything due today is cleared.</p>
            <div className='leap-finished-actions'>
              <button
                type='button'
                className='btn btn-primary'
                onClick={handleRestart}
                disabled={restartBusy}
              >
                Review again
              </button>
              <button
                type='button'
                className='btn'
                onClick={() => nav('/')}
                disabled={restartBusy}
              >
                Back to home
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:16, width:'100%' }}>
            {cardContent}
            {speechAvailable && current?.phrase && (
              <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:12 }}>
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
                {/* {voiceOptions.length > 1 && (
                  <label className='muted' style={{ display:'flex', alignItems:'center', gap:8 }}>
                    <span>Voice</span>
                    <select
                      value={selectedVoiceURI}
                      onChange={handleVoiceChange}
                      style={{ padding:'4px 8px', borderRadius:6, border:'1px solid currentColor', fontSize:14 }}
                    >
                      {voiceOptions.map(option => (
                        <option key={option.voiceURI} value={option.voiceURI}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                )} */}
              </div>
            )}
          </div>
        )}
      </main>

      {!showLoading && !sessionFinished && (
        <footer className='leap-session-footer'>
          <div className='leap-session-stats'>
            <span>Remaining: {remainingCount}</span>
            <span>Retry later: {retryCount}</span>
          </div>
          <div className='review-grade-grid'>
            <button
              className='btn btn-accent review-grade'
              onClick={() => requestGrade('EASY')}
              disabled={busy || !current}
            >
              Easy
            </button>
            <button
              className='btn btn-primary review-grade'
              onClick={() => requestGrade('NORMAL')}
              disabled={busy || !current}
            >
              Normal
            </button>
            <button
              className='btn btn-danger review-grade'
              onClick={() => requestGrade('HARD')}
              disabled={busy || !current}
            >
              Hard
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

function scoreVoice(entry: SpeechSynthesisVoice) {
  const lang = entry.lang?.toLowerCase() ?? ''
  const name = entry.name?.toLowerCase() ?? ''
  let score = 0
  if (lang.startsWith('en')) score += 10
  if (lang === 'en-us') score += 8
  if (lang === 'en-gb') score += 6
  if (!entry.localService) score += 6
  if (entry.default) score += 2
  if (name.includes('google')) score += 6
  if (name.includes('microsoft')) score += 5
  if (name.includes('natural') || name.includes('neural')) score += 4
  if (name.includes('premium')) score += 3
  if (name.includes('female')) score += 1
  return score
}

function formatVoiceLabel(entry: SpeechSynthesisVoice) {
  const base = entry.name || entry.voiceURI
  const lang = entry.lang ? ` • ${entry.lang}` : ''
  const tags: string[] = []
  if (entry.default) tags.push('default')
  if (!entry.localService) tags.push('cloud')
  const lowerName = entry.name?.toLowerCase() ?? ''
  if (lowerName.includes('neural') || lowerName.includes('natural')) tags.push('neural')
  if (lowerName.includes('preview') || lowerName.includes('beta')) tags.push('preview')
  return `${base}${lang}${tags.length ? ` • ${tags.join(', ')}` : ''}`
}

function isHttpUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}
