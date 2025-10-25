import { Outlet } from 'react-router-dom'
import FooterNav from './components/FooterNav'
import ToastHost from './components/Toast'
import './styles.css'

export default function App() {
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
