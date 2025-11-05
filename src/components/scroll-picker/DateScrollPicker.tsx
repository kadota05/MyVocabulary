import { useCallback, useEffect, useMemo } from 'react'
import { ScrollPicker, type ScrollPickerItem } from './ScrollPicker'

export type DateScrollPickerColumn = 'year' | 'month' | 'day' | 'hour' | 'minute' | 'ampm'

export type DateScrollPickerProps = {
  value: Date
  onChange: (next: Date) => void
  columns: DateScrollPickerColumn[]
  minuteStep?: number
  minDate?: Date
  maxDate?: Date
  ariaLabel?: string
  className?: string
}

type AmpmValue = 'am' | 'pm'

const DEFAULT_YEAR_RANGE = 60

const groupLabel: Record<'date' | 'time', string> = {
  date: '\u65e5\u4ed8\u3092\u9078\u629e',
  time: '\u6642\u523b\u3092\u9078\u629e'
}

const getDaysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate()

const alignMinutesToStep = (date: Date, step: number) => {
  if (step <= 1) {
    date.setSeconds(0, 0)
    return
  }
  const minutes = date.getMinutes()
  const remainder = minutes % step
  if (remainder !== 0) {
    date.setMinutes(minutes - remainder)
  }
  date.setSeconds(0, 0)
}

const normalizeDate = (date: Date, step: number, minTime: number | null, maxTime: number | null) => {
  date.setSeconds(0, 0)
  if (minTime !== null && date.getTime() < minTime) {
    date.setTime(minTime)
    date.setSeconds(0, 0)
    return
  }
  if (maxTime !== null && date.getTime() > maxTime) {
    date.setTime(maxTime)
    date.setSeconds(0, 0)
    return
  }
  alignMinutesToStep(date, step)
}

const isWithinRange = (date: Date, minTime: number | null, maxTime: number | null) => {
  const timestamp = date.getTime()
  if (minTime !== null && timestamp < minTime) return false
  if (maxTime !== null && timestamp > maxTime) return false
  return true
}

const createCandidateDate = (
  base: Date,
  column: DateScrollPickerColumn,
  rawValue: number | AmpmValue,
  step: number,
  usesAmpm: boolean
) => {
  const next = new Date(base.getTime())
  switch (column) {
    case 'year': {
      const month = next.getMonth()
      const currentDay = next.getDate()
      next.setFullYear(rawValue as number)
      const maxDay = getDaysInMonth(rawValue as number, month)
      if (currentDay > maxDay) {
        next.setDate(maxDay)
      }
      break
    }
    case 'month': {
      const year = next.getFullYear()
      const currentDay = next.getDate()
      next.setMonth(rawValue as number)
      const maxDay = getDaysInMonth(year, rawValue as number)
      if (currentDay > maxDay) {
        next.setDate(maxDay)
      }
      break
    }
    case 'day': {
      next.setDate(rawValue as number)
      break
    }
    case 'hour': {
      const hourValue = rawValue as number
      if (usesAmpm) {
        const isCurrentlyPm = next.getHours() >= 12
        let normalized = hourValue % 12
        if (normalized === 0) {
          normalized = 0
        }
        if (isCurrentlyPm) {
          if (normalized < 12) {
            normalized += 12
          }
        } else if (hourValue === 12) {
          normalized = 0
        }
        next.setHours(normalized)
      } else {
        next.setHours(hourValue)
      }
      break
    }
    case 'minute': {
      next.setMinutes(rawValue as number)
      break
    }
    case 'ampm': {
      const ampm = rawValue as AmpmValue
      const currentHour = next.getHours()
      if (ampm === 'pm' && currentHour < 12) {
        next.setHours(currentHour + 12)
      } else if (ampm === 'am' && currentHour >= 12) {
        next.setHours(currentHour - 12)
      }
      break
    }
    default:
      break
  }
  alignMinutesToStep(next, step)
  return next
}

export function DateScrollPicker({
  value,
  onChange,
  columns,
  minuteStep = 1,
  minDate,
  maxDate,
  ariaLabel,
  className
}: DateScrollPickerProps) {
  const step = Math.max(1, minuteStep)
  const minTime = minDate ? new Date(minDate).getTime() : null
  const maxTime = maxDate ? new Date(maxDate).getTime() : null
  const usesAmpm = columns.includes('ampm')

  const safeValue = useMemo(() => {
    const next = new Date(value.getTime())
    normalizeDate(next, step, minTime, maxTime)
    return next
  }, [maxTime, minTime, step, value])

  useEffect(() => {
    if (safeValue.getTime() !== value.getTime()) {
      onChange(new Date(safeValue.getTime()))
    }
  }, [onChange, safeValue, value])

  const emitChange = useCallback(
    (mutator: (draft: Date) => void) => {
      const draft = new Date(safeValue.getTime())
      mutator(draft)
      normalizeDate(draft, step, minTime, maxTime)
      onChange(draft)
    },
    [maxTime, minTime, onChange, safeValue, step]
  )

  const safeYear = safeValue.getFullYear()
  const minYear = minTime ? new Date(minTime).getFullYear() : safeYear - DEFAULT_YEAR_RANGE
  const maxYear = maxTime ? new Date(maxTime).getFullYear() : safeYear + DEFAULT_YEAR_RANGE

  const yearItems = useMemo<ScrollPickerItem<number>[]>(() => {
    if (!columns.includes('year')) return []
    const items: ScrollPickerItem<number>[] = []
    for (let year = minYear; year <= maxYear; year += 1) {
      const candidate = createCandidateDate(safeValue, 'year', year, step, usesAmpm)
      items.push({
        label: `${year}`,
        value: year,
        disabled: !isWithinRange(candidate, minTime, maxTime)
      })
    }
    return items
  }, [columns, maxDate, maxTime, maxYear, minDate, minTime, minYear, safeValue, step, usesAmpm])

  const monthItems = useMemo<ScrollPickerItem<number>[]>(() => {
    if (!columns.includes('month')) return []
    return Array.from({ length: 12 }, (_, index) => {
      const candidate = createCandidateDate(safeValue, 'month', index, step, usesAmpm)
      return {
        label: `${index + 1}`.padStart(2, '0'),
        value: index,
        disabled: !isWithinRange(candidate, minTime, maxTime)
      }
    })
  }, [columns, maxTime, minTime, safeValue, step, usesAmpm])

  const dayCount = useMemo(
    () => getDaysInMonth(safeValue.getFullYear(), safeValue.getMonth()),
    [safeValue]
  )

  const dayItems = useMemo<ScrollPickerItem<number>[]>(() => {
    if (!columns.includes('day')) return []
    return Array.from({ length: dayCount }, (_, index) => {
      const day = index + 1
      const candidate = createCandidateDate(safeValue, 'day', day, step, usesAmpm)
      return {
        label: `${day}`.padStart(2, '0'),
        value: day,
        disabled: !isWithinRange(candidate, minTime, maxTime)
      }
    })
  }, [columns, dayCount, maxTime, minTime, safeValue, step, usesAmpm])

  const hourItems = useMemo<ScrollPickerItem<number>[]>(() => {
    if (!columns.includes('hour')) return []
    if (usesAmpm) {
      return Array.from({ length: 12 }, (_, index) => {
        const hour12 = index + 1
        const candidate = createCandidateDate(safeValue, 'hour', hour12, step, usesAmpm)
        return {
          label: `${hour12}`.padStart(2, '0'),
          value: hour12,
          disabled: !isWithinRange(candidate, minTime, maxTime)
        }
      })
    }
    return Array.from({ length: 24 }, (_, hour) => {
      const candidate = createCandidateDate(safeValue, 'hour', hour, step, usesAmpm)
      return {
        label: `${hour}`.padStart(2, '0'),
        value: hour,
        disabled: !isWithinRange(candidate, minTime, maxTime)
      }
    })
  }, [columns, maxTime, minTime, safeValue, step, usesAmpm])

  const minuteItems = useMemo<ScrollPickerItem<number>[]>(() => {
    if (!columns.includes('minute')) return []
    const items: ScrollPickerItem<number>[] = []
    for (let minute = 0; minute < 60; minute += step) {
      const candidate = createCandidateDate(safeValue, 'minute', minute, step, usesAmpm)
      items.push({
        label: `${minute}`.padStart(2, '0'),
        value: minute,
        disabled: !isWithinRange(candidate, minTime, maxTime)
      })
    }
    return items
  }, [columns, maxTime, minTime, safeValue, step, usesAmpm])

  const ampmItems = useMemo<ScrollPickerItem<AmpmValue>[]>(() => {
    if (!columns.includes('ampm')) return []
    return (['am', 'pm'] as AmpmValue[]).map(valueOption => {
      const candidate = createCandidateDate(safeValue, 'ampm', valueOption, step, usesAmpm)
      return {
        label: valueOption === 'am' ? 'AM' : 'PM',
        value: valueOption,
        disabled: !isWithinRange(candidate, minTime, maxTime)
      }
    })
  }, [columns, maxTime, minTime, safeValue, step, usesAmpm])

  const handleSelectYear = useCallback(
    (year: number) => {
      emitChange(draft => {
        const month = draft.getMonth()
        const day = draft.getDate()
        draft.setFullYear(year)
        const maxDay = getDaysInMonth(year, month)
        if (day > maxDay) {
          draft.setDate(maxDay)
        }
      })
    },
    [emitChange]
  )

  const handleSelectMonth = useCallback(
    (month: number) => {
      emitChange(draft => {
        const year = draft.getFullYear()
        const day = draft.getDate()
        draft.setMonth(month)
        const maxDay = getDaysInMonth(year, month)
        if (day > maxDay) {
          draft.setDate(maxDay)
        }
      })
    },
    [emitChange]
  )

  const handleSelectDay = useCallback(
    (day: number) => {
      emitChange(draft => {
        draft.setDate(day)
      })
    },
    [emitChange]
  )

  const handleSelectHour = useCallback(
    (hour: number) => {
      emitChange(draft => {
        if (usesAmpm) {
          const isPm = draft.getHours() >= 12
          let nextHour = hour % 12
          if (nextHour === 12 % 12) {
            nextHour = 0
          }
          if (isPm) {
            if (nextHour < 12) {
              nextHour += 12
            }
          } else if (hour === 12) {
            nextHour = 0
          }
          draft.setHours(nextHour)
        } else {
          draft.setHours(hour)
        }
      })
    },
    [emitChange, usesAmpm]
  )

  const handleSelectMinute = useCallback(
    (minute: number) => {
      emitChange(draft => {
        draft.setMinutes(minute)
      })
    },
    [emitChange]
  )

  const handleSelectAmpm = useCallback(
    (nextAmpm: AmpmValue) => {
      emitChange(draft => {
        const currentHour = draft.getHours()
        if (nextAmpm === 'pm' && currentHour < 12) {
          draft.setHours(currentHour + 12)
        } else if (nextAmpm === 'am' && currentHour >= 12) {
          draft.setHours(currentHour - 12)
        }
      })
    },
    [emitChange]
  )

  const dateColumns = columns.filter(col => col === 'year' || col === 'month' || col === 'day')
  const timeColumns = columns.filter(col => col === 'hour' || col === 'minute' || col === 'ampm')

  const hourDisplayValue = useMemo(() => {
    if (!columns.includes('hour')) return null
    const hour24 = safeValue.getHours()
    if (usesAmpm) {
      const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12
      return hour12
    }
    return hour24
  }, [columns, safeValue, usesAmpm])

  const minuteDisplayValue = useMemo(() => {
    if (!columns.includes('minute')) return null
    const minute = safeValue.getMinutes()
    if (step <= 1) return minute
    return minute - (minute % step)
  }, [columns, safeValue, step])

  const ampmValue: AmpmValue | null = useMemo(() => {
    if (!columns.includes('ampm')) return null
    return safeValue.getHours() >= 12 ? 'pm' : 'am'
  }, [columns, safeValue])

  return (
    <div
      className={`calendar-drumroll${className ? ` ${className}` : ''}`}
      role='group'
      aria-label={ariaLabel ?? '\u65e5\u4ed8\u3068\u6642\u523b\u3092\u9078\u629e'}
    >
      {dateColumns.length > 0 && (
        <div className='calendar-drumroll__section' role='group' aria-label={groupLabel.date}>
          <div className='calendar-drumroll__fields'>
            {dateColumns.includes('year') && (
              <div className='calendar-drumroll__field'>
                <ScrollPicker<number>
                  items={yearItems}
                  value={safeValue.getFullYear()}
                  onChangeValue={handleSelectYear}
                  ariaLabel='\u5e74\u3092\u9078\u629e'
                />
              </div>
            )}
            {dateColumns.includes('month') && (
              <div className='calendar-drumroll__field'>
                <ScrollPicker<number>
                  items={monthItems}
                  value={safeValue.getMonth()}
                  onChangeValue={handleSelectMonth}
                  ariaLabel='\u6708\u3092\u9078\u629e'
                />
              </div>
            )}
            {dateColumns.includes('day') && (
              <div className='calendar-drumroll__field'>
                <ScrollPicker<number>
                  items={dayItems}
                  value={safeValue.getDate()}
                  onChangeValue={handleSelectDay}
                  ariaLabel='\u65e5\u3092\u9078\u629e'
                />
              </div>
            )}
          </div>
        </div>
      )}

      {timeColumns.length > 0 && (
        <div
          className='calendar-drumroll__section calendar-drumroll__section--time'
          role='group'
          aria-label={groupLabel.time}
        >
          <div className='calendar-drumroll__fields'>
            {timeColumns.includes('hour') && hourDisplayValue !== null && (
              <div className='calendar-drumroll__field'>
                <ScrollPicker<number>
                  items={hourItems}
                  value={hourDisplayValue}
                  onChangeValue={handleSelectHour}
                  ariaLabel='\u6642\u9593\u3092\u9078\u629e'
                />
              </div>
            )}
            {timeColumns.includes('minute') && (
              <>
                {timeColumns.includes('hour') && <div className='calendar-drumroll__separator'>:</div>}
                <div className='calendar-drumroll__field'>
                  <ScrollPicker<number>
                  items={minuteItems}
                  value={minuteDisplayValue ?? 0}
                  onChangeValue={handleSelectMinute}
                  ariaLabel='\u5206\u3092\u9078\u629e'
                />
                </div>
              </>
            )}
            {timeColumns.includes('ampm') && ampmValue !== null && (
              <div className='calendar-drumroll__field'>
                <ScrollPicker<AmpmValue>
                  items={ampmItems}
                  value={ampmValue}
                  onChangeValue={handleSelectAmpm}
                  ariaLabel='AM/PM\u3092\u9078\u629e'
                />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
