import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '~/state/store'

export default function Review(){
  const nav = useNavigate()
  const { current, remaining, again, flipped, startToday, flip, grade, loading } = useStore()
  const [initialized, setInitialized] = useState(false)

  useEffect(()=> {
    let cancelled = false
    setInitialized(prev => (prev ? false : prev))
    startToday().finally(()=> { if (!cancelled) setInitialized(true) })
    return () => { cancelled = true }
  },[startToday])

  const cardContent = useMemo(()=>{
    if (!current) return null
    return (
      <div className='card tap review-card' onClick={flip}>
        {!flipped ? (
          <div className='review-face main'>{current.phrase}</div>
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
                    onClick={e=> e.stopPropagation()}
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
  },[current, flipped, flip])

  const alertedRef = useRef(false)
  useEffect(()=> {
    if (!initialized) return
    if (!loading && !current && remaining.length === 0 && again.length === 0){
      if (alertedRef.current) return
      alertedRef.current = true
      setTimeout(()=> {
        alert("You're all caught up for today!")
        nav('/')
      }, 50)
    }
  },[initialized, loading, current, remaining.length, again.length, nav])

  return (
    <div className='home-screen review-screen'>
      <header className='home-header review-header'>
        <div className='home-header__brand'>Review Session</div>
        <div className='home-header__actions'>
          <button className='icon-button' onClick={()=> nav('/')} aria-label='End review session'>
            <PauseCircleIcon />
          </button>
        </div>
      </header>

      <main className='review-body'>
        <section className='review-stage'>
          {loading ? (
            <div className='card center review-card'>Loading...</div>
          ) : (
            cardContent
          )}
        </section>
      </main>

      <footer className='review-footer'>
        <div className='review-footer__stats'>
          <span>Remaining: {remaining.length}</span>
          <span>Retry later: {again.length}</span>
        </div>
        <div className='review-grade-grid'>
          <button className='btn btn-accent review-grade' onClick={()=> grade('EASY')}>Easy</button>
          <button className='btn btn-primary review-grade' onClick={()=> grade('NORMAL')}>Normal</button>
          <button className='btn btn-danger review-grade' onClick={()=> grade('HARD')}>Hard</button>
        </div>
      </footer>
    </div>
  )
}

function PauseCircleIcon(){
  return (
    <svg width='22' height='22' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.8' strokeLinecap='round' strokeLinejoin='round' aria-hidden='true'>
      <circle cx='12' cy='12' r='9' />
      <line x1='10' y1='9' x2='10' y2='15' />
      <line x1='14' y1='9' x2='14' y2='15' />
    </svg>
  )
}

function isHttpUrl(value: string){
  try{
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}
