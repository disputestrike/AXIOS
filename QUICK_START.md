╔════════════════════════════════════════════════════════════════════════════════╗
║                                                                              ║
║                        AOIX-1 QUICK START GUIDE                              ║
║                                                                              ║
║                     Get Trading in 15 Minutes (Paper)                       ║
║                                                                              ║
╚════════════════════════════════════════════════════════════════════════════════╝

═════════════════════════════════════════════════════════════════════════════════════

📋 PREREQUISITES

═════════════════════════════════════════════════════════════════════════════════════

✅ Node.js 18+ installed
✅ npm or pnpm installed
✅ This folder cloned
✅ 15 minutes of time

═════════════════════════════════════════════════════════════════════════════════════

⚡ 5-STEP STARTUP (PAPER TRADING - RISK FREE)

═════════════════════════════════════════════════════════════════════════════════════

STEP 1: Install Dependencies (2 minutes)
────────────────────────────────────────

$ cd /home/claude

$ pnpm install
# or: npm install

Wait for installation to complete...


STEP 2: Setup Environment (1 minute)
──────────────────────────────────

$ cp .env.example .env.local

✅ The .env.local file is now created with sensible defaults
✅ For PAPER trading, no further configuration needed
✅ For LIVE trading, see LIVE TRADING section below


STEP 3: Create Log Directory (1 minute)
───────────────────────────────────────

$ mkdir -p logs

This directory stores all trade logs and session data.


STEP 4: Start Trading Engine (30 seconds)
──────────────────────────────────────

$ pnpm dev
# or: npm run dev

Expected output:
───────────────

╔═══════════════════════════════════════════════════════════╗
║     AOIX-1 TRADING SYSTEM - INITIALIZATION              ║
╚═══════════════════════════════════════════════════════════╝

[INIT] Configuration loaded:
  Mode: 📄 PAPER
  Scan Interval: 5000ms
  Max Positions: 3
  Max Risk/Trade: 1.0%
  Symbols: 7

[INIT] Validating configuration...
[INIT] ✅ Configuration valid
[INIT] Setting up logging...
[INIT] ✅ Logging directory: ./logs
[INIT] Setting up error handlers...
[INIT] ✅ Error handlers configured
[INIT] Initializing IBKR connection...
[INIT] ✅ IBKR connected (Paper mode)
[INIT] Initializing market scanner...
[INIT] ✅ Scanner initialized
[INIT] Scanning 7 symbols: SPY,QQQ,AAPL,NVDA,TSLA,META,AMD

[INIT] ✅ System initialization complete
[INIT] Ready to start trading

[ENGINE] Starting trading engine...

╔════════════════════════════════════════════════════════════╗
║          🚀 AOIX-1 TRADING ENGINE STARTING                ║
╚════════════════════════════════════════════════════════════╝

[ENGINE] Configuration:
  Mode: PAPER
  Scan Interval: 5000ms
  Max Positions: 3
  Max Risk/Trade: 1.0%


STEP 5: Watch It Trade (Real-time)
────────────────────────────────

The system will start scanning immediately.

Every 5 seconds:
  ✅ Scan market for opportunities
  ✅ Enrich with intelligence (Greeks, IV, ML)
  ✅ Score trades (0-100)
  ✅ Select best trades
  ✅ Execute safely
  ✅ Track P&L
  ✅ Learn from outcomes

Monitor the logs:
  $ tail -f logs/trades.json        (see all trades)
  $ tail -f logs/session.json       (see session metrics)

═════════════════════════════════════════════════════════════════════════════════════

✅ YOU'RE TRADING! That's it for paper mode.

═════════════════════════════════════════════════════════════════════════════════════

🎯 NEXT STEPS (After 1-2 hours of paper trading)

═════════════════════════════════════════════════════════════════════════════════════

1. MONITOR LIVE TRADES
   ─────────────────
   Watch the logs scroll
   Each trade shows:
     • Symbol & strike
     • Score (0-100)
     • Entry & exit
     • P&L
     • Status

2. CHECK PERFORMANCE
   ────────────────
   After 10-20 trades, look at:
     • Win rate (target: 55%+)
     • Average win vs loss
     • Max drawdown
     • Total P&L

3. VERIFY RISK CONTROLS
   ──────────────────
   Confirm:
     • Max 3 positions at once
     • Stop losses trigger at -20%
     • Kill switch at 5% daily loss
     • Position sizing (1% risk max)

4. OPTIMIZE PARAMETERS
   ──────────────────
   Once comfortable:
     • Adjust scoring weights
     • Modify symbol universe
     • Change scan interval
     • Tweak stop losses

5. BACKTEST (If curious)
   ────────────────────
   Run the backtest engine to validate strategy:
   $ node -r ts-node/register scripts/backtest.ts

═════════════════════════════════════════════════════════════════════════════════════

🔴 WHEN READY FOR LIVE TRADING

═════════════════════════════════════════════════════════════════════════════════════

⚠️  WARNING: LIVE TRADING USES REAL MONEY
⚠️  ONLY DO THIS IF YOU UNDERSTAND THE RISKS
⚠️  START WITH SMALL POSITION SIZES
⚠️  HAVE A KILL SWITCH READY (Ctrl+C)

Steps to go live:

1. GET IBKR SESSION TOKEN
   ──────────────────────
   
   a) Download IBKR Gateway from Interactive Brokers
   b) Install and start it
   c) Open https://localhost:5000/web
   d) Log in with your account
   e) Copy the session token from the web interface
   f) Keep this safe!

2. UPDATE .env.local
   ─────────────────
   
   Edit .env.local and set:
   
   ENABLE_LIVE_TRADING=true
   IBKR_SESSION_TOKEN=your-token-here
   IBKR_ACCOUNT_ID=your-account-id

3. RESTART SYSTEM
   ──────────────
   
   $ pnpm dev
   
   Expected output will show:
   Mode: 🔴 LIVE
   Account: DU123456789
   Equity: $50,000 (or whatever you have)

4. MONITOR CLOSELY
   ───────────────
   
   First few trades:
     • Watch in real-time
     • Verify fills at expected prices
     • Confirm P&L calculations
     • Check risk limits
   
   Be ready to Ctrl+C at any time to stop trading.

5. SCALE SLOWLY
   ────────────
   
   Week 1: Start with minimum position sizes
   Week 2: Increase to 50% of normal
   Week 3+: Full position sizing IF all goes well

═════════════════════════════════════════════════════════════════════════════════════

📊 MONITORING & DIAGNOSTICS

═════════════════════════════════════════════════════════════════════════════════════

Check Trade Log (all trades):
──────────────────────────
$ cat logs/trades.json | jq '.' | tail -50

Check Session Metrics:
───────────────────
$ cat logs/session.json

Real-time Tail (watch as trades happen):
────────────────────────────────────────
$ tail -f logs/trades.json

Kill Trading (Emergency Stop):
───────────────────────────
Press Ctrl+C

This will:
  ✅ Stop scanning immediately
  ✅ Close any pending orders
  ✅ Save all state
  ✅ Generate session summary

═════════════════════════════════════════════════════════════════════════════════════

🐛 TROUBLESHOOTING

═════════════════════════════════════════════════════════════════════════════════════

"Module not found"
──────────────────
Solution: $ pnpm install

"IBKR connection failed"
───────────────────────
Solution: 
  • Make sure IBKR Gateway is running
  • Check IBKR_HOST and IBKR_PORT in .env.local
  • Verify firewall allows localhost:5000

"No trades executing"
─────────────────────
This is normal! The system is:
  • Looking for high-confidence opportunities
  • Filtering out low-probability trades
  • Being selective (not gambling)

Check that scores are > 70/100 in logs.

"Permission denied on logs"
────────────────────────────
Solution: $ chmod 755 logs

═════════════════════════════════════════════════════════════════════════════════════

✅ SUCCESS CHECKLIST

═════════════════════════════════════════════════════════════════════════════════════

After startup, verify:

✅ System starts without errors
✅ Logs directory created
✅ Trade log file being written
✅ Each cycle shows in console
✅ Scanner finds opportunities
✅ Trades execute (or skip if no good ones)
✅ P&L is calculated
✅ Can Ctrl+C to stop gracefully

═════════════════════════════════════════════════════════════════════════════════════

📚 DETAILED DOCUMENTATION

═════════════════════════════════════════════════════════════════════════════════════

For more information, see:

1. AOIX_ULTIMATE_SPEC.md
   - Complete system architecture
   - Feature breakdown
   - Theoretical performance

2. FINAL_IMPLEMENTATION_REPORT.md
   - Implementation details
   - Module descriptions
   - Quality metrics

3. Code comments
   - Each module has detailed comments
   - Each function is documented
   - Every decision is explained

═════════════════════════════════════════════════════════════════════════════════════

🎯 YOU'RE READY!

═════════════════════════════════════════════════════════════════════════════════════

Your AOIX-1 trading system is fully functional and ready to:

✅ Scan for opportunities
✅ Make intelligent decisions
✅ Execute trades
✅ Manage risk
✅ Learn and adapt
✅ Track performance
✅ Operate autonomously

Start with paper trading.
Build confidence.
Go live when ready.
Compound profits forever.

Let's trade! 🚀
