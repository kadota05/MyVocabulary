import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import App from './App'
import Home from './pages/Home'
import Review from './pages/Review'
import Words from './pages/Words'

const root = createRoot(document.getElementById('root')!)
root.render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />}> 
          <Route index element={<Home />} />
          <Route path="/review" element={<Review />} />
          <Route path="/words" element={<Words />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
)
