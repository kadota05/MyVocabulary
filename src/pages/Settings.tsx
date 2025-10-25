import { useState } from 'react'
import { Minus, Plus } from 'lucide-react'
import { useImportSettings } from '~/state/importSettings'

export default function Settings() {
  const { clientId, docId, setClientId, setDocId } = useImportSettings()
  const [open, setOpen] = useState(false)
  const toggle = () => setOpen(o => !o)

  return (
    <div className='page-screen settings-screen'>
      <header className='home-header settings-header'>
        <div className='home-header__brand'>SETTINGS</div>
      </header>
      <main className='page-body settings-body'>
        <div className='settings-cluster'>
          <div className='settings-cluster__label'>MYVOCABULARY</div>
          <section className={`settings-card card ${open ? 'open' : ''}`}>
            <button type='button' className='settings-card__header' onClick={toggle} aria-expanded={open}>
              <div className='settings-card__title-group'>
                <div className='settings-card__title'>Import Setting</div>
                <p className='settings-card__description'>
                  Googleドキュメントから単語を同期するための接続情報を登録してください。
                </p>
              </div>
              {open ? <Minus size={20} strokeWidth={1.6} aria-hidden='true' /> : <Plus size={20} strokeWidth={1.6} aria-hidden='true' />}
            </button>
            <div className='settings-card__content' hidden={!open}>
              <form className='col settings-form' onSubmit={event => event.preventDefault()}>
                <label className='label'>Google OAuth Client ID</label>
                <input
                  className='input'
                  value={clientId}
                  onChange={event => setClientId(event.target.value)}
                  placeholder='xxxxxxxx.apps.googleusercontent.com'
                />
                <label className='label'>Google Document ID</label>
                <input
                  className='input'
                  value={docId}
                  onChange={event => setDocId(event.target.value)}
                  placeholder='1Abc... (ID from Docs URL)'
                />
              </form>
            </div>
          </section>
        </div>
      </main>
    </div>
  )
}
