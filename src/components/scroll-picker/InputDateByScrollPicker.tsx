import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent
} from 'react'
import { DateScrollPicker, type DateScrollPickerColumn } from './DateScrollPicker'

export type InputDateByScrollPickerProps = {
  value: Date
  open: boolean
  columns: DateScrollPickerColumn[]
  onConfirm: (value: Date) => void
  onCancel: () => void
  minuteStep?: number
  minDate?: Date
  maxDate?: Date
  title?: string
  confirmLabel?: string
  cancelLabel?: string
  className?: string
}

export function InputDateByScrollPicker({
  value,
  open,
  columns,
  onConfirm,
  onCancel,
  minuteStep,
  minDate,
  maxDate,
  title = '\u65e5\u4ed8\u3068\u6642\u523b\u3092\u9078\u629e',
  confirmLabel = 'OK',
  cancelLabel = '\u30ad\u30e3\u30f3\u30bb\u30eb',
  className
}: InputDateByScrollPickerProps) {
  const [draft, setDraft] = useState<Date>(() => new Date(value.getTime()))
  const confirmRef = useRef<HTMLButtonElement | null>(null)
  const dialogId = useMemo(() => `scroll-picker-dialog-${Math.random().toString(36).slice(2)}`, [])

  useEffect(() => {
    if (open) {
      setDraft(new Date(value.getTime()))
    }
  }, [open, value])

  useEffect(() => {
    if (!open) return
    const focusTimer = window.setTimeout(() => {
      confirmRef.current?.focus({ preventScroll: true })
    }, 0)
    return () => {
      window.clearTimeout(focusTimer)
    }
  }, [open])

  const handleOverlayPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) {
      onCancel()
    }
  }

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      onCancel()
    }
  }

  if (!open) {
    return null
  }

  return (
    <div
      className={`scroll-picker-dialog__overlay${className ? ` ${className}` : ''}`}
      role='presentation'
      onPointerDown={handleOverlayPointerDown}
    >
      <div
        className='scroll-picker-dialog'
        role='dialog'
        aria-modal='true'
        aria-labelledby={`${dialogId}-title`}
        onKeyDown={handleKeyDown}
      >
        <div className='scroll-picker-dialog__header'>
          <h2 id={`${dialogId}-title`} className='scroll-picker-dialog__title'>
            {title}
          </h2>
        </div>
        <div className='scroll-picker-dialog__body'>
          <DateScrollPicker
            value={draft}
            onChange={setDraft}
            columns={columns}
            minuteStep={minuteStep}
            minDate={minDate}
            maxDate={maxDate}
          />
        </div>
        <div className='scroll-picker-dialog__footer'>
          <button type='button' className='scroll-picker-dialog__button scroll-picker-dialog__button--cancel' onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type='button'
            className='scroll-picker-dialog__button scroll-picker-dialog__button--confirm'
            onClick={() => onConfirm(new Date(draft.getTime()))}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
