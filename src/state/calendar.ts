import { create } from 'zustand'

import {
  deleteCalendarEvent as deleteCalendarEventDb,
  getCalendarEvents as getCalendarEventsDb,
  insertCalendarEvent,
  updateCalendarEventDetails,
  updateCalendarEventSchedule,
  type CalendarEventColor,
  type CalendarEventRow
} from '~/db/sqlite'

export type { CalendarEventColor } from '~/db/sqlite'

export type CalendarEvent = {
  id: string
  title: string
  memo: string
  color: CalendarEventColor
  dateKey: string
  start: number
  end: number
  createdAt: string
  updatedAt: string
}

const minutesFromDate = (date: Date) => date.getHours() * 60 + date.getMinutes()

export const formatDateKey = (date: Date) => {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

const clampMinutes = (start: number, end: number) => {
  const safeStart = Math.max(0, Math.min(Math.round(start), 24 * 60 - 1))
  const safeEnd = Math.max(safeStart + 1, Math.min(Math.round(end), 24 * 60))
  return { start: safeStart, end: safeEnd }
}

const mapRowToEvent = (row: CalendarEventRow): CalendarEvent => ({
  id: row.id,
  title: row.title,
  memo: row.memo,
  color: row.color,
  dateKey: row.dateKey,
  start: row.startMinutes,
  end: row.endMinutes,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt
})

type CalendarState = {
  events: CalendarEvent[]
  isLoaded: boolean
  loadEvents: (force?: boolean) => Promise<void>
  addEvent: (input: { title: string; memo?: string; start: Date; end: Date; color?: CalendarEventColor }) => Promise<CalendarEvent>
  updateEvent: (id: string, updates: Partial<Pick<CalendarEvent, 'title' | 'memo' | 'color'>>) => Promise<void>
  moveEvent: (id: string, updates: { dateKey: string; start: number; end: number }) => Promise<void>
  deleteEvent: (id: string) => Promise<void>
}

export const useCalendarStore = create<CalendarState>((set, get) => ({
  events: [],
  isLoaded: false,
  loadEvents: async force => {
    if (get().isLoaded && !force) return
    const rows = await getCalendarEventsDb()
    set({ events: rows.map(mapRowToEvent), isLoaded: true })
  },
  addEvent: async input => {
    const dateKey = formatDateKey(input.start)
    const bounds = clampMinutes(minutesFromDate(input.start), minutesFromDate(input.end))
    const row = await insertCalendarEvent({
      title: input.title,
      memo: input.memo,
      color: input.color ?? 'white',
      dateKey,
      startMinutes: bounds.start,
      endMinutes: bounds.end
    })
    const event = mapRowToEvent(row)
    set(state => ({ events: [...state.events, event] }))
    return event
  },
  updateEvent: async (id, updates) => {
    if (!updates) return
    const nextTitle = updates.title !== undefined ? updates.title.trim() : undefined
    if (nextTitle !== undefined && !nextTitle) {
      throw new Error('CALENDAR_EVENT_MISSING_TITLE')
    }
    const nextMemo = updates.memo !== undefined ? updates.memo.trim() : undefined
    const nextColor = updates.color
    const nowIso = new Date().toISOString()
    set(state => ({
      events: state.events.map(event =>
        event.id === id
          ? {
              ...event,
              ...(nextTitle !== undefined ? { title: nextTitle } : {}),
              ...(nextMemo !== undefined ? { memo: nextMemo } : {}),
              ...(nextColor !== undefined ? { color: nextColor } : {}),
              updatedAt: nowIso
            }
          : event
      )
    }))
    await updateCalendarEventDetails(id, {
      ...(nextTitle !== undefined ? { title: nextTitle } : {}),
      ...(nextMemo !== undefined ? { memo: nextMemo } : {}),
      ...(nextColor !== undefined ? { color: nextColor } : {})
    })
  },
  moveEvent: async (id, updates) => {
    const bounds = clampMinutes(updates.start, updates.end)
    const nowIso = new Date().toISOString()
    set(state => ({
      events: state.events.map(event =>
        event.id === id
          ? {
              ...event,
              dateKey: updates.dateKey,
              start: bounds.start,
              end: bounds.end,
              updatedAt: nowIso
            }
          : event
      )
    }))
    await updateCalendarEventSchedule(id, {
      dateKey: updates.dateKey,
      startMinutes: bounds.start,
      endMinutes: bounds.end
    })
  },
  deleteEvent: async id => {
    set(state => ({ events: state.events.filter(event => event.id !== id) }))
    await deleteCalendarEventDb(id)
  }
}))
