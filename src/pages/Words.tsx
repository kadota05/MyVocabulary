import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getAllWords, updateWord, type WordWithSrs } from '~/db/sqlite'

export default function Words(){
  const nav = useNavigate()
  const [items, setItems] = useState<WordWithSrs[]>([])
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(true)
  const [editId, setEditId] = useState<string | undefined>()
  const [edit, setEdit] = useState<{ phrase: string; meaning: string; example: string; source: string }>({ phrase:'', meaning:'', example:'', source:'' })

  useEffect(()=> {
    (async()=>{
      setLoading(true)
      const rows = await getAllWords()
      setItems(rows)
      setLoading(false)
    })()
  },[])

  const filtered = useMemo(()=>{
    const s = q.trim().toLowerCase()
    if (!s) return items
    return items.filter(r=>
      r.phrase.toLowerCase().includes(s) ||
      r.meaning.toLowerCase().includes(s) ||
      (r.example || '').toLowerCase().includes(s) ||
      (r.source || '').toLowerCase().includes(s)
    )
  },[items, q])

  function startEdit(w: WordWithSrs){
    setEditId(w.id)
    setEdit({ phrase: w.phrase, meaning: w.meaning || '', example: w.example || '', source: w.source || '' })
  }

  async function saveEdit(){
    if (!editId) return
    try{
      const updated = await updateWord(editId, {
        phrase: edit.phrase,
        meaning: edit.meaning,
        example: edit.example || null,
        source: edit.source || null
      })
      setItems(list => list.map(i => i.id === editId ? { ...i, phrase: updated.phrase, meaning: updated.meaning, example: updated.example, source: updated.source, updatedAt: updated.updatedAt } : i))
      setEditId(undefined)
    } catch(e:any){
      const msg = String(e?.message || e)
      if (msg === 'DUPLICATE_PHRASE') alert('Phrase already exists (compare trimmed/lowercase).')
      else if (msg === 'VALIDATION_EMPTY_PHRASE') alert('Phrase is required.')
      else alert('Failed to update entry.')
      console.error(e)
    }
  }

  return (
    <div className='home-screen words-screen'>
      <header className='home-header words-header-bar'>
        <div className='home-header__brand'>Word Library</div>
        <div className='home-header__actions'>
          <button className='icon-button' onClick={()=> nav('/')} aria-label='Back to home'>
            <HomeIcon />
          </button>
        </div>
      </header>

      <main className='words-main'>
        <div className='words-toolbar'>
          <input
            className='input'
            placeholder='Search (phrase / meaning / example / source)'
            value={q}
            onChange={e=> setQ(e.target.value)}
          />
          <div className='words-header__metrics'>
            Total {items.length} | Showing {filtered.length}
          </div>
        </div>
        {loading ? (
          <div className='card center' style={{ minHeight:120 }}>Loading...</div>
        ) : filtered.length === 0 ? (
          <div className='card center' style={{ minHeight:120 }}>No results found</div>
        ) : (
          <div className='words-list'>
            {filtered.map(w=> (
              <div key={w.id} className='card'>
                {editId === w.id ? (
                  <div className='col' style={{ gap:8 }}>
                    <div className='title'>Edit</div>
                    <label className='label'>Phrase (required)</label>
                    <input className='input' value={edit.phrase} onChange={e=> setEdit(v=> ({ ...v, phrase: e.target.value }))} />
                    <label className='label'>Meaning (optional)</label>
                    <input className='input' value={edit.meaning} onChange={e=> setEdit(v=> ({ ...v, meaning: e.target.value }))} />
                    <label className='label'>Example</label>
                    <input className='input' value={edit.example} onChange={e=> setEdit(v=> ({ ...v, example: e.target.value }))} />
                    <label className='label'>Source</label>
                    <input className='input' value={edit.source} onChange={e=> setEdit(v=> ({ ...v, source: e.target.value }))} />
                    <div className='row'>
                      <button className='btn btn-primary grow' onClick={saveEdit}>Save</button>
                      <button className='btn grow' onClick={()=> setEditId(undefined)}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className='row' style={{ justifyContent:'space-between', alignItems:'baseline' }}>
                      <div style={{ fontWeight:700 }}>{w.phrase}</div>
                      <div className='muted' style={{ fontSize:12 }}>Next review: {w.nextDueDate || '-'}</div>
                    </div>
                    <div style={{ marginTop:4 }}>{w.meaning}</div>
                    {w.example && <div className='muted' style={{ marginTop:4 }}>{w.example}</div>}
                    {w.source && <div className='muted' style={{ marginTop:4 }}>Source: {w.source}</div>}
                    <div className='row' style={{ marginTop:8, justifyContent:'space-between', alignItems:'center' }}>
                      <div className='muted' style={{ fontSize:12 }}>reps {w.reps} / lapses {w.lapses} / stability {Number(w.stability || 0).toFixed(2)}</div>
                      <button className='pill' onClick={()=> startEdit(w)}>Edit</button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
        <div className='space' />
      </main>
    </div>
  )
}

function HomeIcon(){
  return (
    <svg width='22' height='22' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.8' strokeLinecap='round' strokeLinejoin='round' aria-hidden='true'>
      <path d='M3 11.5 12 4l9 7.5v8a.5.5 0 0 1-.5.5H15a.5.5 0 0 1-.5-.5v-5h-5v5a.5.5 0 0 1-.5.5H3.5a.5.5 0 0 1-.5-.5v-8z' />
    </svg>
  )
}
