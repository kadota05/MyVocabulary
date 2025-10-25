import { create } from 'zustand'

const CLIENT_ID_KEY = 'gclient_id'
const DOC_ID_KEY = 'gdoc_id'

type ImportSettingsState = {
  clientId: string
  docId: string
  setClientId: (value: string) => void
  setDocId: (value: string) => void
}

const readStorage = (key: string) => {
  if (typeof window === 'undefined') return ''
  try {
    return localStorage.getItem(key) ?? ''
  } catch {
    return ''
  }
}

const writeStorage = (key: string, value: string) => {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(key, value)
  } catch {
    // ignore storage failures (e.g., private mode)
  }
}

export const useImportSettings = create<ImportSettingsState>((set) => ({
  clientId: readStorage(CLIENT_ID_KEY),
  docId: readStorage(DOC_ID_KEY),
  setClientId: (value: string) => {
    writeStorage(CLIENT_ID_KEY, value)
    set({ clientId: value })
  },
  setDocId: (value: string) => {
    writeStorage(DOC_ID_KEY, value)
    set({ docId: value })
  }
}))
