import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState
} from 'react'
import type { CSSProperties } from 'react'

const DEFAULT_ITEM_HEIGHT = 40
const DEFAULT_VISIBLE_COUNT = 5
const TAP_DISTANCE_THRESHOLD = 5
const MOMENTUM_FRICTION = 0.0025
const MOMENTUM_STOP_VELOCITY = 0.02
const MOMENTUM_MAX_VELOCITY = 2.2
const VELOCITY_SMOOTHING = 0.55
const SETTLE_DELAY = 140
const WHEEL_DELTA_LINE = 1
const WHEEL_DELTA_PAGE = 2

export type ScrollPickerItem<T> = {
  value: T
  label: string
  disabled?: boolean
}

export type ScrollPickerProps<T> = {
  value: T
  items: ScrollPickerItem<T>[]
  onChangeValue: (next: T) => void
  height?: number
  itemHeight?: number
  ariaLabel?: string
  ariaLabelledBy?: string
  id?: string
  className?: string
}

type PointerState = {
  pointerId: number
  startX: number
  startY: number
  lastY: number
  lastTime: number
  velocity: number
  isDragging: boolean
  tapIndex: number | null
}

function findNearestEnabledIndex<T>(
  items: ScrollPickerItem<T>[],
  targetIndex: number,
  referenceIndex: number
): number {
  const count = items.length
  if (count === 0) return 0
  const clamp = (index: number) => Math.min(Math.max(index, 0), count - 1)
  const fallback = clamp(referenceIndex)
  let current = clamp(targetIndex)
  if (!items[current]?.disabled) {
    return current
  }
  let distance = 1
  while (distance < count) {
    const lower = current - distance
    const upper = current + distance
    const hasLower = lower >= 0 && !items[lower]?.disabled
    const hasUpper = upper < count && !items[upper]?.disabled
    if (hasLower && hasUpper) {
      const lowerDistance = Math.abs(lower - fallback)
      const upperDistance = Math.abs(upper - fallback)
      return lowerDistance <= upperDistance ? lower : upper
    }
    if (hasLower) return lower
    if (hasUpper) return upper
    distance += 1
  }
  return fallback
}

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3)

export const ScrollPicker = <T,>({
  value,
  items,
  onChangeValue,
  height,
  itemHeight = DEFAULT_ITEM_HEIGHT,
  ariaLabel,
  ariaLabelledBy,
  id,
  className
}: ScrollPickerProps<T>) => {
  const listboxId = id ?? useId()
  const itemsLength = items.length
  const visibleCount = Math.max(3, DEFAULT_VISIBLE_COUNT)
  const viewportHeight = height ?? itemHeight * visibleCount
  const constrainedHeight = Math.max(itemHeight, viewportHeight)
  const centerOffset = (constrainedHeight - itemHeight) / 2
  const maxOffset = useMemo(
    () => Math.max(0, (itemsLength - 1) * itemHeight),
    [itemsLength, itemHeight]
  )

  const firstEnabledIndex = useMemo(() => {
    if (!itemsLength) return 0
    const idx = items.findIndex(item => !item.disabled)
    return idx >= 0 ? idx : 0
  }, [items, itemsLength])

  const valueIndex = useMemo(() => {
    if (!itemsLength) return 0
    const idx = items.findIndex(item => item.value === value)
    return idx >= 0 ? idx : firstEnabledIndex
  }, [firstEnabledIndex, items, itemsLength, value])

  const [offset, setOffset] = useState(() => valueIndex * itemHeight)
  const [activeIndex, setActiveIndex] = useState(valueIndex)

  const offsetRef = useRef(offset)
  const activeIndexRef = useRef(activeIndex)
  const selectedIndexRef = useRef(valueIndex)
  const valueRef = useRef(value)
  const pointerStateRef = useRef<PointerState | null>(null)
  const momentumFrameRef = useRef<number | null>(null)
  const alignFrameRef = useRef<number | null>(null)
  const settleTimeoutRef = useRef<number | null>(null)
  const initialSyncRef = useRef(true)
  const surfaceRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    offsetRef.current = offset
  }, [offset])

  useEffect(() => {
    activeIndexRef.current = activeIndex
  }, [activeIndex])

  useEffect(() => {
    selectedIndexRef.current = valueIndex
  }, [valueIndex])

  useEffect(() => {
    valueRef.current = value
  }, [value])

  const clampIndex = useCallback(
    (index: number) => {
      if (!itemsLength) return 0
      if (index < 0) return 0
      if (index >= itemsLength) return itemsLength - 1
      return index
    },
    [itemsLength]
  )

  const clampOffset = useCallback(
    (next: number) => {
      if (!itemsLength) return 0
      if (next < 0) return 0
      if (next > maxOffset) return maxOffset
      return next
    },
    [itemsLength, maxOffset]
  )

  const emitValueForIndex = useCallback(
    (index: number) => {
      if (!itemsLength) return
      const candidate = items[index]
      if (!candidate || candidate.disabled) return
      selectedIndexRef.current = index
      if (!Object.is(candidate.value, valueRef.current)) {
        valueRef.current = candidate.value
        onChangeValue(candidate.value)
      }
    },
    [items, itemsLength, onChangeValue]
  )

  const setActiveIndexState = useCallback(
    (next: number) => {
      const clamped = clampIndex(next)
      if (activeIndexRef.current !== clamped) {
        activeIndexRef.current = clamped
        setActiveIndex(clamped)
      } else {
        activeIndexRef.current = clamped
      }
      emitValueForIndex(clamped)
      return clamped
    },
    [clampIndex, emitValueForIndex]
  )

  const resolveActiveIndex = useCallback(
    (nextOffset: number) => {
      if (!itemsLength) return 0
      const nearest = clampIndex(Math.round(nextOffset / itemHeight))
      return findNearestEnabledIndex(items, nearest, selectedIndexRef.current)
    },
    [clampIndex, itemHeight, items, itemsLength]
  )

  const setOffsetState = useCallback(
    (next: number, updateActive = true) => {
      const clamped = clampOffset(next)
      if (offsetRef.current !== clamped) {
        offsetRef.current = clamped
        setOffset(clamped)
      } else {
        offsetRef.current = clamped
      }
      if (updateActive) {
        const resolved = resolveActiveIndex(clamped)
        setActiveIndexState(resolved)
      }
      return clamped
    },
    [clampOffset, resolveActiveIndex, setActiveIndexState]
  )

  const cancelMomentum = useCallback(() => {
    if (momentumFrameRef.current !== null) {
      cancelAnimationFrame(momentumFrameRef.current)
      momentumFrameRef.current = null
    }
  }, [])

  const cancelAlignment = useCallback(() => {
    if (alignFrameRef.current !== null) {
      cancelAnimationFrame(alignFrameRef.current)
      alignFrameRef.current = null
    }
  }, [])

  const clearSettleTimeout = useCallback(() => {
    if (settleTimeoutRef.current !== null) {
      window.clearTimeout(settleTimeoutRef.current)
      settleTimeoutRef.current = null
    }
  }, [])

  const stopAllAnimations = useCallback(() => {
    cancelMomentum()
    cancelAlignment()
    clearSettleTimeout()
  }, [cancelAlignment, cancelMomentum, clearSettleTimeout])

  const commitSelection = useCallback(
    (index: number) => {
      if (!itemsLength) return
      const clamped = clampIndex(index)
      setActiveIndexState(clamped)
    },
    [clampIndex, itemsLength, setActiveIndexState]
  )

  const animateOffsetTo = useCallback(
    (targetOffset: number, duration = 220) => {
      const clampedTarget = clampOffset(targetOffset)
      cancelAlignment()
      if (Math.abs(clampedTarget - offsetRef.current) < 0.5) {
        setOffsetState(clampedTarget)
        return
      }
      const start = offsetRef.current
      const delta = clampedTarget - start
      const startedAt = performance.now()
      const tick = (timestamp: number) => {
        const elapsed = timestamp - startedAt
        const progress = Math.min(1, elapsed / duration)
        const eased = easeOutCubic(progress)
        const next = start + delta * eased
        setOffsetState(next)
        if (progress < 1) {
          alignFrameRef.current = requestAnimationFrame(tick)
        } else {
          alignFrameRef.current = null
          setOffsetState(clampedTarget)
        }
      }
      alignFrameRef.current = requestAnimationFrame(tick)
    },
    [cancelAlignment, clampOffset, setOffsetState]
  )

  const snapToNearest = useCallback(() => {
    if (!itemsLength) return
    const nearest = clampIndex(Math.round(offsetRef.current / itemHeight))
    const resolved = findNearestEnabledIndex(items, nearest, selectedIndexRef.current)
    const target = resolved * itemHeight
    commitSelection(resolved)
    animateOffsetTo(target, 190)
  }, [animateOffsetTo, clampIndex, commitSelection, itemHeight, items, itemsLength])

  const scheduleSnap = useCallback(() => {
    clearSettleTimeout()
    settleTimeoutRef.current = window.setTimeout(() => {
      settleTimeoutRef.current = null
      snapToNearest()
    }, SETTLE_DELAY)
  }, [clearSettleTimeout, snapToNearest])

  const startMomentum = useCallback(
    (initialVelocity: number) => {
      const velocityPerMs = Number.isFinite(initialVelocity) ? initialVelocity : 0
      const clampedInitial = Math.max(-MOMENTUM_MAX_VELOCITY, Math.min(MOMENTUM_MAX_VELOCITY, velocityPerMs))
      if (Math.abs(clampedInitial) < MOMENTUM_STOP_VELOCITY) {
        snapToNearest()
        return
      }
      cancelAlignment()
      let velocity = clampedInitial
      let lastTimestamp: number | null = null
      const step = (timestamp: number) => {
        if (lastTimestamp == null) {
          lastTimestamp = timestamp
          momentumFrameRef.current = requestAnimationFrame(step)
          return
        }
        const deltaTime = timestamp - lastTimestamp
        lastTimestamp = timestamp
        if (deltaTime <= 0) {
          momentumFrameRef.current = requestAnimationFrame(step)
          return
        }
        velocity *= Math.exp(-MOMENTUM_FRICTION * deltaTime)
        if (Math.abs(velocity) < MOMENTUM_STOP_VELOCITY) {
          momentumFrameRef.current = null
          snapToNearest()
          return
        }
        const nextOffset = offsetRef.current + velocity * deltaTime
        const clamped = clampOffset(nextOffset)
        if ((clamped === 0 && nextOffset <= 0) || (clamped === maxOffset && nextOffset >= maxOffset)) {
          setOffsetState(clamped)
          momentumFrameRef.current = null
          snapToNearest()
          return
        }
        setOffsetState(clamped)
        momentumFrameRef.current = requestAnimationFrame(step)
      }
      momentumFrameRef.current = requestAnimationFrame(step)
    },
    [cancelAlignment, clampOffset, maxOffset, setOffsetState, snapToNearest]
  )

  useEffect(() => {
    stopAllAnimations()
    selectedIndexRef.current = valueIndex
    setActiveIndexState(valueIndex)
    const targetOffset = valueIndex * itemHeight
    if (initialSyncRef.current) {
      initialSyncRef.current = false
      setOffsetState(targetOffset)
      return
    }
    animateOffsetTo(targetOffset, 180)
  }, [
    animateOffsetTo,
    itemHeight,
    setActiveIndexState,
    setOffsetState,
    stopAllAnimations,
    valueIndex
  ])

  useEffect(
    () => () => {
      stopAllAnimations()
    },
    [stopAllAnimations]
  )

  const findIndexFromEventTarget = useCallback((target: EventTarget | null) => {
    if (!(target instanceof HTMLElement)) return null
    const option = target.closest<HTMLElement>('[data-scroll-picker-index]')
    if (!option) return null
    const raw = option.getAttribute('data-scroll-picker-index')
    if (raw == null) return null
    const parsed = Number(raw)
    return Number.isNaN(parsed) ? null : parsed
  }, [])

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return
      event.preventDefault()
      stopAllAnimations()
      const targetIndex = findIndexFromEventTarget(event.target)
      const state: PointerState = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        lastY: event.clientY,
        lastTime: event.timeStamp,
        velocity: 0,
        isDragging: false,
        tapIndex: targetIndex
      }
      pointerStateRef.current = state
      event.currentTarget.setPointerCapture(event.pointerId)
      event.currentTarget.focus({ preventScroll: true })
    },
    [findIndexFromEventTarget, stopAllAnimations]
  )

  const handlePointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const state = pointerStateRef.current
    if (!state || state.pointerId !== event.pointerId) return
    event.preventDefault()
    const deltaY = event.clientY - state.lastY
    const totalDeltaY = event.clientY - state.startY
    if (!state.isDragging && Math.abs(totalDeltaY) > TAP_DISTANCE_THRESHOLD) {
      state.isDragging = true
      state.tapIndex = null
    }
    if (state.isDragging) {
      const offsetDelta = -deltaY
      const next = offsetRef.current + offsetDelta
      setOffsetState(next)
      const deltaTime = event.timeStamp - state.lastTime
      if (deltaTime > 0) {
        const instantVelocity = offsetDelta / deltaTime
        state.velocity = state.velocity * (1 - VELOCITY_SMOOTHING) + instantVelocity * VELOCITY_SMOOTHING
      }
    }
    state.lastY = event.clientY
    state.lastTime = event.timeStamp
  }, [setOffsetState])

  const handlePointerUp = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const state = pointerStateRef.current
      if (!state || state.pointerId !== event.pointerId) return
      event.preventDefault()
      pointerStateRef.current = null
      event.currentTarget.releasePointerCapture(event.pointerId)
      if (state.isDragging) {
        startMomentum(state.velocity)
        return
      }
      const tapIndex = findIndexFromEventTarget(event.target)
      if (tapIndex == null) {
        snapToNearest()
        return
      }
      const resolved = findNearestEnabledIndex(items, clampIndex(tapIndex), selectedIndexRef.current)
      const targetOffset = resolved * itemHeight
      commitSelection(resolved)
      animateOffsetTo(targetOffset, 160)
    },
    [
      animateOffsetTo,
      clampIndex,
      commitSelection,
      findIndexFromEventTarget,
      itemHeight,
      items,
      snapToNearest,
      startMomentum
    ]
  )

  const handlePointerCancel = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const state = pointerStateRef.current
      if (!state || state.pointerId !== event.pointerId) return
      pointerStateRef.current = null
      event.currentTarget.releasePointerCapture(event.pointerId)
      snapToNearest()
    },
    [snapToNearest]
  )

  const handleWheel = useCallback(
    (event: React.WheelEvent<HTMLDivElement>) => {
      if (!itemsLength) return
      event.preventDefault()
      stopAllAnimations()
      let delta = event.deltaY
      if (event.deltaMode === WHEEL_DELTA_LINE) {
        delta *= itemHeight
      } else if (event.deltaMode === WHEEL_DELTA_PAGE) {
        delta *= constrainedHeight
      }
      setOffsetState(offsetRef.current + delta)
      scheduleSnap()
    },
    [
      constrainedHeight,
      itemHeight,
      itemsLength,
      scheduleSnap,
      setOffsetState,
      stopAllAnimations
    ]
  )

  const findNextEnabledIndex = useCallback(
    (startIndex: number, step: number) => {
      if (!itemsLength) return 0
      let index = startIndex
      do {
        index += step
        if (index < 0) return 0
        if (index >= itemsLength) return itemsLength - 1
        if (!items[index]?.disabled) return index
      } while (index > 0 && index < itemsLength - 1)
      return clampIndex(index)
    },
    [clampIndex, items, itemsLength]
  )

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (!itemsLength) return
      switch (event.key) {
        case 'ArrowUp': {
          event.preventDefault()
          const next = findNextEnabledIndex(activeIndexRef.current, -1)
          const targetOffset = next * itemHeight
          commitSelection(next)
          animateOffsetTo(targetOffset, 140)
          break
        }
        case 'ArrowDown': {
          event.preventDefault()
          const next = findNextEnabledIndex(activeIndexRef.current, 1)
          const targetOffset = next * itemHeight
          commitSelection(next)
          animateOffsetTo(targetOffset, 140)
          break
        }
        case 'PageUp': {
          event.preventDefault()
          const step = Math.max(1, Math.round(constrainedHeight / itemHeight))
          const next = findNextEnabledIndex(activeIndexRef.current, -step)
          const targetOffset = next * itemHeight
          commitSelection(next)
          animateOffsetTo(targetOffset, 160)
          break
        }
        case 'PageDown': {
          event.preventDefault()
          const step = Math.max(1, Math.round(constrainedHeight / itemHeight))
          const next = findNextEnabledIndex(activeIndexRef.current, step)
          const targetOffset = next * itemHeight
          commitSelection(next)
          animateOffsetTo(targetOffset, 160)
          break
        }
        case 'Enter':
        case ' ': {
          event.preventDefault()
          snapToNearest()
          break
        }
        default:
          break
      }
    },
    [
      animateOffsetTo,
      commitSelection,
      constrainedHeight,
      findNextEnabledIndex,
      itemHeight,
      itemsLength,
      snapToNearest
    ]
  )

  const activeOptionId = itemsLength ? `${listboxId}-option-${activeIndex}` : undefined

  const pickerStyle = useMemo(
    () =>
      ({
        height: `${constrainedHeight}px`,
        '--scroll-picker-item-height': `${itemHeight}px`,
        '--scroll-picker-viewport-height': `${constrainedHeight}px`
      }) as CSSProperties,
    [constrainedHeight, itemHeight]
  )

  const trackStyle = useMemo(
    () =>
      ({
        transform: `translate3d(0, ${centerOffset - offset}px, 0)`
      }) as CSSProperties,
    [centerOffset, offset]
  )

  return (
    <div
      className={`calendar-drumroll__picker${className ? ` ${className}` : ''}`}
      style={pickerStyle}
    >
      <div className='calendar-drumroll__gradient calendar-drumroll__gradient--top' aria-hidden='true' />
      <div className='calendar-drumroll__gradient calendar-drumroll__gradient--bottom' aria-hidden='true' />
      <div className='calendar-drumroll__selection' aria-hidden='true' />
      <div
        ref={surfaceRef}
        id={listboxId}
        className='calendar-drumroll__viewport'
        role='listbox'
        tabIndex={0}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        aria-activedescendant={activeOptionId}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onWheel={handleWheel}
        onKeyDown={handleKeyDown}
      >
        <div
          className='calendar-drumroll__track'
          style={trackStyle}
        >
          {itemsLength === 0 ? (
            <div className='calendar-drumroll__item is-empty' role='presentation'>
              &nbsp;
            </div>
          ) : (
            items.map((item, index) => {
              const isActive = index === activeIndex
              return (
                <div
                  key={`item-${index}`}
                  id={`${listboxId}-option-${index}`}
                  role='option'
                  aria-selected={isActive}
                  aria-disabled={item.disabled || undefined}
                  className={`calendar-drumroll__item${isActive ? ' is-active' : ''}${
                    item.disabled ? ' is-disabled' : ''
                  }`}
                  data-scroll-picker-index={index}
                >
                  {item.label}
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
