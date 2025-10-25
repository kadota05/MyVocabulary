import { Settings } from 'lucide-react'
import { NavLink, useLocation } from 'react-router-dom'

const navItems = [
  {
    to: '/',
    label: 'MYVOCABULARY',
    icon: <MortarboardIcon />
  },
  {
    to: '/calendar',
    label: 'Calendar',
    icon: <CalendarIcon />
  },
  {
    to: '/settings',
    label: 'Settings',
    icon: <Settings size={28} strokeWidth={1.6} aria-hidden='true' />
  }
]

const visibleRoutes = ['/', '/calendar', '/settings']

export default function FooterNav() {
  const location = useLocation()
  if (!visibleRoutes.includes(location.pathname)) return null

  return (
    <nav className='footer-nav' aria-label='Primary navigation'>
      {navItems.map(item => (
        <NavLink
          key={item.to}
          to={item.to}
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

function CalendarIcon() {
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
      <rect x='3.5' y='4.5' width='17' height='16' rx='2.5' />
      <line x1='8' y1='3' x2='8' y2='6.5' />
      <line x1='16' y1='3' x2='16' y2='6.5' />
      <line x1='3.5' y1='9.5' x2='20.5' y2='9.5' />
      <path d='M8.25 13h.01' />
      <path d='M12 13h.01' />
      <path d='M15.75 13h.01' />
      <path d='M8.25 16.5h.01' />
      <path d='M12 16.5h.01' />
      <path d='M15.75 16.5h.01' />
    </svg>
  )
}
