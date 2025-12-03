import { Settings, MessageCircle } from 'lucide-react'
import { NavLink, useLocation } from 'react-router-dom'

const navItems = [
  {
    to: '/',
    label: 'MYVOCABULARY',
    icon: <MortarboardIcon />
  },
  {
    to: '/leap',
    label: 'Leap',
    icon: <LeapIcon />
  },
  {
    to: '/instant-composition',
    label: '口頭英作文',
    icon: <MessageCircle size={28} strokeWidth={1.6} aria-hidden='true' />
  },
  {
    to: '/settings',
    label: 'Settings',
    icon: <Settings size={28} strokeWidth={1.6} aria-hidden='true' />
  }
]

const visibleRoutes = ['/', '/leap', '/settings', '/instant-composition']

export default function FooterNav() {
  const location = useLocation()
  if (!visibleRoutes.includes(location.pathname)) return null

  return (
    <nav className='footer-nav' aria-label='Primary navigation'>
      {navItems.map(item => (
        <NavLink
          key={item.to}
          to={item.to}
          aria-label={item.label}
          title={item.label}
          className={({ isActive }) =>
            ['footer-nav__item', isActive ? 'footer-nav__item--active' : ''].filter(Boolean).join(' ')
          }
        >
          <span className='footer-nav__icon'>{item.icon}</span>
          <span className='footer-nav__label'>{item.label}</span>
        </NavLink>
      ))}
    </nav>
  )
}

function MortarboardIcon() {
  return (
    <svg
      width='32'
      height='32'
      viewBox='0 0 24 24'
      fill='none'
      stroke='currentColor'
      strokeWidth='1.6'
      strokeLinecap='round'
      strokeLinejoin='round'
      aria-hidden='true'
    >
      <path d='M22 8l-10-5L2 8l10 5 10-5z' />
      <path d='M6 10.7V16a6 3 0 0 0 12 0v-5.3' />
      <path d='M12 13l10-5' />
    </svg>
  )
}

function LeapIcon() {
  return (
    <svg
      width='28'
      height='28'
      viewBox='0 0 24 24'
      fill='none'
      stroke='currentColor'
      strokeWidth='1.6'
      strokeLinecap='round'
      strokeLinejoin='round'
      aria-hidden='true'
    >
      <path d='M4 16.5c0-3.59 2.91-6.5 6.5-6.5H14a5.5 5.5 0 0 1 5.5 5.5' />
      <path d='M4 20h8.5' />
      <path d='M12 4l3-3v6z' />
      <path d='M9.5 12.5l3 3 4-4' />
    </svg>
  )
}
