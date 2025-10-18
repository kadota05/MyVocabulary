import { FormEvent, KeyboardEvent, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from '~/components/Toast'
import { useLeapStore } from '~/state/leap'

export default function LeapSetup() {
  const nav = useNavigate()
  const {
    totalAvailable,
    initMetadata,
    startSession,
    loading,
    error,
    clearError,
    config,
    catalog,
    catalogLoading
  } = useLeapStore(state => ({
    totalAvailable: state.totalAvailable,
    initMetadata: state.initMetadata,
    startSession: state.startSession,
    loading: state.loading,
    error: state.error,
    clearError: state.clearError,
    config: state.config,
    catalog: state.catalog,
    catalogLoading: state.catalogLoading
  }))

  const [startIndex, setStartIndex] = useState('')
  const [endIndex, setEndIndex] = useState('')
  const [addWrongToWordlist, setAddWrongToWordlist] = useState(false)
  const [order, setOrder] = useState<'random' | 'number'>('random')
  const [submitBusy, setSubmitBusy] = useState(false)
  const [errors, setErrors] = useState<{ start?: string; end?: string }>({})
  const [selectedHeadings, setSelectedHeadings] = useState<Set<number>>(() => new Set())
  const [pendingSyncRange, setPendingSyncRange] = useState(true)
  const [hasAppliedSelection, setHasAppliedSelection] = useState(false)

  useEffect(() => {
    void initMetadata()
  }, [initMetadata])

  useEffect(() => {
    if (!config) return
    setStartIndex(String(config.startIndex))
    setEndIndex(String(config.endIndex))
    setAddWrongToWordlist(config.addWrongToWordlist)
    setOrder(config.order)
    setPendingSyncRange(true)
    setHasAppliedSelection(true)
  }, [config])

  useEffect(() => {
    if (!error) return
    toast(error)
    clearError()
  }, [error, clearError])

  const maxHeading = useMemo(
    () => catalog.reduce((max, word) => (word.heading > max ? word.heading : max), 0),
    [catalog]
  )
  const availableHeadings = totalAvailable || maxHeading || 0

  const startHeading = useMemo(() => {
    if (!availableHeadings) return null
    const parsed = tryParseIndex(startIndex)
    if (parsed == null) return null
    return clamp(parsed, 1, availableHeadings)
  }, [startIndex, availableHeadings])
  const endHeading = useMemo(() => {
    if (!availableHeadings) return null
    const parsed = tryParseIndex(endIndex)
    if (parsed == null) return null
    return clamp(parsed, 1, availableHeadings)
  }, [endIndex, availableHeadings])
  const rangeBounds = useMemo(() => {
    if (startHeading == null || endHeading == null) return null
    if (startHeading > endHeading) return null
    return { start: startHeading, end: endHeading }
  }, [startHeading, endHeading])
  const rangeHeadings = useMemo(() => {
    if (!rangeBounds) return new Set<number>()
    const set = new Set<number>()
    for (const word of catalog){
      if (word.heading >= rangeBounds.start && word.heading <= rangeBounds.end) set.add(word.heading)
    }
    return set
  }, [rangeBounds, catalog])
  const catalogOrder = useMemo(() => {
    const map = new Map<number, number>()
    catalog.forEach((word, index) => { map.set(word.heading, index) })
    return map
  }, [catalog])

  useEffect(() => {
    if (!pendingSyncRange) return
    if (!catalog.length) {
      setSelectedHeadings(new Set())
      setHasAppliedSelection(false)
      setPendingSyncRange(false)
      return
    }
    if (!rangeBounds || rangeHeadings.size === 0) {
      setSelectedHeadings(new Set())
      setHasAppliedSelection(false)
      setPendingSyncRange(false)
      return
    }
    setSelectedHeadings(prev => {
      const next = new Set(prev)
      rangeHeadings.forEach(h => next.add(h))
      return next
    })
    setHasAppliedSelection(true)
    setPendingSyncRange(false)
  }, [pendingSyncRange, catalog, rangeBounds, rangeHeadings])

  const selectedCount = selectedHeadings.size
  const selectedWords = useMemo(() => {
    if (!catalog.length || selectedHeadings.size === 0) return []
    const set = selectedHeadings
    return catalog
      .filter(word => set.has(word.heading))
      .sort((a, b) => a.heading - b.heading || a.phrase.localeCompare(b.phrase))
  }, [catalog, selectedHeadings])
  const rangeSummary = useMemo(() => {
    if (!catalog.length) return ''
    if (rangeBounds) {
      return `#${rangeBounds.start}~#${rangeBounds.end} / \u9078\u629e ${selectedCount.toLocaleString('ja-JP')} \u8a9e`
    }
    if (startHeading != null) return `#${startHeading} \u3092\u5165\u529b\u4e2d`
    if (selectedCount > 0) return `\u9078\u629e ${selectedCount.toLocaleString('ja-JP')} \u8a9e`
    if (hasAppliedSelection) return '\u9078\u629e\u4e2d\u306e\u30ab\u30fc\u30c9\u304c\u3042\u308a\u307e\u305b\u3093'
    return ''
  }, [catalog.length, rangeBounds, selectedCount, startHeading, hasAppliedSelection])
  const displayWords = useMemo(() => {
    if (!catalog.length) return []
    const rangeSet = rangeHeadings
    const selected = selectedHeadings
    const focusHeading = startHeading
    const priorityOf = (word: (typeof catalog)[number]) => {
      if (focusHeading != null && word.heading === focusHeading) return 0
      if (selected.has(word.heading)) return 1
      if (rangeSet.has(word.heading)) return 2
      return 3
    }
    return [...catalog].sort((a, b) => {
      const pa = priorityOf(a)
      const pb = priorityOf(b)
      if (pa !== pb) return pa - pb
      const oa = catalogOrder.get(a.heading) ?? 0
      const ob = catalogOrder.get(b.heading) ?? 0
      return oa - ob
    })
  }, [catalog, startHeading, selectedHeadings, rangeHeadings, catalogOrder])
  const previewBadge = useMemo(() => {
    if (!catalog.length) return '\u30ab\u30fc\u30c9\u306a\u3057'
    return `\u5168 ${displayWords.length.toLocaleString('ja-JP')} \u8a9e / \u9078\u629e ${selectedCount.toLocaleString('ja-JP')} \u8a9e`
  }, [catalog.length, displayWords.length, selectedCount])

  function handleStartChange(value: string) {
    setStartIndex(value)
    setPendingSyncRange(true)
    setErrors(prev => {
      if (!prev.start) return prev
      if (value.trim()) {
        const next = { ...prev }
        delete next.start
        return next
      }
      return prev
    })
  }

  function handleEndChange(value: string) {
    setEndIndex(value)
    setPendingSyncRange(true)
    setErrors(prev => {
      if (!prev.end) return prev
      if (value.trim()) {
        const next = { ...prev }
        delete next.end
        return next
      }
      return prev
    })
  }

  function toggleSelection(heading: number, nextChecked: boolean) {
    let nextSize = 0
    setSelectedHeadings(prev => {
      const next = new Set(prev)
      if (nextChecked) next.add(heading)
      else next.delete(heading)
      nextSize = next.size
      return next
    })
    if (nextChecked || nextSize > 0 || rangeHeadings.size > 0) setHasAppliedSelection(true)
    else setHasAppliedSelection(false)
  }

  const handleCardToggle = (heading: number) => {
    const nextChecked = !selectedHeadings.has(heading)
    toggleSelection(heading, nextChecked)
  }

  const handleCardKeyDown = (event: KeyboardEvent<HTMLElement>, heading: number) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      handleCardToggle(heading)
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (selectedWords.length === 0) {
      toast('出題するカードを選択してください。')
      return
    }

    const parsedStart = tryParseIndex(startIndex)
    const parsedEnd = tryParseIndex(endIndex)
    const start = parsedStart != null && availableHeadings
      ? clamp(parsedStart, 1, availableHeadings)
      : null
    const end = parsedEnd != null && availableHeadings
      ? clamp(parsedEnd, 1, availableHeadings)
      : null

    if (start != null && end != null && start > end) {
      toast('正しい出題範囲を入力してください。')
      return
    }

    setErrors({})
    if (start != null) setStartIndex(String(start))
    if (end != null) setEndIndex(String(end))

    setSubmitBusy(true)
    try {
      const result = await startSession(
        {
          startIndex: start ?? 1,
          endIndex: end ?? (availableHeadings || 1),
          order,
          addWrongToWordlist
        },
        selectedWords
      )
      if (result.success) {
        nav('/leap/session')
      } else if (result.error) {
        toast(result.error)
      }
    } finally {
      setSubmitBusy(false)
    }
  }

  return (
    <div className='home-screen leap-setup-screen'>
      <header className='home-header leap-header'>
        <div className='home-header__brand'>必携英単語Leap</div>
        <div className='home-header__actions'>
          <button className='icon-button' onClick={() => nav('/')} aria-label='Back to home'>
            <CloseIcon />
          </button>
        </div>
      </header>

      <main className='leap-setup-main'>
        <div className='leap-setup-grid'>
          <form className='leap-setup-form' onSubmit={handleSubmit}>
            <section className='card leap-control-card'>
              <div className='leap-range-line'>
                <span className='leap-range-label'>見出し番号:</span>
                <div className='leap-range-stack'>
                  <div className='leap-range-option'>
                    <label className='leap-range-pill'>
                      <span className='leap-range-pill__label'>FROM</span>
                      <input
                        type='number'
                        className='leap-range-input'
                        inputMode='numeric'
                        step={1}
                        min={1}
                        max={availableHeadings || undefined}
                        value={startIndex}
                        onChange={event => handleStartChange(event.target.value)}
                        placeholder='例: 1'
                      />
                    </label>
                    {errors.start && <p className='form-error leap-error'>{errors.start}</p>}
                  </div>
                  <div className='leap-range-option'>
                    <label className='leap-range-pill'>
                      <span className='leap-range-pill__label'>TO</span>
                      <input
                        type='number'
                        className='leap-range-input'
                        inputMode='numeric'
                        step={1}
                        min={1}
                        max={availableHeadings || undefined}
                        value={endIndex}
                        onChange={event => handleEndChange(event.target.value)}
                        placeholder='例: 2000'
                      />
                    </label>
                    {errors.end && <p className='form-error leap-error'>{errors.end}</p>}
                  </div>
                </div>
              </div>
              <div className='leap-range-summary'>{rangeSummary}</div>

              <div className='leap-order-row'>
                <span className='leap-order-label'>出題順序:</span>
                <div className='leap-order-pills' role='radiogroup' aria-label='出題順序'>
                  <label className={`leap-order-pill ${order === 'random' ? 'active' : ''}`}>
                    <input
                      type='radio'
                      name='leap-order'
                      value='random'
                      checked={order === 'random'}
                      onChange={() => setOrder('random')}
                    />
                    <span>ランダム</span>
                  </label>
                  <label className={`leap-order-pill ${order === 'number' ? 'active' : ''}`}>
                    <input
                      type='radio'
                      name='leap-order'
                      value='number'
                      checked={order === 'number'}
                      onChange={() => setOrder('number')}
                    />
                    <span>見出し番号順</span>
                  </label>
                </div>
              </div>

              <div className='leap-actions'>
                <label className='leap-checkbox leap-checkbox-inline'>
                  <input
                    type='checkbox'
                    checked={addWrongToWordlist}
                    onChange={event => setAddWrongToWordlist(event.target.checked)}
                  />
                  <span>間違えたカードを保存</span>
                </label>
                <button
                  type='submit'
                  className='btn btn-primary'
                  disabled={loading || submitBusy || !availableHeadings || selectedWords.length === 0}
                >
                  {loading || submitBusy ? '準備中...' : '出題開始'}
                </button>
                <button
                  type='button'
                  className='btn'
                  onClick={() => nav('/')}
                  disabled={loading || submitBusy}
                >
                  キャンセル
                </button>
              </div>
            </section>
          </form>

          <section className='card leap-preview-panel' aria-live='polite'>
            <div className='leap-preview-header'>
              <h2 className='leap-control-title'>単語一覧</h2>
              <span className='leap-control-pill'>{previewBadge}</span>
            </div>
            <div className='leap-preview-body'>
              {catalogLoading ? (
                <div className='leap-preview-empty muted'>読み込み中...</div>
              ) : !catalog.length ? (
                <div className='leap-preview-empty muted'>単語リストが見つかりません。</div>
              ) : displayWords.length === 0 ? (
                <div className='leap-preview-empty muted'>選択中のカードがありません。</div>
              ) : (
                <div className='leap-preview-list'>
                  {displayWords.map(word => {
                    const checked = selectedHeadings.has(word.heading)
                    const inRange = rangeHeadings.has(word.heading)
                    const isFocus = startHeading != null && word.heading === startHeading
                    const classes = ['leap-preview-card']
                    if (checked) classes.push('selected')
                    if (inRange) classes.push('in-range')
                    if (isFocus) classes.push('focus')
                    return (
                      <article
                        key={`${word.heading}-${word.phrase}`}
                        className={classes.join(' ')}
                        role='button'
                        tabIndex={0}
                        aria-pressed={checked}
                        onClick={event => { event.preventDefault(); handleCardToggle(word.heading) }}
                        onKeyDown={event => handleCardKeyDown(event, word.heading)}
                      >
                        <div className='leap-preview-card__meta'>
                          <span className='leap-preview-card__heading'>#{word.heading}</span>
                          <span className='leap-preview-check' aria-hidden='true'>✓</span>
                        </div>
                        <div className='leap-preview-card__phrase'>{word.phrase}</div>
                        {word.meaning && <div className='leap-preview-card__meaning'>{word.meaning}</div>}
                        {(word.example || word.source) && (
                          <div className='leap-preview-card__details'>
                            {word.example && <div className='leap-preview-card__example'>{word.example}</div>}
                            {word.source && <div className='leap-preview-card__source'>{word.source}</div>}
                          </div>
                        )}
                      </article>
                    )
                  })}
                </div>
              )}
            </div>
          </section>
        </div>
      </main>
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

function tryParseIndex(value: string): number | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  const parsed = Number(trimmed)
  if (!Number.isFinite(parsed)) return null
  return Math.trunc(parsed)
}

function clamp(value: number, min: number, max: number) {
  if (Number.isNaN(value)) return min
  return Math.min(Math.max(value, min), max)
}





