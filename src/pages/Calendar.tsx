import { ChevronLeft, Grid2x2, Plus, Search, Trash2 } from 'lucide-react'
import type React from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { formatDateKey, useCalendarStore, type CalendarEvent } from '../state/calendar'

const START_HOUR = 0
const END_HOUR = 24
const TOTAL_MINUTES = (END_HOUR - START_HOUR) * 60
const HOURS = Array.from({ length: END_HOUR - START_HOUR }, (_, index) => START_HOUR + index)
const SNAP_MINUTES = 15
const MIN_EVENT_DURATION = 30
const LONG_PRESS_DELAY_MOUSE = 220
const LONG_PRESS_DELAY_TOUCH = 2000
const LONG_PRESS_CANCEL_DISTANCE = 14
const DAYS_OF_WEEK_JP = ['日', '月', '火', '水', '木', '金', '土']

type EditingState = { id: string; field: 'title' | 'memo' } | null
type PressOrigin = {
  pointerId: number
  clientX: number
  clientY: number
  pointerType: string
  eventId: string
  start: number
  end: number
  dateKey: string
  element: HTMLElement
}
type ActiveDrag = {
  pointerId: number
  eventId: string
  offset: number
  duration: number
  dateKey: string
}
type DragPreview = {
  eventId: string
  start: number
  end: number
}

const addDays = (date: Date, amount: number) => {
  const next = new Date(date)
  next.setDate(next.getDate() + amount)
  return next
}

const buildWeekWindow = (date: Date) => {
  const weekStart = addDays(date, -date.getDay())
  return Array.from({ length: 7 }, (_, index) => addDays(weekStart, index))
}

const minutesToLabel = (minutes: number) => {
  const hours24 = Math.floor(minutes / 60)
  const minutesPart = minutes % 60
  const twelveHour = ((hours24 + 11) % 12) + 1
  const paddedMinutes = minutesPart.toString().padStart(2, '0')
  const suffix = hours24 >= 12 ? 'PM' : 'AM'
  return `${twelveHour}:${paddedMinutes} ${suffix}`
}

const formatHourLabel = (hour: number) => `${hour}:00`

const clampMinutes = (value: number) => Math.min(Math.max(value, 0), TOTAL_MINUTES)
const clampStart = (value: number) => Math.min(clampMinutes(value), TOTAL_MINUTES - MIN_EVENT_DURATION)
const snapStart = (value: number) => Math.floor(value / SNAP_MINUTES) * SNAP_MINUTES
const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

const classNames = (...classes: Array<string | boolean | null | undefined>) => classes.filter(Boolean).join(' ')

export default function Calendar() {
  const navigate = useNavigate()
  const { events, updateEvent, moveEvent, deleteEvent } = useCalendarStore(state => ({
    events: state.events,
    updateEvent: state.updateEvent,
    moveEvent: state.moveEvent,
    deleteEvent: state.deleteEvent
  }))
  const [selectedDate, setSelectedDate] = useState(() => new Date())
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null)
  const [editing, setEditing] = useState<EditingState>(null)
  const [editingValue, setEditingValue] = useState('')
  const [dragPreview, setDragPreview] = useState<DragPreview | null>(null)
  const [trashActive, setTrashActive] = useState(false)
  const timelineRef = useRef<HTMLDivElement | null>(null)
  const trashZoneRef = useRef<HTMLDivElement | null>(null)
  const pressTimerRef = useRef<number | null>(null)
  const pressOriginRef = useRef<PressOrigin | null>(null)
  const dragStateRef = useRef<ActiveDrag | null>(null)
  const editingFieldRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null)

  const now = new Date()
  const selectedDateKey = formatDateKey(selectedDate)
  const todayKey = formatDateKey(now)
  const isTodayView = sameDay(now, selectedDate)
  const nowMinutes = now.getHours() * 60 + now.getMinutes()
  const showCurrentTime = isTodayView && nowMinutes >= 0 && nowMinutes <= TOTAL_MINUTES

  useEffect(() => {
    return () => {
      if (pressTimerRef.current) {
        window.clearTimeout(pressTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    const themeMeta = document.querySelector('meta[name="theme-color"]')
    const previousMeta = themeMeta?.getAttribute('content') ?? null
    const previousBodyBg = document.body.style.backgroundColor
    themeMeta?.setAttribute('content', '#020617')
    document.body.style.backgroundColor = '#020617'
    return () => {
      if (themeMeta) {
        if (previousMeta) {
          themeMeta.setAttribute('content', previousMeta)
        } else {
          themeMeta.removeAttribute('content')
        }
      }
      document.body.style.backgroundColor = previousBodyBg
    }
  }, [])

  useEffect(() => {
    if (expandedEventId && !events.some(event => event.id === expandedEventId)) {
      setExpandedEventId(null)
    }
  }, [events, expandedEventId])

  useEffect(() => {
    if (!editing) return
    const node = editingFieldRef.current
    if (!node) return
    node.focus()
    if (node instanceof HTMLInputElement) {
      node.select()
    } else if (node instanceof HTMLTextAreaElement) {
      const length = node.value.length
      node.setSelectionRange(length, length)
    }
  }, [editing])

  const weekDates = useMemo(() => buildWeekWindow(selectedDate), [selectedDate])

  const weekdayFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat('en-US', {
        weekday: 'long'
      }),
    []
  )
  const dayDetailFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat('en-US', {
        month: 'long',
        day: 'numeric'
      }),
    []
  )
  const jpMonthFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat('ja-JP', {
        month: 'long'
      }),
    []
  )
  const jpDateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat('ja-JP', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      }),
    []
  )
  const jpWeekdayFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat('ja-JP', {
        weekday: 'long'
      }),
    []
  )

  const eventsByDate = useMemo(() => {
    return events.reduce<Record<string, CalendarEvent[]>>((acc, event) => {
      if (!acc[event.dateKey]) {
        acc[event.dateKey] = []
      }
      acc[event.dateKey].push(event)
      return acc
    }, {})
  }, [events])

  const timelineEvents = useMemo(() => {
    const scoped = [...(eventsByDate[selectedDateKey] ?? [])]
    if (dragPreview) {
      const index = scoped.findIndex(event => event.id === dragPreview.eventId)
      if (index !== -1) {
        scoped[index] = {
          ...scoped[index],
          start: dragPreview.start,
          end: dragPreview.end,
          dateKey: selectedDateKey
        }
      }
    }
    return scoped.sort((a, b) => a.start - b.start)
  }, [dragPreview, eventsByDate, selectedDateKey])

  const monthDots = useMemo(() => {
    return Object.entries(eventsByDate).reduce<Record<string, number>>((acc, [key, value]) => {
      acc[key] = value.length
      return acc
    }, {})
  }, [eventsByDate])

  const dateTitle = `${weekdayFormatter.format(selectedDate)}, ${dayDetailFormatter.format(selectedDate)}`
  const toolbarMonthLabel = jpMonthFormatter.format(selectedDate)

  const clearPressTimer = () => {
    if (pressTimerRef.current) {
      window.clearTimeout(pressTimerRef.current)
      pressTimerRef.current = null
    }
  }

  const getRelativeMinutes = (clientY: number) => {
    if (!timelineRef.current) return null
    const rect = timelineRef.current.getBoundingClientRect()
    const offset = clientY - rect.top
    const ratio = offset / rect.height
    return clampMinutes(ratio * TOTAL_MINUTES)
  }

  const isPointerOverTrash = (clientX: number, clientY: number) => {
    if (!trashZoneRef.current) return false
    const rect = trashZoneRef.current.getBoundingClientRect()
    return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom
  }

  const startDragFromOrigin = () => {
    const origin = pressOriginRef.current
    if (!origin) return
    clearPressTimer()
    const pointerMinutes = getRelativeMinutes(origin.clientY)
    const offset = pointerMinutes == null ? 0 : pointerMinutes - origin.start
    const duration = Math.max(origin.end - origin.start, MIN_EVENT_DURATION)
    dragStateRef.current = {
      pointerId: origin.pointerId,
      eventId: origin.eventId,
      offset,
      duration,
      dateKey: origin.dateKey
    }
    setDragPreview({
      eventId: origin.eventId,
      start: origin.start,
      end: origin.end
    })
    setTrashActive(false)
    origin.element.setPointerCapture(origin.pointerId)
    pressOriginRef.current = null
  }

  const handleEventPointerDown =
    (calendarEvent: CalendarEvent) => (event: React.PointerEvent<HTMLElement>) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return
      const target = event.target as HTMLElement
      if (target.closest('[data-no-drag="true"]')) return
      setExpandedEventId(null)
      clearPressTimer()
      pressOriginRef.current = {
        pointerId: event.pointerId,
        clientX: event.clientX,
        clientY: event.clientY,
        pointerType: event.pointerType,
        eventId: calendarEvent.id,
        start: calendarEvent.start,
        end: calendarEvent.end,
        dateKey: calendarEvent.dateKey,
        element: event.currentTarget as HTMLElement
      }
      const delay =
        event.pointerType === 'touch' || event.pointerType === 'pen'
          ? LONG_PRESS_DELAY_TOUCH
          : LONG_PRESS_DELAY_MOUSE
      pressTimerRef.current = window.setTimeout(() => {
        startDragFromOrigin()
      }, delay)
    }

  const handleEventPointerMove = (event: React.PointerEvent<HTMLElement>) => {
    const activeDrag = dragStateRef.current
    if (!activeDrag) {
      const origin = pressOriginRef.current
      if (
        origin &&
        origin.pointerId === event.pointerId &&
        (origin.pointerType === 'touch' || origin.pointerType === 'pen')
      ) {
        if (Math.abs(event.clientY - origin.clientY) > LONG_PRESS_CANCEL_DISTANCE) {
          clearPressTimer()
          pressOriginRef.current = null
        }
      }
      return
    }
    if (activeDrag.pointerId !== event.pointerId) return
    const minutes = getRelativeMinutes(event.clientY)
    if (minutes == null) return
    const rawStart = minutes - activeDrag.offset
    const snappedStart = clampStart(snapStart(rawStart))
    const duration = activeDrag.duration
    const proposedEnd = snappedStart + duration
    const safeEnd = clampMinutes(Math.max(proposedEnd, snappedStart + MIN_EVENT_DURATION))
    setDragPreview(prev => {
      if (prev && prev.eventId === activeDrag.eventId && prev.start === snappedStart && prev.end === safeEnd) {
        return prev
      }
      return {
        eventId: activeDrag.eventId,
        start: snappedStart,
        end: safeEnd
      }
    })
    setTrashActive(isPointerOverTrash(event.clientX, event.clientY))
  }

  const finalizeDrag = (commit: boolean) => {
    const activeDrag = dragStateRef.current
    const preview = dragPreview
    const shouldDelete = trashActive
    dragStateRef.current = null
    pressOriginRef.current = null
    setDragPreview(null)
    setTrashActive(false)
    if (!commit || !activeDrag || !preview || preview.eventId !== activeDrag.eventId) {
      return
    }
    if (shouldDelete) {
      deleteEvent(activeDrag.eventId)
      return
    }
    const start = clampStart(preview.start)
    const end = clampMinutes(Math.max(preview.end, start + MIN_EVENT_DURATION))
    moveEvent(activeDrag.eventId, {
      dateKey: selectedDateKey,
      start,
      end
    })
  }

  const handleEventPointerUp = (event: React.PointerEvent<HTMLElement>) => {
    if (pressOriginRef.current && pressOriginRef.current.pointerId === event.pointerId) {
      clearPressTimer()
      pressOriginRef.current = null
    }
    const activeDrag = dragStateRef.current
    if (!activeDrag || activeDrag.pointerId !== event.pointerId) {
      return
    }
    if (event.currentTarget.hasPointerCapture(activeDrag.pointerId)) {
      event.currentTarget.releasePointerCapture(activeDrag.pointerId)
    }
    finalizeDrag(true)
  }

  const handleEventPointerCancel = (event: React.PointerEvent<HTMLElement>) => {
    if (pressOriginRef.current && pressOriginRef.current.pointerId === event.pointerId) {
      clearPressTimer()
      pressOriginRef.current = null
    }
    const activeDrag = dragStateRef.current
    if (!activeDrag || activeDrag.pointerId !== event.pointerId) {
      return
    }
    if (event.currentTarget.hasPointerCapture(activeDrag.pointerId)) {
      event.currentTarget.releasePointerCapture(activeDrag.pointerId)
    }
    finalizeDrag(false)
  }

  const toggleExpand = (eventId: string) => {
    setExpandedEventId(prev => (prev === eventId ? null : eventId))
  }

  const startEditingField = (eventId: string, field: 'title' | 'memo', value: string) => {
    setEditing({ id: eventId, field })
    setEditingValue(value)
    setExpandedEventId(eventId)
  }

  const commitEditing = () => {
    if (!editing) return
    const value = editing.field === 'title' ? editingValue.trim() : editingValue.trim()
    if (editing.field === 'title') {
      if (!value) {
        setEditing(null)
        setEditingValue('')
        return
      }
      updateEvent(editing.id, { title: value })
    } else {
      updateEvent(editing.id, { memo: value })
    }
    setEditing(null)
    setEditingValue('')
  }

  const cancelEditing = () => {
    setEditing(null)
    setEditingValue('')
  }

  const handleTitleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      commitEditing()
    } else if (event.key === 'Escape') {
      event.preventDefault()
      cancelEditing()
    }
  }

  const handleMemoKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      cancelEditing()
    }
  }

  const handleInteractivePointerDown = (event: React.PointerEvent<HTMLElement>) => {
    event.stopPropagation()
    clearPressTimer()
    pressOriginRef.current = null
  }

  const showComingSoon = () => {
    if (typeof window !== 'undefined') {
      window.alert('近日中に公開予定です。')
    }
  }

  const navigateToAdd = () => {
    navigate('/calendar/add')
  }

  const handleSelectDay = (date: Date) => {
    const nextDate = new Date(date)
    setSelectedDate(nextDate)
  }

  return (
    <div className='page-screen calendar-screen calendar-screen-day'>
      <div className='calendar-day-frame'>
        <header className='calendar-day-toolbar calendar-day-toolbar--header'>
          <button
            className='calendar-day-toolbar__nav'
            type='button'
            onClick={showComingSoon}
            aria-label='前の週へ'
          >
            <ChevronLeft size={26} strokeWidth={1.6} aria-hidden='true' />
            <span>{toolbarMonthLabel}</span>
          </button>
          <div className='calendar-day-toolbar__actions'>
            <button className='calendar-day-toolbar__action' type='button' aria-label='一覧に切り替え' onClick={showComingSoon}>
              <Grid2x2 size={24} strokeWidth={1.6} aria-hidden='true' />
            </button>
            <button className='calendar-day-toolbar__action' type='button' aria-label='予定を検索' onClick={showComingSoon}>
              <Search size={24} strokeWidth={1.6} aria-hidden='true' />
            </button>
            <button className='calendar-day-toolbar__action is-accent' type='button' aria-label='予定を追加' onClick={navigateToAdd}>
              <Plus size={24} strokeWidth={1.6} aria-hidden='true' />
            </button>
          </div>
        </header>

        <div className='calendar-day-week-grid' role='grid' aria-label='Select day within week'>
          {weekDates.map(date => {
            const dateKey = formatDateKey(date)
            const isToday = dateKey === todayKey
            const isSelected = dateKey === selectedDateKey
            const hasEvents = (monthDots[dateKey] ?? 0) > 0
            const cellLabel = `${jpDateFormatter.format(date)}・${jpWeekdayFormatter.format(date)}`
            const weekdayLabel = DAYS_OF_WEEK_JP[date.getDay()]

            return (
              <button
                key={`week-${dateKey}`}
                type='button'
                className={classNames('calendar-day-week-grid__cell', isSelected && 'is-selected', isToday && 'is-today')}
                aria-current={isSelected ? 'date' : undefined}
                aria-label={`${cellLabel}${hasEvents ? `、${monthDots[dateKey]}件の予定` : ''}`}
                onClick={() => handleSelectDay(date)}
              >
                <span className='calendar-day-week-grid__weekday' aria-hidden='true'>
                  {weekdayLabel}
                </span>
                <span className='calendar-day-week-grid__number'>{date.getDate()}</span>
                {hasEvents && <span className='calendar-day-week-grid__dot' aria-hidden='true' />}
              </button>
            )
          })}
        </div>

        <main className='calendar-day-main' role='region' aria-label='Daily schedule timeline'>
          <div className='calendar-timeline calendar-timeline--day'>
            <div className='calendar-time-column' aria-hidden='true'>
              {HOURS.map(hour => (
                <div key={`label-${hour}`} className='calendar-time-label'>
                  {formatHourLabel(hour)}
                </div>
              ))}
              {dragPreview && (
                <div
                  className='calendar-time-indicator'
                  style={{ top: `${(clampMinutes(dragPreview.start) / TOTAL_MINUTES) * 100}%` }}
                >
                  <span>{minutesToLabel(clampMinutes(dragPreview.start))}</span>
                </div>
              )}
            </div>

            <div
              className={classNames('calendar-grid', 'calendar-grid--day', expandedEventId && 'calendar-grid--expanded')}
              ref={timelineRef}
            >
              <div className='calendar-grid__surface' aria-hidden='true' />
              {showCurrentTime && (
                <div className='calendar-current-time' style={{ top: `${(nowMinutes / TOTAL_MINUTES) * 100}%` }}>
                  <span className='calendar-current-time__dot' aria-hidden='true' />
                </div>
              )}
              {timelineEvents.map(event => {
                const start = clampStart(event.start)
                const end = clampMinutes(Math.max(event.end, start + MIN_EVENT_DURATION))
                const top = (start / TOTAL_MINUTES) * 100
                const height = ((end - start) / TOTAL_MINUTES) * 100
                const isExpanded = expandedEventId === event.id
                const isDragging = dragPreview?.eventId === event.id
                const isDimmed = expandedEventId !== null && expandedEventId !== event.id
                const isCompactSlot = height < 12
                const needsToggle = isCompactSlot || event.title.length > 26 || event.memo.length > 40
                const showExpander = isExpanded || needsToggle
                const titleEditing = editing?.id === event.id && editing.field === 'title'
                const memoEditing = editing?.id === event.id && editing.field === 'memo'
                const displayTitle = event.title || '無題の予定'
                const displayMemo = event.memo || 'メモを追加'
                const style: React.CSSProperties = {
                  top: `${top}%`,
                  minHeight: `${height}%`,
                  height: isExpanded ? 'auto' : `${height}%`,
                  zIndex: isExpanded ? 30 : undefined
                }

                return (
                  <article
                    key={`${event.id}-${event.dateKey}`}
                    className={classNames(
                      'calendar-event',
                      `calendar-event--${event.variant ?? 'default'}`,
                      isExpanded && 'is-expanded',
                      isDragging && 'is-dragging',
                      isDimmed && 'is-dimmed'
                    )}
                    style={style}
                    aria-label={`${event.title} ${event.memo ? `- ${event.memo}` : ''}、${dateTitle}、${minutesToLabel(start)} 〜 ${minutesToLabel(end)}`}
                    onPointerDown={handleEventPointerDown(event)}
                    onPointerMove={handleEventPointerMove}
                    onPointerUp={handleEventPointerUp}
                    onPointerCancel={handleEventPointerCancel}
                  >
                    {showExpander && (
                      <button
                        type='button'
                        className='calendar-event__expander'
                        aria-label={isExpanded ? '予定カードを折りたたむ' : '予定カードを展開する'}
                        data-no-drag='true'
                        onPointerDown={handleInteractivePointerDown}
                        onClick={() => toggleExpand(event.id)}
                      >
                        {isExpanded ? '<<' : '>>'}
                      </button>
                    )}

                    <div className='calendar-event__content'>
                      {titleEditing ? (
                        <input
                          ref={node => {
                            editingFieldRef.current = node
                          }}
                          type='text'
                          value={editingValue}
                          className='calendar-event__input'
                          data-no-drag='true'
                          onPointerDown={handleInteractivePointerDown}
                          onChange={event => setEditingValue(event.target.value)}
                          onBlur={commitEditing}
                          onKeyDown={handleTitleKeyDown}
                        />
                      ) : (
                        <button
                          type='button'
                          className='calendar-event__title'
                          data-no-drag='true'
                          onPointerDown={handleInteractivePointerDown}
                          onClick={() => startEditingField(event.id, 'title', event.title)}
                        >
                          {displayTitle}
                        </button>
                      )}

                      {memoEditing ? (
                        <textarea
                          ref={node => {
                            editingFieldRef.current = node
                          }}
                          value={editingValue}
                          className='calendar-event__textarea'
                          data-no-drag='true'
                          rows={isExpanded ? 4 : 2}
                          onPointerDown={handleInteractivePointerDown}
                          onChange={event => setEditingValue(event.target.value)}
                          onBlur={commitEditing}
                          onKeyDown={handleMemoKeyDown}
                        />
                      ) : (
                        <button
                          type='button'
                          className={classNames('calendar-event__memo', !event.memo && 'is-empty')}
                          data-no-drag='true'
                          onPointerDown={handleInteractivePointerDown}
                          onClick={() => startEditingField(event.id, 'memo', event.memo)}
                        >
                          {displayMemo}
                        </button>
                      )}
                    </div>
                  </article>
                )
              })}
            </div>
          </div>
        </main>
        {dragPreview && (
          <div
            ref={trashZoneRef}
            className={classNames('calendar-trash-zone', trashActive && 'is-active')}
            aria-hidden='true'
          >
            <Trash2 size={22} strokeWidth={1.6} aria-hidden='true' />
            <span>ここにドラッグで削除</span>
          </div>
        )}
      </div>
    </div>
  )
}
