import { create } from 'zustand'
import { getLeapWordsInRange, loadLeapWords, type LeapOrder, type LeapWord } from '~/lib/leap'

export type LeapConfig = {
  startIndex: number
  endIndex: number
  order: LeapOrder
  addWrongToWordlist: boolean
}

type LeapState = {
  totalAvailable: number
  ready: boolean
  loading: boolean
  config: LeapConfig | null
  current?: LeapWord
  remaining: LeapWord[]
  retry: LeapWord[]
  sessionWords: LeapWord[]
  order: LeapOrder
  error: string | null
  catalog: LeapWord[]
  catalogLoading: boolean
  initMetadata: () => Promise<void>
  startSession: (config: LeapConfig, override?: LeapWord[]) => Promise<{ success: boolean; error?: string }>
  markKnown: () => void
  markWrong: () => Promise<LeapWord | null>
  exitSession: () => void
  clearError: () => void
}

type PickResult = {
  next?: LeapWord
  remaining: LeapWord[]
  retry: LeapWord[]
}

export const useLeapStore = create<LeapState>((set, get) => ({
  totalAvailable: 0,
  ready: false,
  loading: false,
  config: null,
  current: undefined,
  remaining: [],
  retry: [],
  sessionWords: [],
  order: 'random',
  error: null,
  catalog: [],
  catalogLoading: false,
  initMetadata: async () => {
    const { catalog, catalogLoading } = get()
    if (catalogLoading) return
    if (catalog.length) {
      const maxHeading = catalog.reduce((max, word) => (word.heading > max ? word.heading : max), 0)
      set({ totalAvailable: maxHeading })
      return
    }
    set({ catalogLoading: true })
    try {
      const words = await loadLeapWords()
      const sorted = [...words].sort((a, b) => a.heading - b.heading || a.phrase.localeCompare(b.phrase))
      const maxHeading = sorted.reduce((max, word) => (word.heading > max ? word.heading : max), 0)
      set({ catalog: sorted, totalAvailable: maxHeading, catalogLoading: false })
    } catch (error) {
      console.error('Failed to load Leap catalog', error)
      set({ catalogLoading: false, error: '単語リストの読み込みに失敗しました。' })
    }
  },
  startSession: async (config, override) => {
    set({ loading: true, error: null })
    try {
      const { catalog } = get()
      let words: LeapWord[]
      if (override && override.length) {
        words = override.map(word => ({ ...word }))
      } else if (catalog.length) {
        words = filterByRange(catalog, config.startIndex, config.endIndex)
      } else {
        words = await getLeapWordsInRange(config.startIndex, config.endIndex)
      }
      if (!words.length) throw new Error('選択した範囲に単語がありません。')
      const normalizedOrder = config.order
      const orderedRemaining = normalizedOrder === 'number'
        ? [...words].sort((a, b) => a.heading - b.heading)
        : shuffle(words)
      const initialRetry: LeapWord[] = []
      const { next, remaining, retry } = pickNext(normalizedOrder, orderedRemaining, initialRetry)
      set({
        config,
        order: normalizedOrder,
        ready: true,
        current: next,
        remaining,
        retry,
        sessionWords: words,
        loading: false
      })
      return { success: true }
    } catch (error) {
      const message = error instanceof Error ? error.message : '出題の準備に失敗しました。'
      set({ loading: false, error: message, ready: false, current: undefined, remaining: [], retry: [], sessionWords: [] })
      return { success: false, error: message }
    }
  },
  markKnown: () => {
    const { current, remaining, retry, order } = get()
    if (!current) return
    const { next, remaining: nextRemaining, retry: nextRetry } = pickNext(order, remaining, retry)
    set({ current: next, remaining: nextRemaining, retry: nextRetry })
  },
  markWrong: async () => {
    const { current, remaining, retry, order } = get()
    if (!current) return null
    const retryPool = order === 'number'
      ? insertSorted(retry, current)
      : [...retry, current]
    const { next, remaining: nextRemaining, retry: updatedRetry } = pickNext(order, remaining, retryPool)
    set({ current: next, remaining: nextRemaining, retry: updatedRetry })
    return current
  },
  exitSession: () => {
    set({
      ready: false,
      config: null,
      current: undefined,
      remaining: [],
      retry: [],
      sessionWords: [],
      order: 'random'
    })
  },
  clearError: () => set({ error: null })
}))

function pickNext(order: LeapOrder, remaining: LeapWord[], retry: LeapWord[]): PickResult {
  if (remaining.length === 0 && retry.length === 0) {
    return { next: undefined, remaining, retry }
  }

  if (order === 'random') {
    const total = remaining.length + retry.length
    const pick = Math.floor(Math.random() * total)
    if (pick < remaining.length) {
      const idx = pick
      const next = remaining[idx]
      return {
        next,
        remaining: [...remaining.slice(0, idx), ...remaining.slice(idx + 1)],
        retry
      }
    }
    const idx = pick - remaining.length
    const next = retry[idx]
    return {
      next,
      remaining,
      retry: [...retry.slice(0, idx), ...retry.slice(idx + 1)]
    }
  }

  const hasRemaining = remaining.length > 0
  const hasRetry = retry.length > 0
  let fromRetry = false
  if (hasRemaining && hasRetry) {
    fromRetry = Math.random() < 0.5
  } else if (hasRetry) {
    fromRetry = true
  }

  if (fromRetry) {
    const [next, ...rest] = retry
    return { next, remaining, retry: rest }
  }
  const [next, ...rest] = remaining
  return { next, remaining: rest ?? [], retry }
}

function insertSorted(list: LeapWord[], item: LeapWord): LeapWord[] {
  const next = list.slice()
  if (!next.length) return [item]
  let inserted = false
  for (let i = 0; i < next.length; i += 1) {
    if (item.heading < next[i].heading) {
      next.splice(i, 0, item)
      inserted = true
      break
    }
  }
  if (!inserted) next.push(item)
  return next
}

function shuffle<T>(items: T[]): T[] {
  const arr = items.slice()
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = arr[i]
    arr[i] = arr[j]
    arr[j] = tmp
  }
  return arr
}

function filterByRange(words: LeapWord[], start: number, end: number): LeapWord[] {
  if (!words.length) return []
  const maxHeading = words.reduce((max, word) => (word.heading > max ? word.heading : max), 0)
  if (maxHeading <= 0) return []
  const normalizedStart = clampRange(start, maxHeading)
  const normalizedEnd = clampRange(end, maxHeading)
  if (normalizedStart > normalizedEnd) return []
  return words
    .filter(word => word.heading >= normalizedStart && word.heading <= normalizedEnd)
    .sort((a, b) => a.heading - b.heading)
    .map(word => ({ ...word }))
}

function clampRange(value: number, max: number): number {
  if (!Number.isFinite(value)) return 1
  const n = Math.floor(value)
  if (n < 1) return 1
  if (n > max) return max
  return n
}
