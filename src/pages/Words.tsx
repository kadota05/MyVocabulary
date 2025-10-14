import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getAllWords, updateWord, WordWithSrs } from '~\/db/sqlite'

export default function Words(){
  const nav = useNavigate()
  const [items, setItems] = useState<WordWithSrs[]>([])
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(true)
  const [editId, setEditId] = useState<string|undefined>()
  const [edit, setEdit] = useState<{phrase:string; meaning:string; example:string; source:string}>({phrase:'', meaning:'', example:'', source:''})

  useEffect(()=>{ (async()=>{
    setLoading(true)
    const rows = await getAllWords()
    setItems(rows)
    setLoading(false)
  })() },[])

  const filtered = useMemo(()=>{
    const s = q.trim().toLowerCase()
    if (!s) return items
    return items.filter(r=>
      r.phrase.toLowerCase().includes(s) ||
      r.meaning.toLowerCase().includes(s) ||
      (r.example||'').toLowerCase().includes(s) ||
      (r.source||'').toLowerCase().includes(s)
    )
  },[items, q])

  function startEdit(w: WordWithSrs){
    setEditId(w.id)
    setEdit({ phrase: w.phrase, meaning: w.meaning || '', example: w.example || '', source: w.source || '' })
  }
  async function saveEdit(){
    if (!editId) return
    try{
      const updated = await updateWord(editId, { phrase: edit.phrase, meaning: edit.meaning, example: edit.example || null, source: edit.source || null })
      setItems(list => list.map(i => i.id === editId ? { ...i, phrase: updated.phrase, meaning: updated.meaning, example: updated.example, source: updated.source, updatedAt: updated.updatedAt } : i))
      setEditId(undefined)
    } catch(e:any){
      const msg = String(e?.message||e)
      if (msg === 'DUPLICATE_PHRASE') alert('同一のPhrase（trim/小文字化比較）で既に登録があります')
      else if (msg === 'VALIDATION_EMPTY_PHRASE') alert('Phraseは必須です')
      else alert('更新に失敗しました')
      console.error(e)
    }
  }

  return (
    <div className='col' style={{ gap:12 }}>
      <div className='row' style={{ alignItems:'center', justifyContent:'space-between' }}>
        <div className='title'>単語一覧</div>
        <button className='pill' onClick={()=> nav('/')}>戻る</button>
      </div>
      <input className='input' placeholder='検索（phrase / meaning / example / source）' value={q} onChange={e=>setQ(e.target.value)} />
      <div className='muted'>合計 {items.length} 件（表示 {filtered.length} 件）</div>
      {loading ? (
        <div className='card center' style={{ minHeight:120 }}>読み込み中...</div>
      ) : filtered.length === 0 ? (
        <div className='card center' style={{ minHeight:120 }}>該当なし</div>
      ) : (
        <div className='col' style={{ gap:8 }}>
          {filtered.map(w=> (
            <div key={w.id} className='card'>
              {editId === w.id ? (
                <div className='col' style={{ gap:8 }}>
                  <div className='title'>編集</div>
                  <label className='label'>Phrase（必須）</label>
                  <input className='input' value={edit.phrase} onChange={e=> setEdit(v=>({...v, phrase: e.target.value}))} />
                  <label className='label'>Meaning（空でも可）</label>
                  <input className='input' value={edit.meaning} onChange={e=> setEdit(v=>({...v, meaning: e.target.value}))} />
                  <label className='label'>Example</label>
                  <input className='input' value={edit.example} onChange={e=> setEdit(v=>({...v, example: e.target.value}))} />
                  <label className='label'>Source</label>
                  <input className='input' value={edit.source} onChange={e=> setEdit(v=>({...v, source: e.target.value}))} />
                  <div className='row'>
                    <button className='btn btn-primary grow' onClick={saveEdit}>保存</button>
                    <button className='btn grow' onClick={()=> setEditId(undefined)}>キャンセル</button>
                  </div>
                </div>
              ) : (
                <>
                  <div className='row' style={{ justifyContent:'space-between', alignItems:'baseline' }}>
                    <div style={{ fontWeight:700 }}>{w.phrase}</div>
                    <div className='muted' style={{ fontSize:12 }}>次回: {w.nextDueDate || '-'}</div>
                  </div>
                  <div style={{ marginTop:4 }}>{w.meaning}</div>
                  {w.example && <div className='muted' style={{ marginTop:4 }}>{w.example}</div>}
                  {w.source && <div className='muted' style={{ marginTop:4 }}>Source: {w.source}</div>}
                  <div className='row' style={{ marginTop:8, justifyContent:'space-between', alignItems:'center' }}>
                    <div className='muted' style={{ fontSize:12 }}>reps {w.reps} / lapses {w.lapses} / stability {Number(w.stability||0).toFixed(2)}</div>
                    <button className='pill' onClick={()=> startEdit(w)}>編集</button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
      <div className='space' />
    </div>
  )
}
