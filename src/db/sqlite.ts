import initSqlJs, { Database, SqlJsStatic } from 'sql.js'
// Use Vite to bundle the wasm and provide a valid URL
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - declared in src/types/static.d.ts
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url'
import { set as idbSet, get as idbGet } from 'idb-keyval'

let SQL: SqlJsStatic | null = null
let db: Database | null = null

const DB_KEY = 'mvocab.sqlite'
const DB_BACKUP_KEY = 'mvocab.sqlite.backup'
const WASM_PATH = '/sql-wasm.wasm'

export async function getDB(): Promise<Database> {
  if (db) return db
  if (!SQL) {
    try {
      SQL = await initSqlJs({ locateFile: () => wasmUrl })
    } catch (e) {
      // Fallback to root path for environments without Vite asset handling
      SQL = await initSqlJs({ locateFile: () => WASM_PATH })
    }
  }
  const saved = await idbGet(DB_KEY)
  let savedBytes: Uint8Array | null = null
  if (saved instanceof Uint8Array) savedBytes = saved
  else if (saved instanceof ArrayBuffer) savedBytes = new Uint8Array(saved)
  else if (saved && ArrayBuffer.isView(saved)) savedBytes = new Uint8Array(saved.buffer)

  if (!savedBytes) {
    const backup = readBackup()
    if (backup) {
      savedBytes = backup
      await idbSet(DB_KEY, savedBytes)
    }
  }

  if (savedBytes) {
    db = new SQL.Database(savedBytes)
  } else {
    db = new SQL.Database()
    const schema = (await fetch('/db/schema.sql').then(r => r.text()))
    db.exec('BEGIN;')
    db.exec(schema)
    db.exec('COMMIT;')
    await persist()
  }
  ensureCalendarSchema(db)
  return db!
}

export async function persist() {
  if (!db) return
  const data = db.export()
  await idbSet(DB_KEY, data)
  writeBackup(data)
}

export function todayYMD(d = new Date()): string {
  const z = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`
}

export type WordRow = {
  id: string
  phrase: string
  meaning: string
  example?: string
  source?: string
  createdAt: string
  updatedAt?: string
}

export type SrsRow = {
  wordId: string
  nextDueDate: string
  intervalDays: number
  stability: number
  reps: number
  lapses: number
  updatedAt?: string
}

export type ImportRow = {
  phrase: string
  meaning?: string
  example?: string
  source?: string
  date?: string
}

export type CalendarEventColor = 'white' | 'green' | 'blue' | 'red' | 'yellow'

export type CalendarEventRow = {
  id: string
  title: string
  memo: string
  color: CalendarEventColor
  dateKey: string
  startMinutes: number
  endMinutes: number
  createdAt: string
  updatedAt: string
}

export type CalendarEventInsert = {
  title: string
  memo?: string
  color: CalendarEventColor
  dateKey: string
  startMinutes: number
  endMinutes: number
}

function uuid() {
  // Simple UUID v4
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (crypto.getRandomValues(new Uint8Array(1))[0] & 15) >> 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

export async function importRows(
  rows: ImportRow[],
  onProgress?: (processed: number, total: number) => void
): Promise<{ added: number; skipped: number; failed: number; }> {
  const d = await getDB()
  const t = todayYMD()
  let added = 0, skipped = 0, failed = 0
  let processed = 0
  try {
    d.exec('BEGIN;')
    const norm = (s: string) => s.trim().toLowerCase()
    const seen = new Set<string>()
    const existing = new Set<string>()
    const rs = d.exec("SELECT phrase FROM words")[0]
    if (rs) {
      for (let i = 0; i < rs.values.length; i++) existing.add(norm(String(rs.values[i][0])))
    }
    const total = rows.length
    const yieldEvery = 50
    for (const r of rows) {
      try {
        const phrase = (r.phrase || '').trim()
        const meaning = (r.meaning || '').trim()
        if (!phrase) { skipped++; continue }
        const key = norm(phrase)
        if (seen.has(key) || existing.has(key)) { skipped++; continue }
        seen.add(key)
        const id = uuid()
        const createdAt = r.date ? new Date(r.date).toISOString() : new Date().toISOString()
        const updatedAt = createdAt
        const nextDueDate = todayYMD(new Date(createdAt))
        d.run(
          'INSERT INTO words (id, phrase, meaning, example, source, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [id, phrase, meaning ?? '', (r.example || '').trim() || null, (r.source || '').trim() || null, createdAt, updatedAt]
        )
        d.run(
          'INSERT INTO srs_state (wordId, nextDueDate, intervalDays, stability, reps, lapses, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [id, nextDueDate, 1, 2.0, 0, 0, updatedAt]
        )
        added++
      } catch {
        failed++
      }
      processed++
      if (onProgress) onProgress(processed, rows.length)
      if (processed % yieldEvery === 0) {
        // Yield back to the event loop so the UI can paint
        await new Promise<void>(r => setTimeout(r))
      }
    }
    d.exec('COMMIT;')
  } catch (e) {
    try { d.exec('ROLLBACK;') } catch { }
    throw e
  } finally {
    await persist()
  }
  return { added, skipped, failed }
}

export type DueCard = WordRow & SrsRow

export async function getDueCards(asOfYMD: string): Promise<DueCard[]> {
  const d = await getDB()
  const q = `
    SELECT w.id, w.phrase, w.meaning, w.example, w.source, w.createdAt, w.updatedAt,
           s.nextDueDate, s.intervalDays, s.stability, s.reps, s.lapses, s.updatedAt as s_updatedAt
    FROM srs_state s
    JOIN words w ON w.id = s.wordId
    WHERE s.nextDueDate <= ?
    ORDER BY s.nextDueDate ASC, w.createdAt ASC
  `
  const stmt = d.prepare(q, [asOfYMD])
  const out: DueCard[] = []
  while (stmt.step()) {
    const row = stmt.getAsObject() as any
    out.push({
      id: row.id, phrase: row.phrase, meaning: row.meaning,
      example: row.example, source: row.source, createdAt: row.createdAt, updatedAt: row.updatedAt,
      wordId: row.id, nextDueDate: row.nextDueDate, intervalDays: row.intervalDays, stability: row.stability,
      reps: row.reps, lapses: row.lapses
    } as DueCard)
  }
  stmt.free()
  return out
}

export type WordWithSrs = WordRow & SrsRow

export async function addWord(
  entry: { phrase: string; meaning?: string; example?: string; source?: string }
): Promise<WordWithSrs> {
  const d = await getDB()
  const phrase = (entry.phrase || '').trim()
  if (!phrase) throw new Error('VALIDATION_EMPTY_PHRASE')
  const meaning = (entry.meaning || '').trim()
  const example = (entry.example || '').trim()
  const source = (entry.source || '').trim()
  const norm = (s: string) => s.trim().toLowerCase()
  const existing = d.exec('SELECT phrase FROM words')
  if (existing[0]) {
    const set = new Set<string>()
    for (const row of existing[0].values) set.add(norm(String(row[0])))
    if (set.has(norm(phrase))) throw new Error('DUPLICATE_PHRASE')
  }
  const id = uuid()
  const nowIso = new Date().toISOString()
  const nextDue = todayYMD()
  d.exec('BEGIN;')
  d.run(
    'INSERT INTO words (id, phrase, meaning, example, source, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [id, phrase, meaning, example || null, source || null, nowIso, nowIso]
  )
  d.run(
    'INSERT INTO srs_state (wordId, nextDueDate, intervalDays, stability, reps, lapses, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [id, nextDue, 1, 2.0, 0, 0, nowIso]
  )
  d.exec('COMMIT;')
  await persist()
  return {
    id,
    phrase,
    meaning,
    example: example || undefined,
    source: source || undefined,
    createdAt: nowIso,
    updatedAt: nowIso,
    wordId: id,
    nextDueDate: nextDue,
    intervalDays: 1,
    stability: 2.0,
    reps: 0,
    lapses: 0
  }
}

export type WordSummary = {
  total: number
  learning: number
  learned: number
  firstCreatedAt: string | null
}

export async function getWordSummary(): Promise<WordSummary> {
  const d = await getDB()
  const stmt = d.prepare(`
    SELECT w.createdAt as createdAt, s.nextDueDate as nextDueDate
    FROM words w
    LEFT JOIN srs_state s ON s.wordId = w.id
  `)
  let total = 0
  let learned = 0
  let firstCreatedAt: string | null = null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const horizon = new Date(today)
  horizon.setDate(horizon.getDate() + 365)
  while (stmt.step()) {
    const row = stmt.getAsObject() as any
    total += 1
    const created = row.createdAt != null ? String(row.createdAt) : null
    if (created && (!firstCreatedAt || created < firstCreatedAt)) {
      firstCreatedAt = created
    }
    const nextDue = row.nextDueDate != null ? String(row.nextDueDate) : null
    if (nextDue && isBeyondHorizon(nextDue, horizon)) {
      learned += 1
    }
  }
  stmt.free()
  const learning = Math.max(0, total - learned)
  return { total, learning, learned, firstCreatedAt }
}

export async function getAllWords(): Promise<WordWithSrs[]> {
  const d = await getDB()
  const q = `
    SELECT w.id, w.phrase, w.meaning, w.example, w.source, w.createdAt, w.updatedAt,
           s.nextDueDate, s.intervalDays, s.stability, s.reps, s.lapses
    FROM words w
    LEFT JOIN srs_state s ON s.wordId = w.id
    ORDER BY w.createdAt ASC, w.phrase COLLATE NOCASE ASC
  `
  const stmt = d.prepare(q)
  const out: WordWithSrs[] = []
  while (stmt.step()) {
    const row = stmt.getAsObject() as any
    out.push({
      id: row.id, phrase: row.phrase, meaning: row.meaning, example: row.example, source: row.source,
      createdAt: row.createdAt, updatedAt: row.updatedAt,
      wordId: row.id, nextDueDate: row.nextDueDate, intervalDays: Number(row.intervalDays || 0),
      stability: Number(row.stability || 0), reps: Number(row.reps || 0), lapses: Number(row.lapses || 0)
    })
  }
  stmt.free()
  return out
}

export async function deleteWord(wordId: string): Promise<void> {
  const d = await getDB()
  const exists = d.exec('SELECT id FROM words WHERE id = ?', [wordId])
  if (!exists[0] || exists[0].values.length === 0) return
  d.exec('BEGIN;')
  try {
    d.run('DELETE FROM review_log WHERE wordId = ?', [wordId])
    d.run('DELETE FROM srs_state WHERE wordId = ?', [wordId])
    d.run('DELETE FROM words WHERE id = ?', [wordId])
    d.exec('COMMIT;')
  } catch (error) {
    try { d.exec('ROLLBACK;') } catch { /* ignore rollback failure */ }
    throw error
  }
  await persist()
}

export async function updateWord(
  wordId: string,
  patch: { phrase?: string; meaning?: string; example?: string | null; source?: string | null }
): Promise<WordRow> {
  const d = await getDB()
  const rs = d.exec('SELECT id, phrase, meaning, example, source, createdAt, updatedAt FROM words WHERE id = ?', [wordId])
  if (!rs[0]) throw new Error('NOT_FOUND')
  const row = rs[0].values[0]
  const current: WordRow = {
    id: String(row[0]), phrase: String(row[1]), meaning: String(row[2]),
    example: row[3] != null ? String(row[3]) : undefined,
    source: row[4] != null ? String(row[4]) : undefined,
    createdAt: String(row[5]), updatedAt: row[6] != null ? String(row[6]) : undefined
  }
  const nextPhrase = (patch.phrase ?? current.phrase).trim()
  const nextMeaning = (patch.meaning ?? current.meaning).trim()
  const nextExample = patch.example === undefined
    ? (current.example ?? '').toString().trim()
    : (patch.example ?? '').toString().trim()
  const nextSource = patch.source === undefined
    ? (current.source ?? '').toString().trim()
    : (patch.source ?? '').toString().trim()
  if (!nextPhrase) throw new Error('VALIDATION_EMPTY_PHRASE')
  // Case-insensitive + trimmed duplicate check excluding self
  const norm = (s: string) => s.trim().toLowerCase()
  const dup = d.exec('SELECT phrase FROM words WHERE id <> ?', [wordId])
  if (dup[0]) {
    const set = new Set<string>()
    for (const v of dup[0].values) set.add(norm(String(v[0])))
    if (set.has(norm(nextPhrase))) throw new Error('DUPLICATE_PHRASE')
  }
  const nowIso = new Date().toISOString()
  d.exec('BEGIN;')
  d.run('UPDATE words SET phrase=?, meaning=?, example=?, source=?, updatedAt=? WHERE id=?',
    [nextPhrase, nextMeaning ?? '', nextExample || null, nextSource || null, nowIso, wordId])
  d.exec('COMMIT;')
  await persist()
  return { ...current, phrase: nextPhrase, meaning: nextMeaning ?? '', example: nextExample || undefined, source: nextSource || undefined, updatedAt: nowIso }
}

export type Grade = 'EASY' | 'NORMAL' | 'HARD'

export function computeIntervalDays(stability: number, targetRetention = 0.9): number {
  const I = Math.round(-stability * Math.log(targetRetention))
  return Math.max(1, I)
}

export async function applyReview(wordId: string, grade: Grade, today: string): Promise<{ newInterval: number; newDue: string; }> {
  const d = await getDB()
  const nowIso = new Date().toISOString()
  const rs = d.exec('SELECT stability, reps, lapses FROM srs_state WHERE wordId = ?', [wordId])
  if (!rs[0]) throw new Error('state not found')
  const vals = rs[0].values[0]
  let stability = Number(vals[0])
  let reps = Number(vals[1])
  let lapses = Number(vals[2])
  let intervalDays = 1
  let nextDue = today
  if (grade === 'EASY') { stability *= 1.25; intervalDays = computeIntervalDays(stability); nextDue = addDays(today, intervalDays) }
  else if (grade === 'NORMAL') { stability *= 1.10; intervalDays = computeIntervalDays(stability); nextDue = addDays(today, intervalDays) }
  else { stability *= 0.85; intervalDays = 0; nextDue = today; lapses += 1 }
  reps += 1
  d.exec('BEGIN;')
  d.run('UPDATE srs_state SET stability=?, intervalDays=?, nextDueDate=?, reps=?, lapses=?, updatedAt=? WHERE wordId=?',
    [stability, intervalDays, nextDue, reps, lapses, nowIso, wordId])
  d.run('UPDATE words SET updatedAt=? WHERE id=?', [nowIso, wordId])
  d.run('INSERT INTO review_log (id, wordId, reviewedAt, grade, newInterval, newDueDate) VALUES (?, ?, ?, ?, ?, ?)',
    [uuid(), wordId, nowIso, grade, intervalDays, nextDue])
  d.exec('COMMIT;')
  await persist()
  return { newInterval: intervalDays, newDue: nextDue }
}

function addDays(ymd: string, days: number) {
  const [y, m, d] = ymd.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + days)
  return todayYMD(new Date(dt))
}

function isBeyondHorizon(nextDue: string, horizon: Date) {
  const dt = parseYMD(nextDue)
  if (!dt) return false
  return dt.getTime() >= horizon.getTime()
}

function parseYMD(ymd: string) {
  if (!ymd) return null
  const parts = ymd.split('-').map(Number)
  if (parts.length !== 3 || parts.some(n => Number.isNaN(n))) return null
  const [y, m, d] = parts
  const dt = new Date(y, m - 1, d)
  if (Number.isNaN(dt.getTime())) return null
  dt.setHours(0, 0, 0, 0)
  return dt
}

const CALENDAR_EVENT_COLORS: readonly CalendarEventColor[] = ['white', 'green', 'blue', 'red', 'yellow']
const CALENDAR_EVENT_COLOR_SET = new Set<CalendarEventColor>(CALENDAR_EVENT_COLORS)
const MINUTES_PER_DAY = 24 * 60

function ensureCalendarSchema(database: Database | null) {
  if (!database) return
  database.exec(`
    CREATE TABLE IF NOT EXISTS calendar_events (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      memo TEXT,
      color TEXT NOT NULL DEFAULT 'white',
      dateKey TEXT NOT NULL,
      startMinutes INTEGER NOT NULL,
      endMinutes INTEGER NOT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
  `)
  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_calendar_events_date ON calendar_events(dateKey, startMinutes);
  `)
  database.exec(`
    CREATE TABLE IF NOT EXISTS calendar_templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      summary TEXT,
      activities TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
  `)
}

function normalizeCalendarColor(color: string | null | undefined): CalendarEventColor {
  if (!color) return 'white'
  const lower = String(color).toLowerCase() as CalendarEventColor
  return CALENDAR_EVENT_COLOR_SET.has(lower) ? lower : 'white'
}

function normalizeCalendarRange(startMinutes: number, endMinutes: number) {
  const safeStart = Math.max(0, Math.min(Math.round(startMinutes), MINUTES_PER_DAY - 1))
  const safeEndRaw = Math.max(safeStart + 1, Math.round(endMinutes))
  const safeEnd = Math.min(safeEndRaw, MINUTES_PER_DAY)
  return { start: safeStart, end: safeEnd }
}

function mapCalendarRow(row: Record<string, unknown>): CalendarEventRow {
  const normalized = normalizeCalendarRange(Number(row.startMinutes ?? 0), Number(row.endMinutes ?? 0))
  return {
    id: String(row.id ?? ''),
    title: String(row.title ?? ''),
    memo: row.memo != null ? String(row.memo) : '',
    color: normalizeCalendarColor(row.color != null ? String(row.color) : undefined),
    dateKey: String(row.dateKey ?? todayYMD()),
    startMinutes: normalized.start,
    endMinutes: normalized.end,
    createdAt: String(row.createdAt ?? new Date().toISOString()),
    updatedAt: String(row.updatedAt ?? new Date().toISOString())
  }
}

export async function getCalendarEvents(): Promise<CalendarEventRow[]> {
  const d = await getDB()
  ensureCalendarSchema(d)
  const stmt = d.prepare(
    `SELECT id, title, memo, color, dateKey, startMinutes, endMinutes, createdAt, updatedAt FROM calendar_events ORDER BY dateKey ASC, startMinutes ASC`
  )
  const events: CalendarEventRow[] = []
  try {
    while (stmt.step()) {
      const row = stmt.getAsObject()
      events.push(mapCalendarRow(row as Record<string, unknown>))
    }
  } finally {
    stmt.free()
  }
  return events
}

export async function insertCalendarEvent(entry: CalendarEventInsert): Promise<CalendarEventRow> {
  const title = entry.title.trim()
  if (!title) throw new Error('CALENDAR_EVENT_MISSING_TITLE')
  const memo = entry.memo?.trim() ?? ''
  const color = normalizeCalendarColor(entry.color)
  const { start, end } = normalizeCalendarRange(entry.startMinutes, entry.endMinutes)
  const nowIso = new Date().toISOString()
  const d = await getDB()
  ensureCalendarSchema(d)
  const id = uuid()
  d.exec('BEGIN;')
  try {
    d.run(
      'INSERT INTO calendar_events (id, title, memo, color, dateKey, startMinutes, endMinutes, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, title, memo || null, color, entry.dateKey, start, end, nowIso, nowIso]
    )
    d.exec('COMMIT;')
  } catch (error) {
    try { d.exec('ROLLBACK;') } catch { /* ignore rollback failure */ }
    throw error
  }
  await persist()
  return {
    id,
    title,
    memo,
    color,
    dateKey: entry.dateKey,
    startMinutes: start,
    endMinutes: end,
    createdAt: nowIso,
    updatedAt: nowIso
  }
}

export async function updateCalendarEventDetails(
  id: string,
  patch: { title?: string; memo?: string; color?: CalendarEventColor }
): Promise<void> {
  const d = await getDB()
  ensureCalendarSchema(d)
  const rs = d.exec('SELECT title, memo, color FROM calendar_events WHERE id = ?', [id])
  if (!rs[0] || rs[0].values.length === 0) return
  const current = rs[0].values[0]
  const nextTitle = (patch.title ?? (current[0] != null ? String(current[0]) : '')).trim()
  if (!nextTitle) throw new Error('CALENDAR_EVENT_MISSING_TITLE')
  const nextMemo = patch.memo !== undefined ? patch.memo.trim() : current[1] != null ? String(current[1]) : ''
  const nextColor = normalizeCalendarColor(
    patch.color !== undefined ? patch.color : current[2] != null ? String(current[2]) : undefined
  )
  const nowIso = new Date().toISOString()
  d.exec('BEGIN;')
  try {
    d.run(
      'UPDATE calendar_events SET title = ?, memo = ?, color = ?, updatedAt = ? WHERE id = ?',
      [nextTitle, nextMemo || null, nextColor, nowIso, id]
    )
    d.exec('COMMIT;')
  } catch (error) {
    try { d.exec('ROLLBACK;') } catch { /* ignore rollback failure */ }
    throw error
  }
  await persist()
}

export async function updateCalendarEventSchedule(
  id: string,
  patch: { dateKey: string; startMinutes: number; endMinutes: number }
): Promise<void> {
  const d = await getDB()
  ensureCalendarSchema(d)
  const { start, end } = normalizeCalendarRange(patch.startMinutes, patch.endMinutes)
  const nowIso = new Date().toISOString()
  d.exec('BEGIN;')
  try {
    d.run(
      'UPDATE calendar_events SET dateKey = ?, startMinutes = ?, endMinutes = ?, updatedAt = ? WHERE id = ?',
      [patch.dateKey, start, end, nowIso, id]
    )
    d.exec('COMMIT;')
  } catch (error) {
    try { d.exec('ROLLBACK;') } catch { /* ignore rollback failure */ }
    throw error
  }
  await persist()
}

export async function deleteCalendarEvent(id: string): Promise<void> {
  const d = await getDB()
  ensureCalendarSchema(d)
  d.exec('BEGIN;')
  try {
    d.run('DELETE FROM calendar_events WHERE id = ?', [id])
    d.exec('COMMIT;')
  } catch (error) {
    try { d.exec('ROLLBACK;') } catch { /* ignore rollback failure */ }
    throw error
  }
  await persist()
}

// Calendar Templates
export type CalendarTemplateRow = {
  id: string
  name: string
  summary: string | null
  activities: string // JSON string
  createdAt: string
  updatedAt: string
}

export type CalendarTemplateInsert = {
  name: string
  summary?: string
  activities: Array<{
    id: string
    label: string
    startTime: string
    endTime: string
    enabled: boolean
  }>
}

export async function getCalendarTemplates(): Promise<CalendarTemplateRow[]> {
  const d = await getDB()
  ensureCalendarSchema(d)
  const stmt = d.prepare(`
    SELECT id, name, summary, activities, createdAt, updatedAt 
    FROM calendar_templates 
    ORDER BY createdAt DESC
  `)
  const templates: CalendarTemplateRow[] = []
  while (stmt.step()) {
    const row = stmt.getAsObject() as {
      id: string
      name: string
      summary: string | null
      activities: string
      createdAt: string
      updatedAt: string
    }
    templates.push(row)
  }
  stmt.free()
  return templates
}

export async function insertCalendarTemplate(entry: CalendarTemplateInsert): Promise<CalendarTemplateRow> {
  const name = entry.name.trim()
  if (!name) throw new Error('CALENDAR_TEMPLATE_MISSING_NAME')
  const summary = entry.summary?.trim() || null
  const activitiesJson = JSON.stringify(entry.activities)
  const nowIso = new Date().toISOString()
  const d = await getDB()
  ensureCalendarSchema(d)
  const id = uuid()
  d.exec('BEGIN;')
  try {
    d.run(
      'INSERT INTO calendar_templates (id, name, summary, activities, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)',
      [id, name, summary, activitiesJson, nowIso, nowIso]
    )
    d.exec('COMMIT;')
  } catch (error) {
    try { d.exec('ROLLBACK;') } catch { /* ignore rollback failure */ }
    throw error
  }
  await persist()
  return {
    id,
    name,
    summary,
    activities: activitiesJson,
    createdAt: nowIso,
    updatedAt: nowIso
  }
}

export async function deleteCalendarTemplate(id: string): Promise<void> {
  const d = await getDB()
  ensureCalendarSchema(d)
  d.exec('BEGIN;')
  try {
    d.run('DELETE FROM calendar_templates WHERE id = ?', [id])
    d.exec('COMMIT;')
  } catch (error) {
    try { d.exec('ROLLBACK;') } catch { /* ignore rollback failure */ }
    throw error
  }
  await persist()
}

function writeBackup(bytes: Uint8Array) {
  if (typeof window === 'undefined' || !window.localStorage) return
  try {
    const base64 = bufferToBase64(bytes)
    window.localStorage.setItem(DB_BACKUP_KEY, base64)
  } catch (error) {
    console.warn('Failed to store backup', error)
  }
}

function readBackup(): Uint8Array | null {
  if (typeof window === 'undefined' || !window.localStorage) return null
  try {
    const base64 = window.localStorage.getItem(DB_BACKUP_KEY)
    if (!base64) return null
    return base64ToBuffer(base64)
  } catch (error) {
    console.warn('Failed to read backup', error)
    return null
  }
}

function bufferToBase64(bytes: Uint8Array) {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    const sub = bytes.subarray(i, i + chunk)
    binary += String.fromCharCode(...sub)
  }
  return btoa(binary)
}

function base64ToBuffer(base64: string) {
  const binary = atob(base64)
  const len = binary.length
  const bytes = new Uint8Array(len)
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

export type MigrationData = {
  words: WordRow[]
  srs_state: SrsRow[]
  review_log: any[]
  calendar_events: CalendarEventRow[]
  calendar_templates: CalendarTemplateRow[]
}

export async function exportFullDB(): Promise<MigrationData> {
  const d = await getDB()

  const words = []
  const r1 = d.exec("SELECT * FROM words")
  if (r1[0]) {
    for (const v of r1[0].values) {
      words.push({
        id: v[0], phrase: v[1], meaning: v[2], example: v[3], source: v[4], createdAt: v[5], updatedAt: v[6]
      } as WordRow)
    }
  }

  const srs_state = []
  const r2 = d.exec("SELECT * FROM srs_state")
  if (r2[0]) {
    for (const v of r2[0].values) {
      srs_state.push({
        wordId: v[0], nextDueDate: v[1], intervalDays: v[2], stability: v[3], reps: v[4], lapses: v[5], updatedAt: v[6]
      } as SrsRow)
    }
  }

  const review_log = []
  const r3 = d.exec("SELECT * FROM review_log")
  if (r3[0]) {
    for (const v of r3[0].values) {
      review_log.push({
        id: v[0], wordId: v[1], reviewedAt: v[2], grade: v[3], newInterval: v[4], newDueDate: v[5]
      })
    }
  }

  const calendar_events = await getCalendarEvents()
  const calendar_templates = await getCalendarTemplates()

  return { words, srs_state, review_log, calendar_events, calendar_templates }
}
