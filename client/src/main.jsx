import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import SeoShellCleanup from './components/SeoShellCleanup.jsx'
import './index.css'
import './theme/modern.css'
import './theme/colorThemes.css'
import './theme/paper.css'
import { startAutoUpdate } from './utils/autoUpdate'

startAutoUpdate()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <SeoShellCleanup>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </SeoShellCleanup>
  </React.StrictMode>,
)
