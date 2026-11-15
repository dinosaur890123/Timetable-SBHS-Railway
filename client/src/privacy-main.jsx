import React from 'react'
import ReactDOM from 'react-dom/client'
import PublicPrivacyPage from './components/PublicPrivacyPage.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import SeoShellCleanup from './components/SeoShellCleanup.jsx'
import './index.css'
import './theme/modern.css'
import './theme/colorThemes.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <SeoShellCleanup>
      <ErrorBoundary>
        <PublicPrivacyPage />
      </ErrorBoundary>
    </SeoShellCleanup>
  </React.StrictMode>,
)
