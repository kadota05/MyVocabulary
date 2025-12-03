import { useState, useEffect } from 'react'
import { useStore } from '../state/store'
import { ChevronLeft, Save } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

export default function Settings() {
  const navigate = useNavigate()
  const { geminiApiKey, setGeminiApiKey } = useStore()
  const [keyInput, setKeyInput] = useState(geminiApiKey)
  const [saved, setSaved] = useState(false)
  const isEnvLoaded = !!import.meta.env.VITE_GEMINI_API_KEY

  useEffect(() => {
    setKeyInput(geminiApiKey)
  }, [geminiApiKey])

  const handleSave = () => {
    setGeminiApiKey(keyInput)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="page-screen">
      <header className="home-header">
        <button className="icon-button" onClick={() => navigate(-1)}>
          <ChevronLeft size={24} />
        </button>
        <div className="home-header__brand">Settings</div>
        <div style={{ width: 40 }} />
      </header>

      <div className="page-body" style={{ padding: 16 }}>
        <div className="card" style={{ padding: 16 }}>
          <h2 style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 16, color: 'var(--fg)' }}>Gemini API Settings</h2>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', marginBottom: 8, fontSize: 14, color: 'var(--muted)' }}>
              API Key
            </label>
            <input
              type="password"
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              placeholder="Enter your Gemini API Key"
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: '8px',
                border: '1px solid rgba(51, 65, 85, 0.5)',
                background: 'rgba(30, 41, 59, 0.5)',
                color: 'var(--fg)',
                fontSize: 16
              }}
            />
            <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>
              Get your API key from <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" style={{ color: 'var(--primary)' }}>Google AI Studio</a>
            </p>
            {isEnvLoaded && (
              <p style={{ fontSize: 12, color: '#4ade80', marginTop: 4 }}>
                * Loaded from environment variable (VITE_GEMINI_API_KEY)
              </p>
            )}
          </div>

          <button
            className="btn btn-primary"
            onClick={handleSave}
            style={{ width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8 }}
          >
            <Save size={18} />
            {saved ? 'Saved!' : 'Save Settings'}
          </button>
        </div>
      </div>
    </div>
  )
}
