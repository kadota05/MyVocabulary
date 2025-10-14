import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '~\/state/store'

export default function Review(){
  const nav = useNavigate()
  const { current, remaining, again, flipped, startToday, flip, grade, loading } = useStore()
  const [initialized, setInitialized] = useState(false)
  useEffect(()=>{
    let cancelled = false
    setInitialized(prev=> prev ? false : prev)
    startToday().finally(()=>{
      if (!cancelled) setInitialized(true)
    })
    return ()=>{ cancelled = true }
  },[startToday])
  const content = useMemo(()=>{
    if (!current) return null
    return (
      <div className='card tap' onClick={flip} style={{ minHeight: 220, display:'flex', alignItems:'center', justifyContent:'center' }}>
        {!flipped ? (
          <div className='big'>{current.phrase}</div>
        ) : (
          <div className='col' style={{ gap:8, textAlign:'center' }}>
            <div className='big'>{current.meaning}</div>
            {current.example && <div className='muted'>{current.example}</div>}
            {current.source && <div className='muted'>{current.source}</div>}
          </div>
        )}
      </div>
    )
  },[current, flipped, flip])

  const alertedRef = useRef(false)
  useEffect(()=>{
    if (!initialized) return
    if (!loading && !current && remaining.length===0 && again.length===0){
      if (alertedRef.current) return
      alertedRef.current = true
      setTimeout(()=>{
        alert('本日の復習は完了しました！')
        nav('/')
      }, 50)
    }
  },[initialized, loading, current, remaining.length, again.length, nav])

  return (
    <div className='col' style={{ gap:16 }}>
      <div className='title'>出題</div>
      {loading && (
        <div className='card center' style={{ minHeight: 220 }}>読み込み中...</div>
      )}
      {!loading && content}
      <div className='footer'>
        <div className='col' style={{ gap:8 }}>
          <div className='row' style={{ justifyContent:'space-between', alignItems:'center' }}>
            <div className='muted'>残り: {remaining.length} ／ 今日もう一度: {again.length}</div>
            <button className='pill' onClick={()=> nav('/')}>中断</button>
          </div>
          <div className='row'>
            <button className='btn btn-accent grow' onClick={()=> grade('EASY')}>簡単</button>
            <button className='btn btn-primary grow' onClick={()=> grade('NORMAL')}>普通</button>
            <button className='btn btn-danger grow' onClick={()=> grade('HARD')}>難しい</button>
          </div>
        </div>
      </div>
      <div className='space' />
    </div>
  )
}
