import { useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import FooterNav from './components/FooterNav'
import ToastHost from './components/Toast'
import './styles.css'

export default function App() {
  const location = useLocation()

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
  }, [location.pathname])

  return (
    <div className="app">
      <div className="container">
        <Outlet />
      </div>
      <FooterNav />
      <ToastHost />
    </div>
  )
}
