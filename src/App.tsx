import { Outlet } from 'react-router-dom'
import ToastHost from './components/Toast'
import './styles.css'

export default function App() {
  return (
    <div className="app">
      <div className="container">
        <Outlet />
      </div>
      <ToastHost />
    </div>
  )
}

