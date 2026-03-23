# PHASE 1: RESTORE BACKEND (TODAY)

## Files to Restore from Original (commit: acc8985)

✅ trading-core/market-scanner-restored.ts (349 lines)
  - Multi-symbol universe: SPY, QQQ, IWM, GLD, TLT, USO, AAPL, MSFT, GOOGL, NVDA, AMD, TSLA, XLF, XLV, XLU, XLK, XLI, XLRE
  - Strike validation
  - Expiration preferences
  - Opportunity ranking
  
⏳ trading-core/decision-engine-original.ts
  - Full decision pipeline
  - Handles multiple opportunities
  
⏳ trading-core/data-enricher-original.ts
  - Greeks calculation
  - IV analysis
  - Multi-symbol support
  
⏳ trading-core/trade-scorer-original.ts
  - Multi-factor scoring
  - Volatility adjustment
  
⏳ trading-core/portfolio-optimizer-original.ts
  - Multi-symbol capital allocation
  - Risk balancing
  
⏳ trading-core/meta-orchestrator-original.ts
  - Strategy selection
  - Trade filtering

Status: RESTORING NOW
