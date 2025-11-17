import { useEffect, useMemo, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { deleteWord, getAllWords, updateWord, type WordWithSrs } from '~/db/sqlite'

const EMPTY_EDIT = { phrase:'', meaning:'', example:'', source:'' }

export default function Words(){
  const nav = useNavigate()
  const [items, setItems] = useState<WordWithSrs[]>([])
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(true)
  const [editId, setEditId] = useState<string | undefined>()
  const [edit, setEdit] = useState<{ phrase: string; meaning: string; example: string; source: string }>(EMPTY_EDIT)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [editBusy, setEditBusy] = useState(false)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(()=> new Set())

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
    setEditBusy(false)
  }

  const closeEdit = ()=>{
    if (editBusy) return
    setEditId(undefined)
    setEdit(EMPTY_EDIT)
    setEditBusy(false)
  }

  async function saveEdit(){
    if (!editId || editBusy) return
    setEditBusy(true)
    try{
      const updated = await updateWord(editId, {
        phrase: edit.phrase,
        meaning: edit.meaning,
        example: edit.example,
        source: edit.source
      })
      setItems(list => list.map(i => i.id === editId ? { ...i, phrase: updated.phrase, meaning: updated.meaning, example: updated.example, source: updated.source, updatedAt: updated.updatedAt } : i))
      setEditId(undefined)
      setEdit(EMPTY_EDIT)
    } catch(e:any){
      const msg = String(e?.message || e)
      if (msg === 'DUPLICATE_PHRASE') alert('Phrase already exists (compare trimmed/lowercase).')
      else if (msg === 'VALIDATION_EMPTY_PHRASE') alert('Phrase is required.')
      else alert('Failed to update entry.')
      console.error(e)
    } finally {
      setEditBusy(false)
    }
  }

  async function requestDelete(w: WordWithSrs){
    const confirmed = window.confirm(`Delete "${w.phrase}"?\nThis action cannot be undone.`)
    if (!confirmed) return
    setDeletingId(w.id)
    try{
      await deleteWord(w.id)
      setItems(list => list.filter(i => i.id !== w.id))
      if (editId === w.id){
        setEditId(undefined)
        setEdit(EMPTY_EDIT)
        setEditBusy(false)
      }
    } catch (error){
      alert('Failed to delete entry.')
      console.error(error)
    } finally {
      setDeletingId(null)
    }
  }

  const toggleCard = (id: string)=>{
    setExpandedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleCardClick = (event: MouseEvent<HTMLDivElement>, id: string)=>{
    const target = event.target
    if (target instanceof Element && (target.closest('button') || target.closest('a'))) return
    toggleCard(id)
  }

  const handleCardKeyDown = (event: KeyboardEvent<HTMLDivElement>, id: string)=>{
    if (event.target !== event.currentTarget) return
    if (event.key === 'Enter' || event.key === ' '){
      event.preventDefault()
      toggleCard(id)
    }
  }

  return (
    <div className='home-screen words-screen'>
      <header className='home-header leap-header'>
        <div className='home-header__brand'>Word Library</div>
        <div className='home-header__actions'>
          <button className='icon-button' onClick={()=> nav('/')} aria-label='Back to home'>
            <CloseIcon />
          </button>
        </div>
      </header>

      <main className='words-main'>
        <div className='words-toolbar'>
          <div className='words-header__search'>
            <input
              className='input'
              placeholder='Search (phrase / meaning / tips / source)'
              value={q}
              onChange={e=> setQ(e.target.value)}
            />
            <div className='words-header__metrics'>
              Total {items.length} • Showing {filtered.length}
            </div>
          </div>
        </div>
        {loading ? (
          <div className='card center' style={{ minHeight:120 }}>Loading...</div>
        ) : filtered.length === 0 ? (
          <div className='card center' style={{ minHeight:120 }}>No results found</div>
        ) : (
          <div className='words-list'>
            {filtered.map(w=> {
              const sourceLink = w.source ? getSourceUrl(w.source) : null
              const isEditing = editId === w.id
              const isExpanded = expandedIds.has(w.id)
              return (
                <div key={w.id} className='card'>
                  <div
                    className={`word-card__body ${isExpanded ? 'word-card__body--expanded' : 'word-card__body--collapsed'}`}
                    tabIndex={0}
                    aria-label={`Word details for ${w.phrase}`}
                    aria-expanded={isExpanded}
                    onClick={event=> handleCardClick(event, w.id)}
                    onKeyDown={event=> handleCardKeyDown(event, w.id)}
                  >
                    <div className='row word-card__header'>
                      <div className='word-card__phrase'>{w.phrase}</div>
                      <div className='word-card__actions'>
                        <button className='word-card__action' onClick={event=> { event.stopPropagation(); startEdit(w) }} disabled={editBusy && isEditing}>Edit</button>
                        <button
                          className='word-card__action word-card__action--danger'
                          onClick={event=> { event.stopPropagation(); void requestDelete(w) }}
                          disabled={deletingId === w.id}
                        >
                          {deletingId === w.id ? 'Deleting...' : 'Delete'}
                        </button>
                      </div>
                    </div>
                    <div className='word-card__meaning-row'>
                      <div className='word-card__meaning'>{w.meaning || '-'}</div>
                      <ChevronIcon expanded={isExpanded} />
                    </div>
                    {isExpanded && (
                      <div className='word-card__details'>
                        {w.example && (
                          <div className='word-card__tips'>
                            <TipsIcon />
                            <span>{w.example}</span>
                          </div>
                        )}
                        {w.source && (
                          <div className='word-card__source'>
                            <SourceIcon />
                            {sourceLink ? (
                              <a
                                className='word-card__source-link'
                                href={sourceLink}
                                target='_blank'
                                rel='noopener noreferrer'
                                onClick={event=> event.stopPropagation()}
                              >
                                {w.source}
                              </a>
                            ) : (
                              w.source
                            )}
                          </div>
                        )}
                        <div className='word-card__footer'>
                          <div className='word-card__stats muted'>reps {w.reps} / lapses {w.lapses} / stability {Number(w.stability || 0).toFixed(2)}</div>
                          <div className='word-card__next muted'>Next review: {w.nextDueDate || '-'}</div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
        <div className='space' />
      </main>
      {editId && (
        <Modal title='Edit Card' onClose={closeEdit}>
          <form
            className='col'
            style={{ gap:12 }}
            onSubmit={e=>{ e.preventDefault(); void saveEdit() }}
          >
            <label className='label' htmlFor='edit-phrase'>Phrase (required)</label>
            <input
              id='edit-phrase'
              className='input'
              value={edit.phrase}
              onChange={e=> setEdit(v=> ({ ...v, phrase: e.target.value }))}
              disabled={editBusy}
              autoFocus
              required
            />
            <label className='label' htmlFor='edit-meaning'>Meaning</label>
            <input
              id='edit-meaning'
              className='input'
              value={edit.meaning}
              onChange={e=> setEdit(v=> ({ ...v, meaning: e.target.value }))}
              disabled={editBusy}
            />
            <label className='label' htmlFor='edit-example'>Tips</label>
            <input
              id='edit-example'
              className='input'
              value={edit.example}
              onChange={e=> setEdit(v=> ({ ...v, example: e.target.value }))}
              disabled={editBusy}
            />
            <label className='label' htmlFor='edit-source'>Source</label>
            <input
              id='edit-source'
              className='input'
              value={edit.source}
              onChange={e=> setEdit(v=> ({ ...v, source: e.target.value }))}
              disabled={editBusy}
            />
            <div className='modal-actions'>
              <button className='btn btn-primary' type='submit' disabled={editBusy}>
                {editBusy ? 'Saving...' : 'Save'}
              </button>
              <button className='btn' type='button' onClick={closeEdit} disabled={editBusy}>
                Cancel
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}

function CloseIcon(){
  return (
    <svg width='22' height='22' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.8' strokeLinecap='round' strokeLinejoin='round' aria-hidden='true'>
      <line x1='18' y1='6' x2='6' y2='18' />
      <line x1='6' y1='6' x2='18' y2='18' />
    </svg>
  )
}

function TipsIcon() {
  return (
    <svg
      className='word-card__icon'
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

function SourceIcon() {
  return (
    <svg
      className='word-card__icon'
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

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      className={`word-card__chevron${expanded ? ' word-card__chevron--expanded' : ''}`}
      width='18'
      height='18'
      viewBox='0 0 24 24'
      fill='none'
      stroke='currentColor'
      strokeWidth='2'
      strokeLinecap='round'
      strokeLinejoin='round'
      aria-hidden='true'
      focusable='false'
    >
      <polyline points='6 9 12 15 18 9' />
    </svg>
  )
}

function Modal({ title, onClose, children }: { title: string; onClose: ()=>void; children: ReactNode }){
  const handleOverlay = () => { onClose() }
  const stop: (event: MouseEvent<HTMLDivElement>) => void = event => { event.stopPropagation() }
  return (
    <div className='modal-overlay' role='dialog' aria-modal='true' aria-label={title} onClick={handleOverlay}>
      <div className='modal-surface' onClick={stop}>
        <div className='modal-header'>
          <div className='modal-title'>{title}</div>
          <button type='button' className='modal-close' onClick={onClose} aria-label='Close'>
            <span aria-hidden='true'>✕</span>
          </button>
        </div>
        <div className='modal-body'>
          {children}
        </div>
      </div>
    </div>
  )
}

function getSourceUrl(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  try{
    const url = new URL(trimmed)
    if (url.protocol === 'http:' || url.protocol === 'https:') return url.toString()
  } catch {
    return null
  }
  return null
}
