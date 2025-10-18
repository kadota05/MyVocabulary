export type LeapWord = {
  heading: number
  phrase: string
  meaning?: string
  example?: string
  source?: string
}

export type LeapOrder = 'random' | 'number'

const CSV_PATH = '/assets/data/Leap_WordList.csv'

let cachedWords: LeapWord[] | null = null

export async function loadLeapWords(): Promise<LeapWord[]> {
  if (cachedWords) return cachedWords
  const response = await fetch(CSV_PATH)
  if (!response.ok) throw new Error('Failed to load Leap word list.')
  const text = await response.text()
  const rows = parseCsv(text)
  if (!rows.length) {
    cachedWords = []
    return cachedWords
  }
  const headers = rows[0].map(h => h.trim().toLowerCase())
  const phraseIdx = headers.findIndex(h => h === 'phrase')
  const meaningIdx = headers.findIndex(h => h === 'meaning')
  const exampleIdx = headers.findIndex(h => h === 'example')
  const sourceIdx = headers.findIndex(h => h === 'source')

  const words: LeapWord[] = []
  for (let i = 1; i < rows.length; i += 1) {
    const row = rows[i]
    const phrase = safeCell(row, phraseIdx)
    if (!phrase) continue
    const meaning = safeCell(row, meaningIdx)
    const example = safeCell(row, exampleIdx)
    const source = safeCell(row, sourceIdx)
    words.push({
      heading: extractHeading(source, i),
      phrase,
      meaning: meaning || undefined,
      example: example || undefined,
      source: source || undefined
    })
  }
  cachedWords = words
  return words
}

export async function getLeapWordCount(): Promise<number> {
  const words = await loadLeapWords()
  if (!words.length) return 0
  return words.reduce((max, word) => (word.heading > max ? word.heading : max), 0)
}

export async function getLeapWordsInRange(start: number, end: number): Promise<LeapWord[]> {
  const words = await loadLeapWords()
  if (!words.length) return []
  const maxHeading = words.reduce((max, word) => (word.heading > max ? word.heading : max), 0)
  if (maxHeading <= 0) return []
  const normalizedStart = clampBound(start, maxHeading)
  const normalizedEnd = clampBound(end, maxHeading)
  if (normalizedStart > normalizedEnd) return []
  const filtered = words
    .filter(word => word.heading >= normalizedStart && word.heading <= normalizedEnd)
    .sort((a, b) => a.heading - b.heading)
  return filtered.map(word => ({ ...word }))
}

function safeCell(row: string[], idx: number): string {
  if (idx < 0 || idx >= row.length) return ''
  return row[idx]?.trim() ?? ''
}

function extractHeading(source: string | undefined, fallback: number): number {
  if (source) {
    const match = source.match(/(\d+)(?!.*\d)/)
    if (match) {
      const value = Number.parseInt(match[1], 10)
      if (Number.isFinite(value) && value > 0) return value
    }
  }
  return fallback
}

function clampBound(value: number, max: number): number {
  if (!Number.isFinite(value)) return 1
  const n = Math.floor(value)
  if (n < 1) return 1
  if (n > max) return max
  return n
}

function parseCsv(input: string): string[][] {
  const rows: string[][] = []
  let current: string[] = []
  let field = ''
  let insideQuotes = false

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i]
    const next = input[i + 1]

    if (char === '"') {
      if (insideQuotes && next === '"') {
        field += '"'
        i += 1
      } else {
        insideQuotes = !insideQuotes
      }
      continue
    }

    if (char === ',' && !insideQuotes) {
      current.push(field)
      field = ''
      continue
    }

    if ((char === '\n' || char === '\r') && !insideQuotes) {
      if (char === '\r' && next === '\n') i += 1
      current.push(field)
      field = ''
      if (current.length > 0 && !(current.length === 1 && current[0] === '')) rows.push(current)
      current = []
      continue
    }

    field += char
  }

  current.push(field)
  if (current.length > 1 || (current.length === 1 && current[0] !== '')) rows.push(current)
  return rows
}
