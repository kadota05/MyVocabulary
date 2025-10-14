import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from '~\/components/Toast'
import { importRows } from '~\/db/sqlite'
import { ensureGoogleLoaded, fetchFirstTableRows } from '~\/lib/google'

export default function Home(){
  const nav = useNavigate()
  const [docId, setDocId] = useState(localStorage.getItem('gdoc_id') || '')
  const [clientId, setClientId] = useState(localStorage.getItem('gclient_id') || '')
  const [busy, setBusy] = useState(false)
  const [phase, setPhase] = useState<'idle'|'auth'|'fetch'|'parse'|'insert'>('idle')
  const [progress, setProgress] = useState<{done:number,total:number}>({done:0,total:0})
  const [openSettings, setOpenSettings] = useState(false)
  const [cancelled, setCancelled] = useState(false)

  useEffect(()=>{ localStorage.setItem('gdoc_id', docId) },[docId])
  useEffect(()=>{ localStorage.setItem('gclient_id', clientId) },[clientId])

  function formatGapiError(e:any){
    try{
      const err = e?.result?.error || e?.error || e
      const code = err?.code || err?.status || ''
      const msg = err?.message || String(e)
      return `${code} ${msg}`.trim()
    } catch { return String(e) }
  }

  async function onImport(){
    try{
      if (!clientId) { alert('Google OAuth Client ID を設定してください'); return }
      if (!docId) { alert('Google Document ID を入力してください'); return }
      setCancelled(false)
      setBusy(true); setPhase('auth'); setProgress({done:0,total:0})
      await ensureGoogleLoaded(clientId)
      setPhase('fetch')
      if (cancelled) throw new Error('USER_CANCELLED')
      const rows = await fetchFirstTableRows(docId)
      setPhase('parse')
      const total = rows.length
      setProgress({done:0,total})
      setPhase('insert')
      const stats = await importRows(rows, (done,total)=> setProgress({done,total}))
      toast(`追加 ${stats.added} / スキップ ${stats.skipped} / 失敗 ${stats.failed}`)
    } catch(e:any){
      const msg = String(e?.message||e)
      if (msg === 'NO_TABLE') alert('ドキュメントに有効な表がありません')
      else if (msg.includes('redirect_uri_mismatch')) alert('OAuth設定のRedirect/Originsを確認してください (redirect_uri_mismatch)')
      else if (msg === 'AUTH_CANCELLED' || msg === 'USER_CANCELLED') {
        // サイレントに何もしない（元画面へ戻す）
      }
      else if (msg === 'AUTH_TIMEOUT') alert('認証がタイムアウトしました。もう一度お試しください。')
      else {
        const detail = formatGapiError(e)
        alert(`エラーが発生しました: ${detail}`)
        console.error('Import failed', e)
      }
    } finally{ setBusy(false); setPhase('idle'); setProgress({done:0,total:0}) }
  }

  return (
    <div className='col home-layout'>
      {busy && <ImportProgress phase={phase} progress={progress} onCancel={()=>{ if (phase!=='insert'){ setCancelled(true); setBusy(false); setPhase('idle') } }} />}
      {/* Top: Settings */}
      <div className='card col'>
        <button
          className='btn'
          onClick={()=> setOpenSettings(o=>!o)}
          style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}
          aria-expanded={openSettings}
          aria-controls='settings-panel'
        >
          <span style={{ fontWeight:700 }}>{openSettings ? '▼ 設定' : '▶ 設定'}</span>
        </button>
        {openSettings && (
          <div id='settings-panel' className='col' style={{ gap:8 }}>
            <label className='label'>Google OAuth Client ID</label>
            <input className='input' value={clientId} onChange={e=>setClientId(e.target.value)} placeholder="xxxxxxxx.apps.googleusercontent.com" />
            <label className='label'>Google Document ID</label>
            <input className='input' value={docId} onChange={e=>setDocId(e.target.value)} placeholder="1Abc...（DocsのURLのID）" />
          </div>
        )}
      </div>

      {/* Middle: Start button centered as big circle */}
      <div className='center' style={{ marginTop:8, marginBottom:8 }}>
        <div className='hygge-stack'>
          <button className='btn btn-circle btn-hygge' onClick={()=> nav('/review')} aria-label='今日の復習を開始'>
            今日の復習を開始
          </button>
        </div>
      </div>

      {/* Bottom: Words/Import and description */}
      <div className='col' style={{ gap:12 }}>
        <div className='row'>
          <button className='btn grow' onClick={()=> nav('/words')}>単語一覧</button>
          <button className='btn grow' onClick={onImport} disabled={busy}>{busy? '読み込み中...' : 'インポート'}</button>
        </div>
        <div className='muted'>
          インポートは Docs API の読み取りのみ。オフラインでも学習可（インポートのみネット必須）。
        </div>
      </div>
    </div>
  )
}

function ImportProgress({ phase, progress, onCancel }: { phase: 'idle'|'auth'|'fetch'|'parse'|'insert'; progress:{done:number,total:number}; onCancel: ()=>void }){
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
  const label = phase==='auth' ? '認証中' : phase==='fetch' ? 'ドキュメント取得中' : phase==='parse' ? '解析中' : phase==='insert' ? `取り込み中 ${progress.done}/${progress.total}` : ''
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:50 }}>
      <div className='card' style={{ width: '90%', maxWidth: 480 }}>
        <div className='title'>インポート</div>
        <div className='muted' style={{ marginBottom:8 }}>{label}</div>
        <div style={{ height:12, background:'#0b1220', border:'1px solid #334155', borderRadius:8, overflow:'hidden' }}>
          <div style={{ height:'100%', width: `${percent}%`, background:'#22c55e', transition:'width .2s ease' }} />
        </div>
        <div className='row' style={{ marginTop:12, justifyContent:'flex-end' }}>
          <button className='btn' onClick={onCancel} disabled={phase==='insert'}>{phase==='insert' ? 'キャンセル不可' : 'キャンセル'}</button>
        </div>
      </div>
    </div>
  )
}
