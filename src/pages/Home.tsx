import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from '~/components/Toast'
import { addWord, getWordSummary, importRows, type ImportRow, type WordSummary } from '~/db/sqlite'
import { parseCsv } from '~/lib/csv'
import { ensureGoogleLoaded, fetchFirstTableRows } from '~/lib/google'
import { useImportSettings } from '~/state/importSettings'
import { useStore } from '~/state/store'

type Phase = 'idle' | 'auth' | 'fetch' | 'parse' | 'insert'

export default function Home(){
  const nav = useNavigate()
  const { clientId, docId } = useImportSettings()
  const cardOrder = useStore(state => state.cardOrder)
  const toggleCardOrder = useStore(state => state.toggleCardOrder)
  const [busy, setBusy] = useState(false)
  const [phase, setPhase] = useState<Phase>('idle')
  const [progress, setProgress] = useState<{done:number; total:number}>({ done:0, total:0 })
  const [cancelled, setCancelled] = useState(false)
  const [fabOpen, setFabOpen] = useState(false)
  const [newWordOpen, setNewWordOpen] = useState(false)
  const [newWordBusy, setNewWordBusy] = useState(false)
  const [newWord, setNewWord] = useState({ phrase:'', meaning:'', example:'', source:'' })
  const [duplicateError, setDuplicateError] = useState<string | null>(null)
  const [csvModalOpen, setCsvModalOpen] = useState(false)
  const [csvRows, setCsvRows] = useState<ImportRow[]>([])
  const [csvFileName, setCsvFileName] = useState('')
  const [csvError, setCsvError] = useState<string | null>(null)
  const [csvBusy, setCsvBusy] = useState(false)
  const [csvParsing, setCsvParsing] = useState(false)
  const [csvProgress, setCsvProgress] = useState<{done:number; total:number}>({ done:0, total:0 })
  const [summary, setSummary] = useState<WordSummary>({ total:0, learning:0, learned:0, firstCreatedAt: null })
  const [importSuccess, setImportSuccess] = useState<string | null>(null)
  const phraseInputRef = useRef<HTMLInputElement|null>(null)
  const csvInputRef = useRef<HTMLInputElement|null>(null)

  useEffect(()=>{
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape'){
        setFabOpen(false)
        if (!newWordBusy){
          setNewWordOpen(false)
          resetNewWord()
        }
        if (!csvBusy){
          setCsvModalOpen(false)
          resetCsvImport()
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  },[newWordBusy, csvBusy])

  const fabOpenRef = useRef(fabOpen)
  useEffect(()=> { fabOpenRef.current = fabOpen },[fabOpen])

  const suppressClickRef = useRef(false)
  useEffect(()=>{
    const handlePointerDown = (event: PointerEvent) => {
      if (!fabOpenRef.current) return
      const target = event.target as HTMLElement | null
      if (target?.closest('.fab-container')) return
      suppressClickRef.current = true
      event.preventDefault()
      event.stopPropagation()
      event.stopImmediatePropagation()
      setFabOpen(false)
    }

    const handleClick = (event: MouseEvent) => {
      if (!suppressClickRef.current) return
      suppressClickRef.current = false
      event.preventDefault()
      event.stopPropagation()
      event.stopImmediatePropagation()
    }

    window.addEventListener('pointerdown', handlePointerDown, true)
    window.addEventListener('click', handleClick, true)
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown, true)
      window.removeEventListener('click', handleClick, true)
    }
  },[])

  useEffect(()=>{
    if (newWordOpen){
      setFabOpen(false)
      requestAnimationFrame(()=> phraseInputRef.current?.focus())
    }
  },[newWordOpen])

  const refreshStats = useCallback(async ()=>{
    try{
      const data = await getWordSummary()
      setSummary(data)
    } catch (error){
      console.error('Failed to load word summary', error)
    }
  },[])

  useEffect(()=>{ void refreshStats() },[refreshStats])

  useEffect(()=> {
    if (!importSuccess) return
    const timer = window.setTimeout(()=> setImportSuccess(null), 6000)
    return ()=> window.clearTimeout(timer)
  },[importSuccess])

  const dayCount = useMemo(()=> calculateDayCount(summary.firstCreatedAt), [summary.firstCreatedAt])
  const dayCountFormatted = dayCount > 0 ? dayCount.toLocaleString('en-US') : ''
  const dayLine = dayCount > 0 ? `Day ${dayCountFormatted}` : 'Waiting for your first sync'
  const learningCountFormatted = useMemo(()=> summary.learning.toLocaleString('en-US'),[summary.learning])
  const learnedCountFormatted = useMemo(()=> summary.learned.toLocaleString('en-US'),[summary.learned])
  const todayLabel = formatDisplayDate(new Date())
  const csvPreviewRows = csvRows.slice(0, 20)
  const csvRemaining = Math.max(0, csvRows.length - csvPreviewRows.length)
  const csvHasPreview = csvRows.length > 0
  const csvActionLabel = csvBusy ? `追加中 ${csvProgress.done}/${csvProgress.total || csvRows.length}` : '追加する'
  const csvLayoutClass = ['col', 'csv-import-layout', csvHasPreview ? 'has-preview' : ''].filter(Boolean).join(' ')
  const cardOrderLabel = cardOrder === 'phrase-first' ? 'Phrase → Meaning' : 'Meaning → Phrase'

  function resetNewWord(){
    setNewWord({ phrase:'', meaning:'', example:'', source:'' })
    setDuplicateError(null)
  }

  function resetCsvImport(){
    setCsvRows([])
    setCsvFileName('')
    setCsvError(null)
    setCsvParsing(false)
    setCsvProgress({ done:0, total:0 })
    setCsvBusy(false)
    if (csvInputRef.current) csvInputRef.current.value = ''
  }

  const openCsvModal = () => {
    resetCsvImport()
    setFabOpen(false)
    setCsvModalOpen(true)
  }

  const closeCsvModal = () => {
    if (csvBusy) return
    setCsvModalOpen(false)
    resetCsvImport()
  }

  function formatGapiError(e:any){
    try{
      const err = e?.result?.error || e?.error || e
      const code = err?.code || err?.status || ''
      const msg = err?.message || String(e)
      return `${code} ${msg}`.trim()
    } catch {
      return String(e)
    }
  }

  async function onImport(){
    try{
      if (!clientId) { alert('Please enter your Google OAuth Client ID.'); return }
      if (!docId) { alert('Please enter your Google Document ID.'); return }
      setCancelled(false)
      setBusy(true)
      setPhase('auth')
      setProgress({ done:0, total:0 })
      await ensureGoogleLoaded(clientId)
      setPhase('fetch')
      if (cancelled) throw new Error('USER_CANCELLED')
      const rows = await fetchFirstTableRows(docId)
      setPhase('parse')
      const total = rows.length
      setProgress({ done:0, total })
      setPhase('insert')
      const stats = await importRows(rows, (done,total)=> setProgress({ done, total }))
      const message = `Imported ${stats.added} • Skipped ${stats.skipped} • Failed ${stats.failed}`
      setImportSuccess(message)
      await refreshStats()
    } catch(e:any){
      const msg = String(e?.message || e)
      if (msg === 'NO_TABLE') alert('No usable table was found in the document.')
      else if (msg.includes('redirect_uri_mismatch')) alert('Check OAuth Redirect/Origins configuration (redirect_uri_mismatch).')
      else if (msg === 'AUTH_CANCELLED' || msg === 'USER_CANCELLED'){
        // If the user cancels manually, exit quietly without notifying
      }
      else if (msg === 'AUTH_TIMEOUT') alert('Authentication timed out. Please try again.')
      else {
        const detail = formatGapiError(e)
        alert(`Import failed: ${detail}`)
        console.error('Import failed', e)
      }
    } finally{
      setBusy(false)
      setPhase('idle')
      setProgress({ done:0, total:0 })
    }
  }

  const handleCsvFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file){
      setCsvRows([])
      setCsvFileName('')
      setCsvError(null)
      return
    }
    setCsvParsing(true)
    setCsvError(null)
    setCsvProgress({ done:0, total:0 })
    try{
      const text = await file.text()
      const table = parseCsv(text)
      const rows = buildImportRowsFromCsv(table)
      setCsvRows(rows)
      setCsvFileName(file.name)
    } catch (error){
      setCsvRows([])
      setCsvFileName('')
      setCsvError(describeCsvError(error))
      console.error('Failed to parse CSV file', error)
    } finally{
      setCsvParsing(false)
    }
  }

  const handleCsvReupload = () => {
    if (csvBusy || csvParsing) return
    if (csvInputRef.current) csvInputRef.current.value = ''
    csvInputRef.current?.click()
  }

  async function onImportCsv(){
    if (csvBusy || !csvRows.length) return
    setCsvBusy(true)
    setCsvError(null)
    setCsvProgress({ done:0, total:csvRows.length })
    try{
      const stats = await importRows(csvRows, (done,total)=> setCsvProgress({ done, total }))
      const message = `Imported ${stats.added} • Skipped ${stats.skipped} • Failed ${stats.failed}`
      setImportSuccess(message)
      await refreshStats()
      setCsvModalOpen(false)
      resetCsvImport()
    } catch (error){
      console.error('CSV import failed', error)
      setCsvError('CSVの取り込みに失敗しました。もう一度お試しください。')
    } finally{
      setCsvBusy(false)
    }
  }

  async function onCreateWord(){
    if (newWordBusy) return
    const phrase = newWord.phrase.trim()
    if (!phrase){
      alert('Please enter a phrase.')
      return
    }
    setDuplicateError(null)
    setNewWordBusy(true)
    try{
      await addWord({
        phrase,
        meaning: newWord.meaning,
        example: newWord.example,
        source: newWord.source
      })
      toast('Added a new card.')
      await refreshStats()
      setNewWordOpen(false)
      resetNewWord()
    } catch(e:any){
      const msg = String(e?.message || e)
      if (msg === 'VALIDATION_EMPTY_PHRASE') alert('Phrase is required.')
      else if (msg === 'DUPLICATE_PHRASE'){
        setDuplicateError('That phrase is already registered.')
      }
      else {
        alert('Failed to add card.')
        console.error('Add word failed', e)
      }
    } finally{
      setNewWordBusy(false)
    }
  }

  const closeNewWord = ()=> {
    if (newWordBusy) return
    setNewWordOpen(false)
    resetNewWord()
  }

  return (
    <div className='home-screen'>
      {busy && (
        <ImportProgress
          phase={phase}
          progress={progress}
          onCancel={()=>{ if (phase!=='insert'){ setCancelled(true); setBusy(false); setPhase('idle') } }}
        />
      )}

      <header className='home-header'>
        <div className='home-header__brand'>MyVocabulary</div>
        <div className='home-header__actions'>
          <button
            type='button'
            className='icon-button card-order-toggle'
            onClick={toggleCardOrder}
            aria-label={`Switch review cards to ${cardOrder === 'phrase-first' ? 'Meaning → Phrase' : 'Phrase → Meaning'}`}
            aria-pressed={cardOrder === 'meaning-first'}
            title={`Review order: ${cardOrderLabel}`}
          >
            <span className='card-order-toggle__text' aria-hidden='true'>
              {cardOrder === 'phrase-first' ? 'P→M' : 'M→P'}
            </span>
          </button>
          <button
            type='button'
            className='icon-button'
            onClick={()=> nav('/words')}
            aria-label='Go to word library'
          >
            <DictionaryIcon />
          </button>
        </div>
      </header>

      <main className='home-body'>
        <section className='circle-hero'>
          <div className='hero-stack'>
            <div className='hero-orb hero-orb--top'>
              <div className='hero-meta hero-meta--top'>
                <span className='hero-meta__date'>{todayLabel}</span>
                <span className='hero-meta__detail hero-meta__detail--day'>{dayLine}</span>
              </div>
            </div>
            <div className='hero-orb hero-orb--bottom'>
              <div className='hero-meta hero-meta--bottom'>
                <span className='hero-meta__detail'><span className='hero-number'>{learningCountFormatted}</span> In Progress</span>
                <span className='hero-meta__detail'><span className='hero-number'>{learnedCountFormatted}</span> Mastered</span>
              </div>
            </div>
            <button
              type='button'
              className='hero-orb hero-orb--main'
              onClick={()=> nav('/review')}
              aria-label="Start today's review"
            >
              <span className='hero-label'>Start.</span>
            </button>
          </div>
        </section>
      </main>

      {fabOpen && <div className='fab-overlay' onClick={()=> setFabOpen(false)} />}

      <div className={`fab-container ${fabOpen ? 'open' : ''}`}>
        <div className='fab-menu'>
          <button
            type='button'
            className='fab-item'
            onClick={()=>{ setFabOpen(false); onImport() }}
            disabled={busy}
          >
            Import(docs)
          </button>
          <button
            type='button'
            className='fab-item'
            onClick={openCsvModal}
            disabled={csvBusy}
          >
            Import(csv)
          </button>
          <button
            type='button'
            className='fab-item'
            onClick={()=>{ setFabOpen(false); setNewWordOpen(true) }}
          >
            Add Card
          </button>
        </div>
        {importSuccess && (
          <div className='fab-message' role='status' aria-live='polite'>
            {importSuccess}
          </div>
        )}
        <button
          type='button'
          className='fab-toggle'
          aria-label='Actions menu'
          aria-expanded={fabOpen}
          onClick={()=> setFabOpen(o=>!o)}
        >
          <span aria-hidden='true'>+</span>
        </button>
      </div>

      {csvModalOpen && (
        <Modal title='Import CSV' onClose={closeCsvModal}>
          <div className={csvLayoutClass}>
            {!csvHasPreview && (
              <p className='csv-import-hint'>
                phrase, meaning, tips, source の列を持つCSVファイルを選択してください。
              </p>
            )}
            {csvHasPreview && (
              <div className='csv-import-summary'>
                <div className='csv-import-meta'>
                  選択中: {csvFileName || '未保存'} ・ {csvRows.length}件
                </div>
                <button
                  type='button'
                  className='csv-reupload-button'
                  onClick={handleCsvReupload}
                  disabled={csvBusy || csvParsing}
                >
                  別のCSVを選び直す
                </button>
              </div>
            )}
            <input
              ref={csvInputRef}
              type='file'
              accept='.csv,text/csv'
              className={`csv-import-input${csvHasPreview ? ' csv-import-input--hidden' : ''}`}
              onChange={handleCsvFileChange}
              disabled={csvBusy || csvParsing}
            />
            {csvParsing && <div className='csv-import-meta'>解析中...</div>}
            {csvError && <div className='form-error'>{csvError}</div>}
            <div className='csv-preview-panel'>
              <div className='csv-preview'>
                {csvPreviewRows.length === 0 ? (
                  <div className='csv-preview__empty'>
                    CSVファイルをアップロードするとプレビューが表示されます。
                  </div>
                ) : (
                  <>
                    {csvPreviewRows.map((row, index) => (
                      <div key={`${row.phrase}-${index}`} className='csv-preview__row'>
                        <div className='csv-preview__phrase'>{row.phrase}</div>
                        {row.meaning && <div className='csv-preview__meaning'>{row.meaning}</div>}
                        {row.example && (
                          <div className='csv-preview__tips'>
                            <TipsIconSmall />
                            <span>{row.example}</span>
                          </div>
                        )}
                        {row.source && (
                          <div className='csv-preview__source'>
                            <SourceIconSmall />
                            <span>{row.source}</span>
                          </div>
                        )}
                      </div>
                    ))}
                    {csvRemaining > 0 && (
                      <div className='csv-preview__more'>他{csvRemaining}件...</div>
                    )}
                  </>
                )}
              </div>
            </div>
            <div className='modal-actions csv-import-actions'>
              <button
                type='button'
                className='btn btn-primary'
                onClick={onImportCsv}
                disabled={csvBusy || !csvRows.length || csvParsing}
              >
                {csvActionLabel}
              </button>
              <button
                type='button'
                className='btn'
                onClick={closeCsvModal}
                disabled={csvBusy}
              >
                キャンセル
              </button>
            </div>
          </div>
        </Modal>
      )}

      {newWordOpen && (
        <Modal title='Add New Card' onClose={closeNewWord}>
          <form
            className='col'
            style={{ gap:12 }}
            onSubmit={e=>{ e.preventDefault(); onCreateWord() }}
          >
            <label className='label'>Phrase (required)</label>
            <input
              ref={phraseInputRef}
              className='input'
              value={newWord.phrase}
              onChange={e=> setNewWord(v=>({ ...v, phrase: e.target.value }))}
              placeholder='phrase'
              disabled={newWordBusy}
            />
            {duplicateError && <div className='form-error'>{duplicateError}</div>}
            <label className='label'>Meaning</label>
            <input
              className='input'
              value={newWord.meaning}
              onChange={e=> setNewWord(v=>({ ...v, meaning: e.target.value }))}
              placeholder='meaning'
              disabled={newWordBusy}
            />
            <label className='label'>Tips</label>
            <input
              className='input'
              value={newWord.example}
              onChange={e=> setNewWord(v=>({ ...v, example: e.target.value }))}
              placeholder='tips'
              disabled={newWordBusy}
            />
            <label className='label'>Source</label>
            <input
              className='input'
              value={newWord.source}
              onChange={e=> setNewWord(v=>({ ...v, source: e.target.value }))}
              placeholder='source'
              disabled={newWordBusy}
            />
            <div className='modal-actions'>
              <button
                type='submit'
                className='btn btn-primary'
                disabled={newWordBusy}
              >
                {newWordBusy ? 'Adding...' : 'Add Card'}
              </button>
              <button
                type='button'
                className='btn'
                onClick={closeNewWord}
                disabled={newWordBusy}
              >
                Cancel
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}

function ImportProgress({ phase, progress, onCancel }: { phase: Phase; progress:{done:number; total:number}; onCancel: ()=>void }){
  const percent = useMemo(()=>{
    if (phase==='auth') return 10
    if (phase==='fetch') return 30
    if (phase==='parse') return 40
    if (phase==='insert'){
      if (!progress.total) return 45
      return Math.min(95, 45 + Math.floor((progress.done/progress.total)*50))
    }
    return 0
  },[phase, progress])
  const label =
    phase==='auth' ? 'Authorizing' :
    phase==='fetch' ? 'Fetching document' :
    phase==='parse' ? 'Parsing rows' :
    phase==='insert' ? `Importing ${progress.done}/${progress.total}` : ''
  return (
    <div className='import-progress'>
      <div className='card' style={{ width:'90%', maxWidth:480 }}>
        <div className='title'>Import</div>
        <div className='muted' style={{ marginBottom:8 }}>{label}</div>
        <div style={{ height:12, background:'#0b1220', border:'1px solid #334155', borderRadius:8, overflow:'hidden' }}>
          <div style={{ height:'100%', width:`${percent}%`, background:'#22c55e', transition:'width .2s ease' }} />
        </div>
        <div className='row' style={{ marginTop:12, justifyContent:'flex-end' }}>
          <button className='btn' onClick={onCancel} disabled={phase==='insert'}>{phase==='insert' ? 'Cannot cancel' : 'Cancel'}</button>
        </div>
      </div>
    </div>
  )
}

function DictionaryIcon(){
  return (
    <svg width='22' height='22' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.8' strokeLinecap='round' strokeLinejoin='round' aria-hidden='true'>
      <path d='M12 6.3v13.4' />
      <path d='M12 6.3C10.8 5.5 9.4 5 8 5H5.5A2.5 2.5 0 0 0 3 7.5V19a.5.5 0 0 0 .5.5H8c1.6 0 3 .5 4 1.3' />
      <path d='M12 6.3C13.2 5.5 14.6 5 16 5h2.5A2.5 2.5 0 0 1 21 7.5V19a.5.5 0 0 1-.5.5H16c-1.6 0-3 .5-4 1.3' />
    </svg>
  )
}

function Modal({ title, onClose, children }: { title: string; onClose: ()=>void; children: ReactNode }){
  return (
    <div className='modal-overlay' role='dialog' aria-modal='true' aria-label={title} onClick={onClose}>
      <div className='modal-surface' onClick={e=> e.stopPropagation()}>
        <div className='modal-header'>
          <div className='modal-title'>{title}</div>
          <button type='button' className='modal-close' onClick={onClose} aria-label='Close'>
            <span aria-hidden='true'>×</span>
          </button>
        </div>
        <div className='modal-body'>
          {children}
        </div>
      </div>
    </div>
  )
}

function formatDisplayDate(date: Date){
  try{
    return new Intl.DateTimeFormat('en-US', { year:'numeric', month:'short', day:'numeric' }).format(date)
  } catch {
    const y = date.getFullYear()
    const m = String(date.getMonth()+1).padStart(2,'0')
    const d = String(date.getDate()).padStart(2,'0')
    return `${y}-${m}-${d}`
  }
}

function calculateDayCount(firstIso: string | null){
  if (!firstIso) return 0
  const first = startOfDay(new Date(firstIso))
  if (Number.isNaN(first.getTime())) return 0
  const today = startOfDay(new Date())
  const diff = today.getTime() - first.getTime()
  if (diff < 0) return 0
  const dayMs = 24 * 60 * 60 * 1000
  return Math.floor(diff / dayMs) + 1
}

function startOfDay(date: Date){
  const d = new Date(date)
  d.setHours(0,0,0,0)
  return d
}

function TipsIconSmall() {
  return (
    <svg
      className='csv-preview__icon'
      width='16'
      height='16'
      viewBox='0 0 24 24'
      fill='none'
      stroke='currentColor'
      strokeWidth='2'
      strokeLinecap='round'
      strokeLinejoin='round'
      aria-hidden='true'
    >
      <path d='M9 18h6' />
      <path d='M10 22h4' />
      <path d='M12 2a7 7 0 0 0-4.73 11.95c.43.4.73.93.81 1.52l.19 1.53h3.48' />
      <path d='M12 2a7 7 0 0 1 4.73 11.95c-.43.4-.73.93-.81 1.52l-.19 1.53H12' />
    </svg>
  )
}

function SourceIconSmall() {
  return (
    <svg
      className='csv-preview__icon'
      width='16'
      height='16'
      viewBox='0 0 24 24'
      fill='none'
      stroke='currentColor'
      strokeWidth='2'
      strokeLinecap='round'
      strokeLinejoin='round'
      aria-hidden='true'
    >
      <path d='M10 13a5 5 0 0 1 7 7l-3 3a5 5 0 0 1-7-7l1.5-1.5' />
      <path d='m14 11 5-5' />
      <path d='m19 10 1-1a3 3 0 0 0-4-4l-1 1' />
    </svg>
  )
}

function buildImportRowsFromCsv(table: string[][]): ImportRow[] {
  if (!table.length) throw new Error('CSV_NO_DATA')
  const headers = table[0].map(cell => cell.trim().toLowerCase())
  const phraseIdx = headers.indexOf('phrase')
  if (phraseIdx < 0) throw new Error('CSV_MISSING_PHRASE')
  const meaningIdx = headers.indexOf('meaning')
  const tipsIdx = headers.findIndex(h => h === 'tips' || h === 'tip' || h === 'example' || h === 'examples')
  const sourceIdx = headers.indexOf('source')
  const rows: ImportRow[] = []
  for (let i = 1; i < table.length; i += 1){
    const row = table[i]
    const phrase = csvSafeCell(row, phraseIdx)
    if (!phrase) continue
    const entry: ImportRow = { phrase }
    const meaning = csvSafeCell(row, meaningIdx)
    if (meaning) entry.meaning = meaning
    const tips = csvSafeCell(row, tipsIdx)
    if (tips) entry.example = tips
    const source = csvSafeCell(row, sourceIdx)
    if (source) entry.source = source
    rows.push(entry)
  }
  if (!rows.length) throw new Error('CSV_NO_ROWS')
  return rows
}

function csvSafeCell(row: string[], idx: number): string {
  if (idx < 0 || idx >= row.length) return ''
  return row[idx]?.trim() ?? ''
}

function describeCsvError(error: unknown): string {
  const code = error instanceof Error ? error.message : ''
  switch (code) {
    case 'CSV_NO_DATA':
      return 'CSVファイルにデータが含まれていません。'
    case 'CSV_MISSING_PHRASE':
      return 'phrase列が見つかりません。ヘッダーをご確認ください。'
    case 'CSV_NO_ROWS':
      return '有効な行が見つかりませんでした。phraseが空の行は無視されます。'
    default:
      return 'CSVの読み込みに失敗しました。形式をご確認ください。'
  }
}
