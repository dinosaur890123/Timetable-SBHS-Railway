import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import './theme/modern.css'
import './theme/colorThemes.css'
import { startAutoUpdate } from './utils/autoUpdate'

if (import.meta.env.PROD) startAutoUpdate()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
