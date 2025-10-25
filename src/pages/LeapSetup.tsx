import { FormEvent, KeyboardEvent, MouseEvent, PointerEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from '~/components/Toast'
import { useLeapStore } from '~/state/leap'

const CHUNK_SIZE = 100
type FormDefaults = {
  startIndex: string
  endIndex: string
  addWrongToWordlist: boolean
  order: 'random' | 'number'
}

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
    catalogLoading,
    exitSession
  } = useLeapStore(state => ({
    totalAvailable: state.totalAvailable,
    initMetadata: state.initMetadata,
    startSession: state.startSession,
    loading: state.loading,
    error: state.error,
    clearError: state.clearError,
    config: state.config,
    catalog: state.catalog,
    catalogLoading: state.catalogLoading,
    exitSession: state.exitSession
  }))

  const [startIndex, setStartIndex] = useState('')
  const [endIndex, setEndIndex] = useState('')
  const [addWrongToWordlist, setAddWrongToWordlist] = useState(false)
  const [order, setOrder] = useState<'random' | 'number'>('random')
  const [submitBusy, setSubmitBusy] = useState(false)
  const [errors, setErrors] = useState<{ start?: string; end?: string }>({})
  const [selectedHeadings, setSelectedHeadings] = useState<Set<number>>(() => new Set<number>())
  const [pendingSyncRange, setPendingSyncRange] = useState(true)
  const [hasAppliedSelection, setHasAppliedSelection] = useState(false)
  const [previewMode, setPreviewMode] = useState<'all' | 'selected'>('all')
  const [chunkIndex, setChunkIndex] = useState(0)
  const chunkTrackRefs = useRef<{ main: HTMLDivElement | null; footer: HTMLDivElement | null }>({
    main: null,
    footer: null
  })
  const defaultFormRef = useRef<FormDefaults>({
    startIndex: '',
    endIndex: '',
    addWrongToWordlist: false,
    order: 'random'
  })
  const skipClickRef = useRef(false)
  const manualOverridesRef = useRef<Map<number, boolean>>(new Map())

  useEffect(() => {
    exitSession()
    const blankDefaults: FormDefaults = {
      startIndex: '',
      endIndex: '',
      addWrongToWordlist: false,
      order: 'random'
    }
    defaultFormRef.current = blankDefaults
    applyFormDefaults(blankDefaults)
  }, [exitSession])

  useEffect(() => {
    void initMetadata()
  }, [initMetadata])

  useEffect(() => {
    if (!config) return
    const defaults: FormDefaults = {
      startIndex: String(config.startIndex),
      endIndex: String(config.endIndex),
      addWrongToWordlist: config.addWrongToWordlist,
      order: config.order
    }
    defaultFormRef.current = defaults
    applyFormDefaults(defaults)
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
  const sortedCatalog = useMemo(
    () =>
      [...catalog].sort(
        (a, b) => a.heading - b.heading || a.phrase.localeCompare(b.phrase)
      ),
    [catalog]
  )
  const chunkRanges = useMemo(() => {
    if (!availableHeadings) return []
    const ranges: Array<{ start: number; end: number }> = []
    for (let start = 1; start <= availableHeadings; start += CHUNK_SIZE) {
      const end = Math.min(start + CHUNK_SIZE - 1, availableHeadings)
      ranges.push({ start, end })
    }
    return ranges
  }, [availableHeadings])
  const currentChunkRange = chunkRanges.length
    ? chunkRanges[Math.min(chunkIndex, chunkRanges.length - 1)]
    : null

  useEffect(() => {
    if (previewMode !== 'all') return
    if (!chunkRanges.length) {
      if (chunkIndex !== 0) setChunkIndex(0)
      return
    }
    if (chunkIndex >= chunkRanges.length) setChunkIndex(chunkRanges.length - 1)
  }, [previewMode, chunkRanges, chunkIndex])

  useEffect(() => {
    if (!pendingSyncRange) return
    if (!catalog.length) {
      setSelectedHeadings(new Set<number>())
      setHasAppliedSelection(false)
      setPendingSyncRange(false)
      manualOverridesRef.current.clear()
      return
    }
    if (!rangeBounds || rangeHeadings.size === 0) {
      setSelectedHeadings(new Set<number>())
      setHasAppliedSelection(false)
      setPendingSyncRange(false)
      manualOverridesRef.current.clear()
      return
    }
    applySelectionFromRange()
    setPendingSyncRange(false)
  }, [pendingSyncRange, catalog, rangeBounds, rangeHeadings])

  const selectedCount = selectedHeadings.size

  useEffect(() => {
    if (previewMode === 'selected' && selectedCount === 0) setPreviewMode('all')
  }, [previewMode, selectedCount])
  useEffect(() => {
    if (!catalog.length || !rangeBounds || pendingSyncRange) return
    setPendingSyncRange(true)
  }, [catalog.length, rangeBounds, pendingSyncRange])
  const selectedWords = useMemo(() => {
    if (!sortedCatalog.length || selectedHeadings.size === 0) return []
    const set = selectedHeadings
    return sortedCatalog.filter(word => set.has(word.heading))
  }, [sortedCatalog, selectedHeadings])
  const rangeSummary = useMemo(() => {
    if (!catalog.length) return ''
    if (rangeBounds) {
      return `#${rangeBounds.start}~#${rangeBounds.end} / 選択 ${selectedCount.toLocaleString('ja-JP')} 語`
    }
    if (startHeading != null) return `#${startHeading} を入力中`
    if (selectedCount > 0) return `選択 ${selectedCount.toLocaleString('ja-JP')} 語`
    if (hasAppliedSelection) return '選択中のカードがありません'
    return ''
  }, [catalog.length, rangeBounds, selectedCount, startHeading, hasAppliedSelection])
  const displayWords = useMemo(() => {
    if (!sortedCatalog.length) return []
    if (previewMode === 'selected') {
      if (selectedHeadings.size === 0) return []
      return sortedCatalog.filter(word => selectedHeadings.has(word.heading))
    }
    if (!currentChunkRange) return sortedCatalog
    const { start, end } = currentChunkRange
    return sortedCatalog.filter(word => word.heading >= start && word.heading <= end)
  }, [sortedCatalog, previewMode, selectedHeadings, currentChunkRange])
  const totalWordsLabel = `全 ${sortedCatalog.length.toLocaleString('ja-JP')} 語`
  const selectedWordsLabel = `選択 ${selectedCount.toLocaleString('ja-JP')} 語`
  const chunkCount = chunkRanges.length
  const showChunkControls = previewMode === 'all' && chunkCount > 1 && sortedCatalog.length > 0
  const chunkPrevDisabled = !showChunkControls || chunkIndex === 0
  const chunkNextDisabled = !showChunkControls || chunkIndex >= chunkCount - 1
  const chunkRangeLabel = currentChunkRange
    ? `${currentChunkRange.start.toLocaleString('ja-JP')}~${currentChunkRange.end.toLocaleString('ja-JP')}`
    : ''
  const chunkSizeLabel = CHUNK_SIZE.toLocaleString('ja-JP')
  const emptyMessage =
    previewMode === 'selected'
      ? '選択中の単語がありません。'
      : 'この範囲の単語が見つかりません。'
  const isStartFilled = startIndex.trim().length > 0
  const isEndFilled = endIndex.trim().length > 0
  const scrollActiveChunkIntoView = useCallback(
    (track: HTMLDivElement | null, behavior: 'auto' | 'smooth' = 'smooth') => {
      if (!track) return
      const pills = track.querySelectorAll<HTMLButtonElement>('.leap-chunk-pill')
      if (!pills.length) return
      const target = pills[Math.min(chunkIndex, pills.length - 1)]
      if (!target) return
      const paddingLeft = Number.parseFloat(getComputedStyle(track).paddingLeft) || 0
      const left = Math.max(0, target.offsetLeft - paddingLeft)
      track.scrollTo({ left, behavior })
    },
    [chunkIndex]
  )
  const renderChunkControls = (variant?: 'footer') => {
    if (!showChunkControls) return null
    const trackKey: 'main' | 'footer' = variant === 'footer' ? 'footer' : 'main'
    return (
      <div className={`leap-chunk-controls${variant === 'footer' ? ' leap-chunk-controls--footer' : ''}`}>
        <button
          type='button'
          className='leap-chunk-nav'
          onClick={() => setChunkIndex(prev => Math.max(0, prev - 1))}
          disabled={chunkPrevDisabled}
          aria-label={`前の${chunkSizeLabel}語`}
        >
          &lt;
        </button>
        <div
          className='leap-chunk-track'
          role='radiogroup'
          aria-label='表示範囲'
          ref={node => {
            chunkTrackRefs.current[trackKey] = node
          }}
        >
          {chunkRanges.map((range, index) => {
            const label = `${range.start.toLocaleString('ja-JP')}~${range.end.toLocaleString('ja-JP')}`
            const active = index === chunkIndex
            return (
              <button
                key={`${range.start}-${range.end}`}
                type='button'
                className={`leap-chunk-pill ${active ? 'active' : ''}`}
                onClick={() => setChunkIndex(index)}
                role='radio'
                aria-checked={active}
              >
                {label}
              </button>
            )
          })}
        </div>
        <button
          type='button'
          className='leap-chunk-nav'
          onClick={() => setChunkIndex(prev => Math.min(chunkCount - 1, prev + 1))}
          disabled={chunkNextDisabled}
          aria-label={`次の${chunkSizeLabel}語`}
        >
          &gt;
        </button>
      </div>
    )
  }

  useEffect(() => {
    if (!showChunkControls) return
    scrollActiveChunkIntoView(chunkTrackRefs.current.main)
    scrollActiveChunkIntoView(chunkTrackRefs.current.footer)
  }, [showChunkControls, chunkRanges.length, scrollActiveChunkIntoView])

  function applySelectionFromRange() {
    const base = new Set(rangeHeadings)
    const nextOverrides = new Map<number, boolean>()
    manualOverridesRef.current.forEach((checked, heading) => {
      const defaultSelected = base.has(heading)
      if (checked === defaultSelected) return
      nextOverrides.set(heading, checked)
      if (checked) base.add(heading)
      else base.delete(heading)
    })
    manualOverridesRef.current = nextOverrides
    setSelectedHeadings(base)
    setHasAppliedSelection(base.size > 0)
  }

  function applyFormDefaults(defaults: FormDefaults) {
    setStartIndex(defaults.startIndex)
    setEndIndex(defaults.endIndex)
    setAddWrongToWordlist(defaults.addWrongToWordlist)
    setOrder(defaults.order)
    setSelectedHeadings(new Set<number>())
    setPendingSyncRange(true)
    setHasAppliedSelection(false)
    setPreviewMode('all')
    setChunkIndex(0)
    setErrors({})
    manualOverridesRef.current.clear()
  }

  function handleReset() {
    applyFormDefaults(defaultFormRef.current)
  }

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
    const defaultSelected = rangeHeadings.has(heading)
    if (nextChecked === defaultSelected) manualOverridesRef.current.delete(heading)
    else manualOverridesRef.current.set(heading, nextChecked)
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

  const handleCardPointerUp = (event: PointerEvent<HTMLElement>, heading: number) => {
    if (event.pointerType !== 'touch' && event.pointerType !== 'pen') return
    event.preventDefault()
    skipClickRef.current = true
    handleCardToggle(heading)
  }

  const handleCardClick = (event: MouseEvent<HTMLElement>, heading: number) => {
    event.preventDefault()
    if (skipClickRef.current) {
      skipClickRef.current = false
      return
    }
    handleCardToggle(heading)
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
              <h2 className='leap-control-title'>出題設定</h2>
              <div className='leap-range-line'>
                <span className='leap-range-label'>見出し番号:</span>
                <div className='leap-range-stack'>
                  <div className='leap-range-option'>
                    <label className={`leap-range-pill ${isStartFilled ? 'filled' : ''}`}>
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
                      />
                    </label>
                    {errors.start && <p className='form-error leap-error'>{errors.start}</p>}
                  </div>
                  <div className='leap-range-option'>
                    <label className={`leap-range-pill ${isEndFilled ? 'filled' : ''}`}>
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
                  <span className='leap-checkbox-box' aria-hidden='true' />
                  <span className='leap-checkbox-label'>間違えたカードを保存</span>
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
                  onClick={handleReset}
                  disabled={loading || submitBusy}
                >
                  リセット
                </button>
              </div>
            </section>
          </form>

          <section className='card leap-preview-panel' aria-live='polite'>
            <div className='leap-preview-header'>
              <h2 className='leap-control-title'>単語一覧</h2>
              <div className='leap-preview-filters' role='group' aria-label='表示モード'>
                <button
                  type='button'
                  className={`leap-preview-filter ${previewMode === 'all' ? 'active' : ''}`}
                  onClick={() => setPreviewMode('all')}
                >
                  {totalWordsLabel}
                </button>
                <button
                  type='button'
                  className={`leap-preview-filter ${previewMode === 'selected' ? 'active' : ''}`}
                  onClick={() => setPreviewMode('selected')}
                  disabled={selectedCount === 0}
                >
                  {selectedWordsLabel}
                </button>
              </div>
            </div>
            <div className='leap-preview-body'>
              {renderChunkControls()}
              {previewMode === 'all' && chunkRangeLabel && (
                <div className='leap-chunk-active muted'>表示: {chunkRangeLabel}</div>
              )}
              {catalogLoading ? (
                <div className='leap-preview-empty muted'>読み込み中...</div>
              ) : !catalog.length ? (
                <div className='leap-preview-empty muted'>単語リストが見つかりません。</div>
              ) : displayWords.length === 0 ? (
                <div className='leap-preview-empty muted'>{emptyMessage}</div>
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
                        onClick={event => handleCardClick(event, word.heading)}
                        onPointerUp={event => handleCardPointerUp(event, word.heading)}
                        onKeyDown={event => handleCardKeyDown(event, word.heading)}
                      >
                        <div className='leap-preview-card__meta'>
                          <span className='leap-preview-card__heading'>#{word.heading}</span>
                          <span className='leap-preview-check' aria-hidden='true'>✓</span>
                        </div>
                        <div className='leap-preview-card__content'>
                          <div className='leap-preview-card__phrase-row'>
                            <span className='leap-preview-card__phrase'>{word.phrase}</span>
                            {word.meaning && (
                              <span className='leap-preview-card__meaning'>{word.meaning}</span>
                            )}
                          </div>
                          {(word.example || word.source) && (
                            <div className='leap-preview-card__details'>
                              {word.example && <div className='leap-preview-card__example'>{word.example}</div>}
                              {word.source && <div className='leap-preview-card__source'>{word.source}</div>}
                            </div>
                          )}
                        </div>
                      </article>
                    )
                  })}
                </div>
              )}
              {renderChunkControls('footer')}
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






