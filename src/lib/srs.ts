import { Grade, computeIntervalDays } from "~\/db/sqlite"

export function nextState(stability:number, grade: Grade, today: string){
  let s = stability
  if (grade==='EASY') s *= 1.25
  else if (grade==='NORMAL') s *= 1.10
  else s *= 0.85
  const interval = grade==='HARD' ? 0 : computeIntervalDays(s)
  const nextDue = grade==='HARD' ? today : addDays(today, interval)
  return { stability: s, intervalDays: interval, nextDue }
}

function addDays(ymd:string, days:number){
  const [y,m,d] = ymd.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m-1, d))
  dt.setUTCDate(dt.getUTCDate()+days)
  const z = (n:number)=> String(n).padStart(2,'0')
  return `${dt.getUTCFullYear()}-${z(dt.getUTCMonth()+1)}-${z(dt.getUTCDate())}`
}

