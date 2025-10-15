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
            <div className='review-meaning'>{current.meaning || 'Not provided'}</div>
            {current.example && <div className='review-extra'>{current.example}</div>}
            {current.source && <div className='review-extra'>Source: {current.source}</div>}
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
          <button className='icon-button' onClick={()=> nav('/words')} aria-label='Open word library'>
            <ListIcon />
          </button>
          <button className='icon-button' onClick={()=> nav('/')} aria-label='Back to home'>
            <HomeIcon />
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

        <section className='review-panel'>
          <div className='review-stats'>
            <span>Remaining: {remaining.length}</span>
            <span>Retry later: {again.length}</span>
          </div>
          <div className='review-grade-grid'>
            <button className='btn btn-accent review-grade' onClick={()=> grade('EASY')}>Easy</button>
            <button className='btn btn-primary review-grade' onClick={()=> grade('NORMAL')}>Normal</button>
            <button className='btn btn-danger review-grade' onClick={()=> grade('HARD')}>Hard</button>
          </div>
          <div className='review-controls'>
            <button className='pill review-pause' onClick={()=> nav('/')}>Pause Session</button>
          </div>
        </section>
      </main>
    </div>
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

function HomeIcon(){
  return (
    <svg width='22' height='22' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.8' strokeLinecap='round' strokeLinejoin='round' aria-hidden='true'>
      <path d='M3 11.5 12 4l9 7.5v8a.5.5 0 0 1-.5.5H15a.5.5 0 0 1-.5-.5v-5h-5v5a.5.5 0 0 1-.5.5H3.5a.5.5 0 0 1-.5-.5v-8z' />
    </svg>
  )
}
