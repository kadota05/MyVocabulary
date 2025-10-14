// Utilities to import the first table from a Google Document
// Requires: Google Identity Services (accounts.google.com/gsi/client) and gapi client (apis.google.com/js/api.js)

export type GDocRow = { phrase:string; meaning:string; example?:string; source?:string; date?:string }

declare global {
  interface Window {
    google?: any
    gapi?: any
  }
}

const GAPI_DISCOVERY = 'https://docs.googleapis.com/$discovery/rest?version=v1'

async function getTokenSilently(clientId: string): Promise<boolean> {
  return await new Promise<boolean>((resolve) => {
    try {
      const tokenClient = window.google!.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: 'https://www.googleapis.com/auth/documents.readonly',
        callback: (resp: any) => {
          if (resp && resp.access_token) {
            try { window.gapi!.client.setToken({ access_token: resp.access_token }) } catch {}
            resolve(true)
          } else {
            resolve(false)
          }
        }
      })
      tokenClient.requestAccessToken({ prompt: '' }) // silent if already granted
    } catch {
      resolve(false)
    }
  })
}

export async function ensureGoogleLoaded(clientId: string): Promise<void> {
  // Load scripts lazily
  if (!window.google) await loadScript('https://accounts.google.com/gsi/client')
  if (!window.gapi) await loadScript('https://apis.google.com/js/api.js')
  // Init gapi client
  await new Promise<void>((resolve) => window.gapi.load('client', resolve))
  if (!window.gapi.client) {
    await window.gapi.client.init({})
  }
  await window.gapi.client.load(GAPI_DISCOVERY)
  // Prepare token if missing
  const hasToken = !!(window.gapi.client.getToken && window.gapi.client.getToken())
  if (!hasToken) {
    // First, try silent token (no prompt if user already granted)
    const ok = await getTokenSilently(clientId)
    if (!ok) {
      // Fallback to interactive consent
      await new Promise<void>((resolve, reject) => {
        try {
          let settled = false
          const timer = setTimeout(() => {
            if (!settled) {
              settled = true
              reject(new Error('AUTH_TIMEOUT'))
            }
          }, 90000)
          const tokenClient = window.google.accounts.oauth2.initTokenClient({
            client_id: clientId,
            scope: 'https://www.googleapis.com/auth/documents.readonly',
            callback: (resp: any) => {
              if (settled) return
              settled = true
              clearTimeout(timer)
              if (resp && resp.access_token) {
                try { window.gapi.client.setToken({ access_token: resp.access_token }) } catch {}
                resolve()
              } else {
                const err = resp?.error || 'AUTH_CANCELLED'
                reject(new Error(String(err)))
              }
            }
          })
          tokenClient.requestAccessToken({ prompt: 'consent' })
        } catch (e) { reject(e) }
      })
    }
  }
}

export async function fetchFirstTableRows(documentId: string): Promise<GDocRow[]> {
  const gapi = window.gapi
  const res = await gapi.client.docs.documents.get({ documentId })
  const doc = res.result
  const table = (doc.body?.content || []).find((c:any)=> c.table)?.table
  if (!table) throw new Error('NO_TABLE')
  const rows: GDocRow[] = []
  for (const r of table.tableRows || []){
    const cells = r.tableCells || []
    const getText = (cell:any) => collectText(cell.content)
    const phrase = (getText(cells[0]||{})).trim()
    const meaning = (getText(cells[1]||{})).trim()
    const example = (getText(cells[2]||{})).trim()
    const source = (getText(cells[3]||{})).trim()
    const date = (getText(cells[4]||{})).trim()
    rows.push({ phrase, meaning, example: example||undefined, source: source||undefined, date: date||undefined })
  }
  // Drop header if first row contains header-like names
  if (rows.length){
    const h = `${rows[0].phrase}|${rows[0].meaning}`.toLowerCase()
    if (h.includes('phrase') || h.includes('meaning')) rows.shift()
  }
  return rows
}

function collectText(content:any[]): string {
  if (!Array.isArray(content)) return ''
  const parts:string[] = []
  for (const c of content){
    const p = c.paragraph
    if (!p) continue
    for (const e of p.elements || []){
      if (e.textRun?.content) parts.push(e.textRun.content)
    }
  }
  return parts.join('').replace(/[\r\n]+/g,' ').trim()
}

function loadScript(src: string){
  return new Promise<void>((resolve, reject)=>{
    const s = document.createElement('script')
    s.src = src
    s.async = true
    s.onload = ()=> resolve()
    s.onerror = ()=> reject(new Error('SCRIPT_LOAD_FAILED'))
    document.head.appendChild(s)
  })
}
