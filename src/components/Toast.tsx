import { useEffect, useState } from 'react'

type Toast = { id: number; text: string }
let pushFn: ((text: string) => void) | null = null

export function toast(text: string){ pushFn?.(text) }

export default function ToastHost(){
  const [items,setItems] = useState<Toast[]>([])
  useEffect(()=>{
    pushFn = (text:string)=>{
      const id = Date.now()+Math.random()
      setItems(v=>[...v,{id,text}])
      setTimeout(()=> setItems(v=>v.filter(t=>t.id!==id)), 4000)
    }
    return ()=>{ pushFn = null }
  },[])
  return (
    <div style={{ position:'fixed', bottom:84, left:0, right:0, display:'flex', flexDirection:'column', gap:8, alignItems:'center' }}>
      {items.map(i=> (
        <div key={i.id} className='pill' style={{ background:'#0b1220' }}>{i.text}</div>
      ))}
    </div>
  )
}

