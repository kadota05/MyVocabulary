import { create } from 'zustand'
import { applyReview, DueCard, getDueCards, Grade, todayYMD } from '~\/db/sqlite'

type State = {
  today: string
  remaining: DueCard[]
  again: DueCard[]
  current?: DueCard
  currentSide?: 'left'|'right'
  flipped: boolean
  loading: boolean
  startToday: () => Promise<void>
  flip: () => void
  grade: (g: Grade) => Promise<void>
}

export const useStore = create<State>((set, get)=> ({
  today: todayYMD(),
  remaining: [],
  again: [],
  current: undefined,
  currentSide: undefined,
  flipped: false,
  loading: false,
  startToday: async () => {
    set({ loading: true })
    const today = todayYMD()
    const due = await getDueCards(today)
    // Initialize pools, then pick first card randomly across pools (right is empty initially)
    const left = due.slice()
    const right: DueCard[] = []
    const { next, side, leftOut, rightOut } = pickNext(left, right)
    set({ today, remaining: leftOut, again: rightOut, current: next, currentSide: side, flipped: false, loading: false })
  },
  flip: () => set(s=> ({ flipped: !s.flipped })),
  grade: async (g: Grade) => {
    const { current, currentSide, remaining, again, today } = get()
    if (!current) return
    await applyReview(current.id, g, today)
    // Update pools: current is already removed from pools by selection; modify as per grade
    let left = remaining.slice()
    let right = again.slice()
    if (g === 'HARD'){
      // Move to right pool (if already from right, keep in right by appending to end)
      right.push(current)
    }
    // EASY/NORMAL: do not reinsert; card disappears from today’s pools
    const { next, side, leftOut, rightOut } = pickNext(left, right)
    set({ remaining: leftOut, again: rightOut, current: next, currentSide: side, flipped: false })
  }
}))

function pickNext(left: DueCard[], right: DueCard[]): { next?: DueCard; side?: 'left'|'right'; leftOut: DueCard[]; rightOut: DueCard[] }{
  const lc = left.length
  const rc = right.length
  if (lc === 0 && rc === 0) return { next: undefined, side: undefined, leftOut: left, rightOut: right }
  if (lc === 0 && rc > 0){
    const n = right[0]
    return { next: n, side: 'right', leftOut: left, rightOut: right.slice(1) }
  }
  if (rc === 0 && lc > 0){
    const n = left[0]
    return { next: n, side: 'left', leftOut: left.slice(1), rightOut: right }
  }
  // both non-empty: pick side randomly, weighted by counts
  const total = lc + rc
  const r = Math.random() * total
  if (r < lc){
    const n = left[0]
    return { next: n, side: 'left', leftOut: left.slice(1), rightOut: right }
  } else {
    const n = right[0]
    return { next: n, side: 'right', leftOut: left, rightOut: right.slice(1) }
  }
}
