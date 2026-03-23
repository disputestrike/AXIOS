import React, { useState, useEffect } from 'react'
import './Dashboard.css'

interface Opportunity {
  id: string
  symbol: string
  strike: number
  expiry: string
  optionType: 'CALL' | 'PUT'
  score: number
  confidence: number
  expectedMove: number
  signal: string
}

interface Position {
  symbol: string
  strike: number
  entryPrice: number
  currentPrice: number
  pnl: number
  pnlPercent: number
}

interface SystemConfig {
  symbols: string[]
  positionSize: number
  dailyLossLimit: number
  strategy: string
}

export default function Dashboard() {
  const [mode, setMode] = useState<'PAPER' | 'LIVE'>('PAPER')
  const [opportunities, setOpportunities] = useState<Opportunity[]>([])
  const [positions, setPositions] = useState<Position[]>([])
  const [config, setConfig] = useState<SystemConfig>({
    symbols: ['SPX', 'SPY', 'QQQ', 'IWM'],
    positionSize: 750,
    dailyLossLimit: 150,
    strategy: 'BALANCED_AGGRESSIVE'
  })
  const [showSettings, setShowSettings] = useState(false)
  const [dayPnL, setDayPnL] = useState(0)
  const [totalPnL, setTotalPnL] = useState(0)

  // Fetch opportunities on load and every 5 seconds
  useEffect(() => {
    const fetchOpportunities = async () => {
      try {
        const response = await fetch('/api/opportunities')
        const data = await response.json()
        setOpportunities(data.opportunities || [])
      } catch (error) {
        console.error('Failed to fetch opportunities:', error)
      }
    }

    fetchOpportunities()
    const interval = setInterval(fetchOpportunities, 5000)
    return () => clearInterval(interval)
  }, [])

  // Fetch positions
  useEffect(() => {
    const fetchPositions = async () => {
      try {
        const response = await fetch('/api/positions')
        const data = await response.json()
        setPositions(data.positions || [])
        setDayPnL(data.dayPnL || 0)
        setTotalPnL(data.totalPnL || 0)
      } catch (error) {
        console.error('Failed to fetch positions:', error)
      }
    }

    fetchPositions()
    const interval = setInterval(fetchPositions, 2000)
    return () => clearInterval(interval)
  }, [])

  const toggleMode = async () => {
    if (mode === 'PAPER' && window.confirm('⚠️ Switch to LIVE TRADING? You will trade with REAL money!')) {
      const newMode = 'LIVE'
      try {
        await fetch('/api/config/mode', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode: newMode })
        })
        setMode(newMode)
      } catch (error) {
        console.error('Failed to switch mode:', error)
      }
    } else if (mode === 'LIVE') {
      try {
        await fetch('/api/config/mode', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode: 'PAPER' })
        })
        setMode('PAPER')
      } catch (error) {
        console.error('Failed to switch mode:', error)
      }
    }
  }

  const executeOpportunity = async (opportunity: Opportunity) => {
    try {
      const response = await fetch('/api/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: opportunity.symbol,
          strike: opportunity.strike,
          type: opportunity.optionType,
          expiry: opportunity.expiry
        })
      })
      const result = await response.json()
      if (result.success) {
        alert(`✅ Order executed: ${opportunity.symbol} ${opportunity.strike}${opportunity.optionType[0]}`)
      }
    } catch (error) {
      console.error('Execution failed:', error)
      alert('❌ Execution failed')
    }
  }

  const updateConfig = async (newConfig: Partial<SystemConfig>) => {
    const updated = { ...config, ...newConfig }
    try {
      await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated)
      })
      setConfig(updated)
      setShowSettings(false)
    } catch (error) {
      console.error('Failed to update config:', error)
    }
  }

  return (
    <div className="dashboard">
      {/* Header */}
      <div className="header">
        <h1>🚀 AOIX-1 Trading System</h1>
        
        {/* Mode Toggle */}
        <div className="mode-toggle">
          <button 
            className={`mode-btn ${mode === 'PAPER' ? 'active' : ''}`}
            onClick={toggleMode}
          >
            📄 Paper Mode
          </button>
          <button 
            className={`mode-btn ${mode === 'LIVE' ? 'active' : ''}`}
            onClick={toggleMode}
          >
            🔴 Live Mode
          </button>
        </div>

        <div className="status">
          <span className={`mode-indicator ${mode}`}>
            {mode === 'PAPER' ? '📄 PAPER TRADING' : '🔴 LIVE TRADING'}
          </span>
          <span className={`pnl ${dayPnL >= 0 ? 'positive' : 'negative'}`}>
            Day P&L: ${dayPnL > 0 ? '+' : ''}{dayPnL.toFixed(2)}
          </span>
          <span className={`pnl ${totalPnL >= 0 ? 'positive' : 'negative'}`}>
            Total P&L: ${totalPnL > 0 ? '+' : ''}{totalPnL.toFixed(2)}
          </span>
        </div>
      </div>

      {/* Main Content */}
      <div className="content">
        {/* Settings Panel */}
        {showSettings && (
          <div className="settings-panel">
            <h2>⚙️ Settings</h2>
            
            <div className="setting">
              <label>Trading Symbols:</label>
              <input
                type="text"
                value={config.symbols.join(', ')}
                onChange={(e) => updateConfig({ symbols: e.target.value.split(',').map(s => s.trim()) })}
              />
              <small>Comma-separated: SPX, SPY, QQQ, IWM, GLD, TLT, AAPL, MSFT, NVDA, AMD, TSLA</small>
            </div>

            <div className="setting">
              <label>Position Size: ${config.positionSize}</label>
              <input
                type="range"
                min="100"
                max="2000"
                step="50"
                value={config.positionSize}
                onChange={(e) => updateConfig({ positionSize: parseInt(e.target.value) })}
              />
            </div>

            <div className="setting">
              <label>Daily Loss Limit: ${config.dailyLossLimit}</label>
              <input
                type="range"
                min="50"
                max="500"
                step="25"
                value={config.dailyLossLimit}
                onChange={(e) => updateConfig({ dailyLossLimit: parseInt(e.target.value) })}
              />
            </div>

            <div className="setting">
              <label>Strategy:</label>
              <select value={config.strategy} onChange={(e) => updateConfig({ strategy: e.target.value })}>
                <option value="BALANCED_AGGRESSIVE">Balanced Aggressive</option>
                <option value="CONSERVATIVE">Conservative</option>
                <option value="AGGRESSIVE">Aggressive</option>
              </select>
            </div>

            <button className="btn-save" onClick={() => setShowSettings(false)}>✅ Save Settings</button>
          </div>
        )}

        {/* Opportunities Section */}
        <div className="opportunities-section">
          <div className="section-header">
            <h2>📊 Opportunities Today</h2>
            <button className="btn-settings" onClick={() => setShowSettings(!showSettings)}>
              {showSettings ? '✕' : '⚙️'} Settings
            </button>
          </div>

          {opportunities.length === 0 ? (
            <div className="no-opportunities">
              <p>🔍 Scanning market... No opportunities found yet</p>
            </div>
          ) : (
            <div className="opportunities-grid">
              {opportunities.map((opp) => (
                <div key={opp.id} className="opportunity-card">
                  <div className="symbol-header">
                    <h3>{opp.symbol} {opp.strike}{opp.optionType[0]}</h3>
                    <span className="expiry">{opp.expiry}</span>
                  </div>

                  <div className="metrics">
                    <div className="metric">
                      <span className="label">Score:</span>
                      <span className="value">{opp.score}/100</span>
                    </div>
                    <div className="metric">
                      <span className="label">Confidence:</span>
                      <span className="value">{(opp.confidence * 100).toFixed(0)}%</span>
                    </div>
                    <div className="metric">
                      <span className="label">Expected Move:</span>
                      <span className={`value ${opp.expectedMove >= 0 ? 'positive' : 'negative'}`}>
                        {opp.expectedMove > 0 ? '+' : ''}{opp.expectedMove.toFixed(2)}%
                      </span>
                    </div>
                  </div>

                  <div className="signal">
                    <span className="signal-label">Signal:</span>
                    <span className="signal-value">{opp.signal}</span>
                  </div>

                  <button 
                    className="btn-execute"
                    onClick={() => executeOpportunity(opp)}
                  >
                    🎯 Execute
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Positions Section */}
        <div className="positions-section">
          <h2>📈 Current Positions</h2>

          {positions.length === 0 ? (
            <div className="no-positions">
              <p>No open positions</p>
            </div>
          ) : (
            <table className="positions-table">
              <thead>
                <tr>
                  <th>Symbol</th>
                  <th>Strike</th>
                  <th>Entry</th>
                  <th>Current</th>
                  <th>P&L</th>
                  <th>%</th>
                </tr>
              </thead>
              <tbody>
                {positions.map((pos, idx) => (
                  <tr key={idx} className={pos.pnl >= 0 ? 'positive' : 'negative'}>
                    <td>{pos.symbol}</td>
                    <td>${pos.strike}</td>
                    <td>${pos.entryPrice.toFixed(2)}</td>
                    <td>${pos.currentPrice.toFixed(2)}</td>
                    <td className={pos.pnl >= 0 ? 'positive' : 'negative'}>
                      ${pos.pnl > 0 ? '+' : ''}{pos.pnl.toFixed(2)}
                    </td>
                    <td className={pos.pnlPercent >= 0 ? 'positive' : 'negative'}>
                      {pos.pnlPercent > 0 ? '+' : ''}{pos.pnlPercent.toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
