import initSqlJs, { Database, SqlJsStatic } from 'sql.js'
// Use Vite to bundle the wasm and provide a valid URL
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - declared in src/types/static.d.ts
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url'
import { set as idbSet, get as idbGet } from 'idb-keyval'

let SQL: SqlJsStatic | null = null
let db: Database | null = null

const DB_KEY = 'mvocab.sqlite'
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
  if (saved) {
    db = new SQL.Database(new Uint8Array(saved as ArrayBuffer))
  } else {
    db = new SQL.Database()
    const schema = (await fetch('/db/schema.sql').then(r=>r.text()))
    db.exec('BEGIN;')
    db.exec(schema)
    db.exec('COMMIT;')
    await persist()
  }
  return db!
}

export async function persist(){
  if (!db) return
  const data = db.export()
  await idbSet(DB_KEY, data)
}

export function todayYMD(d = new Date()): string {
  const z = (n:number)=> String(n).padStart(2,'0')
  return `${d.getFullYear()}-${z(d.getMonth()+1)}-${z(d.getDate())}`
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

function uuid(){
  // Simple UUID v4
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (crypto.getRandomValues(new Uint8Array(1))[0] & 15) >> 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

export async function importRows(
  rows: ImportRow[],
  onProgress?: (processed:number, total:number) => void
): Promise<{added:number; skipped:number; failed:number;}> {
  const d = await getDB()
  const t = todayYMD()
  let added=0, skipped=0, failed=0
  let processed = 0
  try{
    d.exec('BEGIN;')
    const norm = (s:string)=> s.trim().toLowerCase()
    const seen = new Set<string>()
    const existing = new Set<string>()
    const rs = d.exec("SELECT phrase FROM words")[0]
    if (rs) {
      for (let i=0;i<rs.values.length;i++) existing.add(norm(String(rs.values[i][0])))
    }
    const total = rows.length
    const yieldEvery = 50
    for (const r of rows){
      try{
        const phrase = (r.phrase||'').trim()
        const meaning = (r.meaning||'').trim()
        if (!phrase){ skipped++; continue }
        const key = norm(phrase)
        if (seen.has(key) || existing.has(key)){ skipped++; continue }
        seen.add(key)
        const id = uuid()
        const createdAt = r.date ? new Date(r.date).toISOString() : new Date().toISOString()
        const updatedAt = createdAt
        const nextDueDate = todayYMD(new Date(createdAt))
        d.run(
          'INSERT INTO words (id, phrase, meaning, example, source, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [id, phrase, meaning ?? '', (r.example||'').trim() || null, (r.source||'').trim() || null, createdAt, updatedAt]
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
  } catch(e){
    try{ d.exec('ROLLBACK;') }catch{}
    throw e
  } finally {
    await persist()
  }
  return {added, skipped, failed}
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
  while (stmt.step()){
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
  while (stmt.step()){
    const row = stmt.getAsObject() as any
    out.push({
      id: row.id, phrase: row.phrase, meaning: row.meaning, example: row.example, source: row.source,
      createdAt: row.createdAt, updatedAt: row.updatedAt,
      wordId: row.id, nextDueDate: row.nextDueDate, intervalDays: Number(row.intervalDays||0),
      stability: Number(row.stability||0), reps: Number(row.reps||0), lapses: Number(row.lapses||0)
    })
  }
  stmt.free()
  return out
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
  const nextExample = (patch.example ?? current.example ?? '').toString().trim()
  const nextSource = (patch.source ?? current.source ?? '').toString().trim()
  if (!nextPhrase) throw new Error('VALIDATION_EMPTY_PHRASE')
  // Case-insensitive + trimmed duplicate check excluding self
  const norm = (s:string)=> s.trim().toLowerCase()
  const dup = d.exec('SELECT phrase FROM words WHERE id <> ?', [wordId])
  if (dup[0]){
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

export type Grade = 'EASY'|'NORMAL'|'HARD'

export function computeIntervalDays(stability: number, targetRetention=0.9): number {
  const I = Math.round(-stability * Math.log(targetRetention))
  return Math.max(1, I)
}

export async function applyReview(wordId: string, grade: Grade, today: string): Promise<{newInterval:number; newDue:string;}> {
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
  d.run('UPDATE words SET updatedAt=? WHERE id=?',[nowIso, wordId])
  d.run('INSERT INTO review_log (id, wordId, reviewedAt, grade, newInterval, newDueDate) VALUES (?, ?, ?, ?, ?, ?)',
    [uuid(), wordId, nowIso, grade, intervalDays, nextDue])
  d.exec('COMMIT;')
  await persist()
  return { newInterval: intervalDays, newDue: nextDue }
}

function addDays(ymd:string, days:number){
  const [y,m,d] = ymd.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m-1, d))
  dt.setUTCDate(dt.getUTCDate()+days)
  return todayYMD(new Date(dt))
}
