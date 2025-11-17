export function parseCsv(input: string): string[][] {
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
