import React from 'react'
import ReactDOM from 'react-dom/client'
import Dashboard from './components/Dashboard'
import './components/Dashboard.css'

function App() {
  return (
    <div>
      <Dashboard />
    </div>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
