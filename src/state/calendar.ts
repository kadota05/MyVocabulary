import { create } from 'zustand'

export type CalendarEventVariant = 'default' | 'new' | 'purple' | 'peach'

export type CalendarEvent = {
  id: string
  title: string
  memo: string
  dateKey: string
  start: number
  end: number
  variant?: CalendarEventVariant
}

const fallbackId = () => `event-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`

const minutesFromDate = (date: Date) => date.getHours() * 60 + date.getMinutes()

export const formatDateKey = (date: Date) => {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

const clampMinutes = (start: number, end: number) => {
  const safeStart = Math.max(0, Math.min(start, 24 * 60))
  const safeEnd = Math.max(safeStart + 1, Math.min(end, 24 * 60))
  return { start: safeStart, end: safeEnd }
}

type CalendarState = {
  events: CalendarEvent[]
  addEvent: (input: { title: string; memo?: string; start: Date; end: Date; variant?: CalendarEventVariant }) => CalendarEvent
  updateEvent: (id: string, updates: Partial<Pick<CalendarEvent, 'title' | 'memo' | 'variant'>>) => void
  moveEvent: (id: string, updates: { dateKey: string; start: number; end: number }) => void
  deleteEvent: (id: string) => void
}

export const useCalendarStore = create<CalendarState>((set, get) => ({
  events: [],
  addEvent: input => {
    const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : fallbackId()
    const dateKey = formatDateKey(input.start)
    const bounds = clampMinutes(minutesFromDate(input.start), minutesFromDate(input.end))
    const nextEvent: CalendarEvent = {
      id,
      title: input.title.trim(),
      memo: input.memo?.trim() ?? '',
      dateKey,
      start: bounds.start,
      end: bounds.end,
      variant: input.variant
    }
    set(state => ({
      events: [...state.events, nextEvent]
    }))
    return nextEvent
  },
  updateEvent: (id, updates) => {
    if (!updates) return
    set(state => ({
      events: state.events.map(event => (event.id === id ? { ...event, ...updates } : event))
    }))
  },
  moveEvent: (id, updates) => {
    set(state => ({
      events: state.events.map(event =>
        event.id === id
          ? {
              ...event,
              ...updates,
              ...clampMinutes(updates.start, updates.end)
            }
          : event
      )
    }))
  },
  deleteEvent: id => {
    set(state => ({
      events: state.events.filter(event => event.id !== id)
    }))
  }
}))
