import { ChevronLeft, Grid2x2, Plus, Search } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

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

type TimelineEvent = {
  id: string
  title: string
  location: string
  dateKey: string
  start: number
  end: number
  variant?: 'default' | 'new' | 'purple' | 'peach'
}

const formatDateKey = (date: Date) => {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
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
const snapEnd = (value: number) => Math.ceil(value / SNAP_MINUTES) * SNAP_MINUTES
const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

const classNames = (...classes: Array<string | boolean | null | undefined>) =>
  classes.filter(Boolean).join(' ')

const createSeededEvents = (): TimelineEvent[] => {
  const today = new Date()
  const base = new Date(today.getFullYear(), today.getMonth(), today.getDate())

  return [
    {
      id: 'deep-work',
      title: '[サンプル] Deep Work',
      location: 'Library • Desk 3',
      dateKey: formatDateKey(base),
      start: 8 * 60,
      end: 10 * 60,
      variant: 'default'
    },
    {
      id: 'team-sync',
      title: '[サンプル] Team Sync',
      location: 'Room 201',
      dateKey: formatDateKey(base),
      start: 11 * 60,
      end: 12 * 60,
      variant: 'purple'
    },
    {
      id: 'coffee-chat',
      title: '[サンプル] Coffee with Erin',
      location: 'Blue Bottle',
      dateKey: formatDateKey(addDays(base, -1)),
      start: 15 * 60,
      end: 16 * 60,
      variant: 'peach'
    },
    {
      id: 'design-review',
      title: '[サンプル] Design Review',
      location: 'Project Phoenix',
      dateKey: formatDateKey(addDays(base, 1)),
      start: 14 * 60,
      end: 15 * 60 + 30,
      variant: 'purple'
    },
    {
      id: 'dinner',
      title: '[サンプル] Dinner with Leo',
      location: 'Downtown',
      dateKey: formatDateKey(addDays(base, 2)),
      start: 19 * 60,
      end: 20 * 60 + 30,
      variant: 'default'
    }
  ]
}

export default function Calendar() {
  const navigate = useNavigate()
  const [events] = useState(() => createSeededEvents())
  const [selectedDate, setSelectedDate] = useState(() => new Date())
  const [draftEvent, setDraftEvent] = useState<TimelineEvent | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const timelineRef = useRef<HTMLDivElement | null>(null)
  const pressTimerRef = useRef<number | null>(null)
  const pressOriginRef = useRef<{
    pointerId: number
    clientY: number
    pointerType: React.PointerEvent['pointerType']
  } | null>(null)
  const dragState = useRef<{ pointerId: number; start: number } | null>(null)

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
  const shortWeekday = useMemo(
    () =>
      new Intl.DateTimeFormat('ja-JP', {
        weekday: 'short'
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
    return events.reduce<Record<string, TimelineEvent[]>>((acc, event) => {
      if (!acc[event.dateKey]) {
        acc[event.dateKey] = []
      }
      acc[event.dateKey].push(event)
      return acc
    }, {})
  }, [events])

  const timelineEvents = useMemo(() => {
    const scopedEvents = [...(eventsByDate[selectedDateKey] ?? [])]
    if (draftEvent && draftEvent.dateKey === selectedDateKey) {
      scopedEvents.push(draftEvent)
    }
    return scopedEvents.sort((a, b) => a.start - b.start)
  }, [draftEvent, eventsByDate, selectedDateKey])

  const monthDots = useMemo(() => {
    const dots = Object.entries(eventsByDate).reduce<Record<string, number>>((acc, [key, value]) => {
      acc[key] = value.length
      return acc
    }, {})
    if (draftEvent) {
      dots[draftEvent.dateKey] = (dots[draftEvent.dateKey] ?? 0) + 1
    }
    return dots
  }, [draftEvent, eventsByDate])

  const dateTitle = `${weekdayFormatter.format(selectedDate)}, ${dayDetailFormatter.format(selectedDate)}`
  const toolbarMonthLabel = jpMonthFormatter.format(selectedDate)
  const showComingSoon = () => {
    if (typeof window !== 'undefined') {
      window.alert('近日公開予定です。')
    }
  }
  const navigateToAdd = () => {
    navigate('/calendar/add')
  }

  const clearPressTimer = () => {
    if (pressTimerRef.current) {
      window.clearTimeout(pressTimerRef.current)
      pressTimerRef.current = null
    }
    pressOriginRef.current = null
  }

  const getRelativeMinutes = (clientY: number) => {
    if (!timelineRef.current) return null
    const rect = timelineRef.current.getBoundingClientRect()
    const offset = clientY - rect.top
    const ratio = offset / rect.height
    return clampMinutes(ratio * TOTAL_MINUTES)
  }

  const startDrag = (minutes: number, target: HTMLDivElement, pointerId: number) => {
    const safeStart = clampStart(snapStart(minutes))
    pressOriginRef.current = null
    dragState.current = { pointerId, start: safeStart }
    setDraftEvent({
      id: 'draft-event',
      title: 'New Event',
      location: 'Add more details',
      dateKey: selectedDateKey,
      start: safeStart,
      end: safeStart + MIN_EVENT_DURATION,
      variant: 'new'
    })
    setIsCreating(true)
    target.setPointerCapture(pointerId)
  }

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    clearPressTimer()
    const minutes = getRelativeMinutes(event.clientY)
    if (minutes == null) return
    const target = event.currentTarget
    const pointerId = event.pointerId
    pressOriginRef.current = { pointerId, clientY: event.clientY, pointerType: event.pointerType }
    const delay =
      event.pointerType === 'touch' || event.pointerType === 'pen'
        ? LONG_PRESS_DELAY_TOUCH
        : LONG_PRESS_DELAY_MOUSE
    pressTimerRef.current = window.setTimeout(() => {
      startDrag(minutes, target, pointerId)
      pressTimerRef.current = null
    }, delay)
  }

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragState.current || !isCreating) {
      const origin = pressOriginRef.current
      if (
        origin &&
        origin.pointerId === event.pointerId &&
        (origin.pointerType === 'touch' || origin.pointerType === 'pen')
      ) {
        if (Math.abs(event.clientY - origin.clientY) > LONG_PRESS_CANCEL_DISTANCE) {
          clearPressTimer()
        }
      }
      return
    }
    const minutes = getRelativeMinutes(event.clientY)
    if (minutes == null) return
    const snappedEnd = snapEnd(minutes)
    const safeEnd = clampMinutes(Math.max(snappedEnd, dragState.current.start + MIN_EVENT_DURATION))
    setDraftEvent(prev =>
      prev
        ? {
            ...prev,
            start: dragState.current!.start,
            end: safeEnd
          }
        : prev
    )
  }

  const stopDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    clearPressTimer()
    if (dragState.current && event.currentTarget.hasPointerCapture(dragState.current.pointerId)) {
      event.currentTarget.releasePointerCapture(dragState.current.pointerId)
    }
    dragState.current = null
    setIsCreating(false)
  }

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    stopDrag(event)
  }

  const handlePointerCancel = (event: React.PointerEvent<HTMLDivElement>) => {
    stopDrag(event)
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
            aria-label='前の日へ'
          >
            <ChevronLeft size={26} strokeWidth={1.6} aria-hidden='true' />
            <span>{toolbarMonthLabel}</span>
          </button>
          <div className='calendar-day-toolbar__actions'>
            <button className='calendar-day-toolbar__action' type='button' aria-label='今日に移動' onClick={showComingSoon}>
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
            </div>

            <div
              className='calendar-grid calendar-grid--day'
              ref={timelineRef}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerCancel}
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
                return (
                  <article
                    key={`${event.id}-${event.dateKey}`}
                    className={`calendar-event calendar-event--${event.variant ?? 'default'}`}
                    style={{ top: `${top}%`, height: `${height}%` }}
                    aria-label={`${event.title} on ${dateTitle} from ${minutesToLabel(start)} to ${minutesToLabel(end)}`}
                  >
                    <p className='calendar-event__title'>{event.title}</p>
                    <p className='calendar-event__location'>{event.location}</p>
                  </article>
                )
              })}
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}

