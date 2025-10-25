import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import App from './App'
import Home from './pages/Home'
import Calendar from './pages/Calendar'
import LeapSession from './pages/LeapSession'
import LeapSetup from './pages/LeapSetup'
import Review from './pages/Review'
import Settings from './pages/Settings'
import Words from './pages/Words'

const root = createRoot(document.getElementById('root')!)
root.render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />}> 
          <Route index element={<Home />} />
          <Route path="/review" element={<Review />} />
          <Route path="/leap" element={<LeapSetup />} />
          <Route path="/leap/session" element={<LeapSession />} />
          <Route path="/words" element={<Words />} />
          <Route path="/calendar" element={<Calendar />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
)
