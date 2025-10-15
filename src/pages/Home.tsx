import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from '~/components/Toast'
import { addWord, getWordSummary, importRows, type WordSummary } from '~/db/sqlite'
import { ensureGoogleLoaded, fetchFirstTableRows } from '~/lib/google'

type Phase = 'idle' | 'auth' | 'fetch' | 'parse' | 'insert'

export default function Home(){
  const nav = useNavigate()
  const [docId, setDocId] = useState(localStorage.getItem('gdoc_id') || '')
  const [clientId, setClientId] = useState(localStorage.getItem('gclient_id') || '')
  const [busy, setBusy] = useState(false)
  const [phase, setPhase] = useState<Phase>('idle')
  const [progress, setProgress] = useState<{done:number; total:number}>({ done:0, total:0 })
  const [openSettings, setOpenSettings] = useState(false)
  const [cancelled, setCancelled] = useState(false)
  const [fabOpen, setFabOpen] = useState(false)
  const [newWordOpen, setNewWordOpen] = useState(false)
  const [newWordBusy, setNewWordBusy] = useState(false)
  const [newWord, setNewWord] = useState({ phrase:'', meaning:'', example:'', source:'' })
  const [summary, setSummary] = useState<WordSummary>({ total:0, learning:0, learned:0, firstCreatedAt: null })
  const phraseInputRef = useRef<HTMLInputElement|null>(null)

  useEffect(()=>{ localStorage.setItem('gdoc_id', docId) },[docId])
  useEffect(()=>{ localStorage.setItem('gclient_id', clientId) },[clientId])

  useEffect(()=>{
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape'){
        setFabOpen(false)
        setOpenSettings(false)
        if (!newWordBusy){
          setNewWordOpen(false)
          resetNewWord()
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  },[newWordBusy])

  useEffect(()=>{
    if (!fabOpen) return
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null
      if (!target?.closest('.fab-container')) setFabOpen(false)
    }
    window.addEventListener('pointerdown', handlePointerDown)
    return () => window.removeEventListener('pointerdown', handlePointerDown)
  },[fabOpen])

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

  const dayCount = useMemo(()=> calculateDayCount(summary.firstCreatedAt), [summary.firstCreatedAt])
  const dayCountFormatted = dayCount > 0 ? dayCount.toLocaleString('en-US') : ''
  const dayLine = dayCount > 0 ? `Day ${dayCountFormatted} since first sync` : 'Waiting for your first sync'
  const learningCountFormatted = useMemo(()=> summary.learning.toLocaleString('en-US'),[summary.learning])
  const learnedCountFormatted = useMemo(()=> summary.learned.toLocaleString('en-US'),[summary.learned])
  const todayLabel = formatDisplayDate(new Date())

  function resetNewWord(){
    setNewWord({ phrase:'', meaning:'', example:'', source:'' })
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
      if (!clientId) { alert('Google OAuth Client ID を設定してください'); return }
      if (!docId) { alert('Google Document ID を入力してください'); return }
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
      toast(`追加 ${stats.added} / スキップ ${stats.skipped} / 失敗 ${stats.failed}`)
      await refreshStats()
    } catch(e:any){
      const msg = String(e?.message || e)
      if (msg === 'NO_TABLE') alert('ドキュメント内に有効な表が見つかりません')
      else if (msg.includes('redirect_uri_mismatch')) alert('OAuth 設定の Redirect/Origins を確認してください (redirect_uri_mismatch)')
      else if (msg === 'AUTH_CANCELLED' || msg === 'USER_CANCELLED'){
        // ユーザー操作でキャンセルされた場合は静かに終了
      }
      else if (msg === 'AUTH_TIMEOUT') alert('認証がタイムアウトしました。しばらくしてから再試行してください。')
      else {
        const detail = formatGapiError(e)
        alert(`エラーが発生しました: ${detail}`)
        console.error('Import failed', e)
      }
    } finally{
      setBusy(false)
      setPhase('idle')
      setProgress({ done:0, total:0 })
    }
  }

  async function onCreateWord(){
    if (newWordBusy) return
    const phrase = newWord.phrase.trim()
    if (!phrase){
      alert('単語（Phrase）を入力してください')
      return
    }
    setNewWordBusy(true)
    try{
      await addWord({
        phrase,
        meaning: newWord.meaning,
        example: newWord.example,
        source: newWord.source
      })
      toast('単語を追加しました')
      await refreshStats()
      setNewWordOpen(false)
      resetNewWord()
    } catch(e:any){
      const msg = String(e?.message || e)
      if (msg === 'VALIDATION_EMPTY_PHRASE') alert('単語（Phrase）は必須です')
      else if (msg === 'DUPLICATE_PHRASE') alert('同じ単語が既に登録されています')
      else {
        alert('追加に失敗しました')
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
            className='icon-button'
            onClick={()=> setOpenSettings(o=>!o)}
            aria-expanded={openSettings}
            aria-controls='settings-panel'
            aria-label='設定を開く'
          >
            <GearIcon />
          </button>
          <button
            type='button'
            className='icon-button'
            onClick={()=> nav('/words')}
            aria-label='単語一覧へ移動'
          >
            <ListIcon />
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
              className='hero-orb hero-orb--main'
              onClick={()=> nav('/review')}
              aria-label="Start today's review"
            >
              <span className='hero-label'>Start Review</span>
            </button>
          </div>
        </section>
      </main>

      <div className={`fab-container ${fabOpen ? 'open' : ''}`}>
        <div className='fab-menu'>
          <button
            type='button'
            className='fab-item'
            onClick={()=>{ setFabOpen(false); onImport() }}
            disabled={busy}
          >
            インポート
          </button>
          <button
            type='button'
            className='fab-item'
            onClick={()=>{ setFabOpen(false); setNewWordOpen(true) }}
          >
            新規カードを追加
          </button>
        </div>
        <button
          type='button'
          className='fab-toggle'
          aria-label='操作メニュー'
          aria-expanded={fabOpen}
          onClick={()=> setFabOpen(o=>!o)}
        >
          <span aria-hidden='true'>+</span>
        </button>
      </div>

      {openSettings && (
        <Modal title='Google 連携' onClose={()=> setOpenSettings(false)}>
          <div className='col' style={{ gap:12 }} id='settings-panel'>
            <label className='label'>Google OAuth Client ID</label>
            <input
              className='input'
              value={clientId}
              onChange={e=>setClientId(e.target.value)}
              placeholder='xxxxxxxx.apps.googleusercontent.com'
            />
            <label className='label'>Google Document ID</label>
            <input
              className='input'
              value={docId}
              onChange={e=>setDocId(e.target.value)}
              placeholder='1Abc...（Docs の URL の ID）'
            />
            <div className='modal-actions'>
              <button type='button' className='btn' onClick={()=> setOpenSettings(false)}>閉じる</button>
            </div>
          </div>
        </Modal>
      )}

      {newWordOpen && (
        <Modal title='新しい単語を追加' onClose={closeNewWord}>
          <form
            className='col'
            style={{ gap:12 }}
            onSubmit={e=>{ e.preventDefault(); onCreateWord() }}
          >
            <label className='label'>単語（必須）</label>
            <input
              ref={phraseInputRef}
              className='input'
              value={newWord.phrase}
              onChange={e=> setNewWord(v=>({ ...v, phrase: e.target.value }))}
              placeholder='phrase'
              disabled={newWordBusy}
            />
            <label className='label'>意味</label>
            <input
              className='input'
              value={newWord.meaning}
              onChange={e=> setNewWord(v=>({ ...v, meaning: e.target.value }))}
              placeholder='meaning'
              disabled={newWordBusy}
            />
            <label className='label'>例文</label>
            <input
              className='input'
              value={newWord.example}
              onChange={e=> setNewWord(v=>({ ...v, example: e.target.value }))}
              placeholder='example'
              disabled={newWordBusy}
            />
            <label className='label'>ソース</label>
            <input
              className='input'
              value={newWord.source}
              onChange={e=> setNewWord(v=>({ ...v, source: e.target.value }))}
              placeholder='source'
              disabled={newWordBusy}
            />
            <div className='modal-actions'>
              <button
                type='button'
                className='btn'
                onClick={closeNewWord}
                disabled={newWordBusy}
              >
                キャンセル
              </button>
              <button
                type='submit'
                className='btn btn-primary'
                disabled={newWordBusy}
              >
                {newWordBusy ? '追加中...' : '追加する'}
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
    phase==='auth' ? '認証中' :
    phase==='fetch' ? 'ドキュメントを取得中' :
    phase==='parse' ? '解析中' :
    phase==='insert' ? `登録中 ${progress.done}/${progress.total}` : ''
  return (
    <div className='import-progress'>
      <div className='card' style={{ width:'90%', maxWidth:480 }}>
        <div className='title'>インポート</div>
        <div className='muted' style={{ marginBottom:8 }}>{label}</div>
        <div style={{ height:12, background:'#0b1220', border:'1px solid #334155', borderRadius:8, overflow:'hidden' }}>
          <div style={{ height:'100%', width:`${percent}%`, background:'#22c55e', transition:'width .2s ease' }} />
        </div>
        <div className='row' style={{ marginTop:12, justifyContent:'flex-end' }}>
          <button className='btn' onClick={onCancel} disabled={phase==='insert'}>{phase==='insert' ? 'キャンセル不可' : 'キャンセル'}</button>
        </div>
      </div>
    </div>
  )
}

function GearIcon(){
  return (
    <svg width='22' height='22' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.8' strokeLinecap='round' strokeLinejoin='round' aria-hidden='true'>
      <path d='M10.325 4.317a1 1 0 0 1 1.35-.436l.12.062a2 2 0 0 0 1.87 0l.12-.062a1 1 0 0 1 1.35.435l.06.104a2 2 0 0 0 1.74 1.007h.138a1 1 0 0 1 .998.915l.01.125a2 2 0 0 0 1.003 1.59l.102.055a1 1 0 0 1 .436 1.35l-.061.12a2 2 0 0 0 0 1.87l.062.12a1 1 0 0 1-.435 1.35l-.104.06a2 2 0 0 0-1.007 1.74v.138a1 1 0 0 1-.915.998l-.125.01a2 2 0 0 0-1.59 1.003l-.055.102a1 1 0 0 1-1.35.436l-.12-.061a2 2 0 0 0-1.87 0l-.12.062a1 1 0 0 1-1.35-.435l-.06-.104a2 2 0 0 0-1.74-1.007h-.138a1 1 0 0 1-.998-.915l-.01-.125a2 2 0 0 0-1.003-1.59l-.102-.055a1 1 0 0 1-.436-1.35l.061-.12a2 2 0 0 0 0-1.87l-.062-.12a1 1 0 0 1 .435-1.35l.104-.06a2 2 0 0 0 1.007-1.74v-.138a1 1 0 0 1 .915-.998l.125-.01a2 2 0 0 0 1.59-1.003z' />
      <circle cx='12' cy='12' r='3' />
    </svg>
  )
}

function ListIcon(){
  return (
    <svg width='22' height='22' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.8' strokeLinecap='round' strokeLinejoin='round' aria-hidden='true'>
      <line x1='9' y1='6' x2='21' y2='6' />
      <line x1='9' y1='12' x2='21' y2='12' />
      <line x1='9' y1='18' x2='21' y2='18' />
      <circle cx='4' cy='6' r='1.5' />
      <circle cx='4' cy='12' r='1.5' />
      <circle cx='4' cy='18' r='1.5' />
    </svg>
  )
}

function Modal({ title, onClose, children }: { title: string; onClose: ()=>void; children: ReactNode }){
  return (
    <div className='modal-overlay' role='dialog' aria-modal='true' aria-label={title} onClick={onClose}>
      <div className='modal-card' onClick={e=> e.stopPropagation()}>
        <div className='modal-header'>
          <div className='modal-title'>{title}</div>
          <button type='button' className='modal-close' onClick={onClose} aria-label='閉じる'>
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
