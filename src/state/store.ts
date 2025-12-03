import { create } from 'zustand'
import { applyReview, DueCard, getDueCards, Grade, todayYMD } from '~/db/sqlite'

type CardOrder = 'phrase-first' | 'meaning-first'

type State = {
  geminiApiKey: string
  setGeminiApiKey: (key: string) => void
  today: string
  remaining: DueCard[]
  again: DueCard[]
  current?: DueCard
  currentSide?: 'left' | 'right'
  flipped: boolean
  loading: boolean
  cardOrder: CardOrder
  startToday: () => Promise<void>
  flip: () => void
  setCardOrder: (value: CardOrder) => void
  toggleCardOrder: () => void
  grade: (g: Grade) => Promise<void>
}

const CARD_ORDER_STORAGE_KEY = 'review:cardOrder'

function getInitialCardOrder(): CardOrder {
  if (typeof window === 'undefined') return 'phrase-first'
  try {
    const stored = window.localStorage.getItem(CARD_ORDER_STORAGE_KEY)
    return stored === 'meaning-first' ? 'meaning-first' : 'phrase-first'
  } catch {
    return 'phrase-first'
  }
}

function persistCardOrder(value: CardOrder) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(CARD_ORDER_STORAGE_KEY, value)
  } catch {
    // Ignore localStorage failures
  }
}

export const useStore = create<State>((set, get) => ({
  geminiApiKey: import.meta.env.VITE_GEMINI_API_KEY || '',
  setGeminiApiKey: (key: string) => set({ geminiApiKey: key }),
  today: todayYMD(),
  remaining: [],
  again: [],
  current: undefined,
  currentSide: undefined,
  flipped: false,
  loading: false,
  cardOrder: getInitialCardOrder(),
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
  flip: () => set(s => ({ flipped: !s.flipped })),
  setCardOrder: (value: CardOrder) => {
    set({ cardOrder: value, flipped: false })
    persistCardOrder(value)
  },
  toggleCardOrder: () => {
    const next = get().cardOrder === 'phrase-first' ? 'meaning-first' : 'phrase-first'
    set({ cardOrder: next, flipped: false })
    persistCardOrder(next)
  },
  grade: async (g: Grade) => {
    const { current, currentSide, remaining, again, today } = get()
    if (!current) return
    await applyReview(current.id, g, today)
    // Update pools: current is already removed from pools by selection; modify as per grade
    let left = remaining.slice()
    let right = again.slice()
    if (g === 'HARD') {
      // Move to right pool (if already from right, keep in right by appending to end)
      right.push(current)
    }
    // EASY/NORMAL: do not reinsert; card disappears from today’s pools
    const { next, side, leftOut, rightOut } = pickNext(left, right)
    set({ remaining: leftOut, again: rightOut, current: next, currentSide: side, flipped: false })
  }
}))

function pickNext(left: DueCard[], right: DueCard[]): { next?: DueCard; side?: 'left' | 'right'; leftOut: DueCard[]; rightOut: DueCard[] } {
  const lc = left.length
  const rc = right.length
  const total = lc + rc
  if (total === 0) return { next: undefined, side: undefined, leftOut: left, rightOut: right }

  const pickIndex = Math.floor(Math.random() * total)
  if (pickIndex < lc) {
    const idx = pickIndex
    const next = left[idx]
    const leftOut = [...left.slice(0, idx), ...left.slice(idx + 1)]
    return { next, side: 'left', leftOut, rightOut: right }
  }

  const idx = pickIndex - lc
  const next = right[idx]
  const rightOut = [...right.slice(0, idx), ...right.slice(idx + 1)]
  return { next, side: 'right', leftOut: left, rightOut }
}
