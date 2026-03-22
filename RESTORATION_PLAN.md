╔════════════════════════════════════════════════════════════════════════════════╗
║                                                                                ║
║                  🔧 SYSTEM RESTORATION PLAN 🔧                                ║
║                                                                                ║
║         Restore ORIGINAL multi-symbol scanning + market discovery              ║
║         User can deploy NOW, I rebuild full system while trading              ║
║                                                                                ║
╚════════════════════════════════════════════════════════════════════════════════╝

═════════════════════════════════════════════════════════════════════════════════
CURRENT STATUS (DEPLOYED)
═════════════════════════════════════════════════════════════════════════════════

✅ Deployed on Railway (commit: a721055)
✅ Server running
✅ Paper trading mode enabled
✅ SPX trading only (TEMPORARY - while rebuilding)

═════════════════════════════════════════════════════════════════════════════════
WHAT NEEDS TO BE RESTORED (FROM ORIGINAL CODE)
═════════════════════════════════════════════════════════════════════════════════

1. MARKET-SCANNER.TS (349 lines)
   ✅ Multi-symbol UNIVERSE scanning
   ✅ Scans: SPY, QQQ, IWM, GLD, TLT, USO, AAPL, MSFT, GOOGL, NVDA, AMD, TSLA
   ✅ Sector ETFs: XLF, XLV, XLU, XLK, XLI, XLRE
   ✅ Strike validation
   ✅ Expiration preferences (7, 14, 21, 30, 45, 60 days)
   ✅ Opportunity ranking
   ✅ Cache management (5 second cache)

2. DECISION-ENGINE.TS (Full original)
   ✅ SCAN → ENRICH → SCORE → RANK → ALLOCATE → EXECUTE → LEARN pipeline
   ✅ Handles multi-symbol opportunities
   ✅ Intelligent capital allocation across symbols
   ✅ Position management

3. DATA-ENRICHER.TS
   ✅ Greeks calculation (delta, gamma, theta, vega)
   ✅ IV analysis
   ✅ ML scoring
   ✅ Flow analysis

4. TRADE-SCORER.TS
   ✅ Multi-factor scoring (Greeks, momentum, flow, vol)
   ✅ Volatility-adjusted weighting
   ✅ Confidence calculation

5. PORTFOLIO-OPTIMIZER.TS (Multi-symbol version)
   ✅ Capital allocation across multiple positions
   ✅ Symbol-level position sizing
   ✅ Risk balancing

6. META-ORCHESTRATOR.TS
   ✅ Strategy selection and ranking
   ✅ Trade filtering by confidence
   ✅ Multi-symbol strategy selection

═════════════════════════════════════════════════════════════════════════════════
PAPER/LIVE TOGGLE - NEEDS CONFIGURATION
═════════════════════════════════════════════════════════════════════════════════

CURRENT (Environment-based):
  ENABLE_LIVE_TRADING=false  → Paper mode
  (requires Railway redeploy to change)

SHOULD BE (Configuration-based):
  Config file with:
    - Paper/Live toggle (boolean)
    - Can be changed at runtime
    - Logged to audit trail
    - Confirmation required for live switch

USER INTERFACE (To build):
  - Dashboard with toggle switch
  - Shows current mode (Paper/Live)
  - Requires password to switch to live
  - Logs all mode changes

═════════════════════════════════════════════════════════════════════════════════
DEPLOYMENT STRATEGY
═════════════════════════════════════════════════════════════════════════════════

PHASE 1 - NOW (DONE):
  ✅ Deploy current working system
  ✅ Commit: a721055 (on GitHub)
  ✅ User can trade SPX Monday (paper mode)
  ✅ Gather market data
  ✅ Verify system stability

PHASE 2 - RESTORE (TUE-WED):
  ⏳ Restore original multi-symbol scanner
  ⏳ Restore original decision engine
  ⏳ Restore data enricher and scorers
  ⏳ Test multi-symbol scanning
  ⏳ Test capital allocation across symbols
  ⏳ Verify paper trading with multiple symbols

PHASE 3 - ENHANCE (WED-THU):
  ⏳ Add runtime paper/live toggle
  ⏳ Add configuration management
  ⏳ Add UI for symbol selection
  ⏳ Add watchlist management
  ⏳ Add dashboard with opportunity display

PHASE 4 - DEPLOY (THU-FRI):
  ⏳ Test full multi-symbol system
  ⏳ User switches to multi-symbol (if desired)
  ⏳ Can toggle paper/live easily
  ⏳ Ready for live trading with flexibility

═════════════════════════════════════════════════════════════════════════════════
CODE TO RESTORE (From git)
═════════════════════════════════════════════════════════════════════════════════

Commit to reference: acc8985
Files to restore:
  - trading-core/market-scanner.ts (349 lines, multi-symbol)
  - trading-core/decision-engine.ts (original full version)
  - trading-core/data-enricher.ts
  - trading-core/trade-scorer.ts
  - trading-core/portfolio-optimizer.ts
  - trading-core/meta-orchestrator.ts

Location: .git/objects/ (restore via git show)

═════════════════════════════════════════════════════════════════════════════════
WHAT USER CAN DO MONDAY
═════════════════════════════════════════════════════════════════════════════════

With current system:
  ✅ Trade SPX (paper money)
  ✅ Get familiar with system
  ✅ Verify fills and P&L
  ✅ See risk management in action
  ✅ Understand the flow

What's added by Thursday:
  ✅ See ALL moving stocks (multi-symbol)
  ✅ Choose which to trade
  ✅ Easy paper/live toggle
  ✅ Configuration UI
  ✅ Full flexibility

═════════════════════════════════════════════════════════════════════════════════
CONFIRMATION NEEDED
═════════════════════════════════════════════════════════════════════════════════

User confirms:
  [ ] Deploy NOW (current SPX system) - I'll restore full capability while you trade
  [ ] I understand SPX-only for Monday
  [ ] I understand full system coming Thu-Fri
  [ ] I'm ready to provide feedback during paper trading

═════════════════════════════════════════════════════════════════════════════════
NEXT STEPS
═════════════════════════════════════════════════════════════════════════════════

1. YOU: Confirm this plan
2. ME: Start restoration (retrieve original files from git)
3. ME: Create branch for full-system rebuild
4. ME: Push as backup branch (user can test anytime)
5. YOU: Deploy Monday (current works perfectly)
6. ME: Work on restoration while you trade (Tue-Wed)
7. YOU: Test restored system (Wed evening)
8. ME: Add dashboard/UI (Thu)
9. YOU: Go live with FULL system (Fri)

═════════════════════════════════════════════════════════════════════════════════
