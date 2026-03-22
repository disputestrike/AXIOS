╔════════════════════════════════════════════════════════════════════════════════╗
║                                                                              ║
║                        AOIX-1 OPERATIONS MANUAL                              ║
║                                                                              ║
║                    Production Trading Environment Guide                     ║
║                                                                              ║
╚════════════════════════════════════════════════════════════════════════════════╝

═════════════════════════════════════════════════════════════════════════════════════

TABLE OF CONTENTS

═════════════════════════════════════════════════════════════════════════════════════

1. Daily Operations
2. Monitoring & Alerts
3. Risk Management
4. Incident Response
5. Maintenance & Scaling
6. Documentation & Logs

═════════════════════════════════════════════════════════════════════════════════════

1. DAILY OPERATIONS

═════════════════════════════════════════════════════════════════════════════════════

BEFORE MARKET OPEN (8:00 AM EST)
─────────────────────────────────

STEP 1: System Health Check (5 minutes)
  □ SSH into trading server
  □ Check disk space: df -h (ensure > 10GB free)
  □ Check CPU: top (ensure < 80% usage)
  □ Check memory: free -h (ensure > 2GB available)
  □ Check logs: tail -100 logs/error.log

STEP 2: Process Status (2 minutes)
  □ Verify app is running: ps aux | grep pnpm
  □ Verify IBKR connection: tail logs/session.json | grep "IBKR_STATUS"
  □ Verify database connection: tail logs/error.log | grep -i database

STEP 3: Configuration Review (2 minutes)
  □ Check .env.local is loaded: cat .env.local | grep LIVE
  □ Verify ENABLE_LIVE_TRADING=true
  □ Verify account ID matches production
  □ Verify risk limits are correct (5% daily loss, 5% per trade)

STEP 4: Warm-up Run (3 minutes)
  □ Run market scanner: curl localhost:5000/api/scan
  □ Verify data flow: Check logs/trades.json is updating
  □ Confirm scoring working: Check top 10 opportunities logged

If any failures → Rollback to backup and investigate

DURING MARKET HOURS (9:30 AM - 4:00 PM EST)
──────────────────────────────────────────

EVERY 30 MINUTES:
  □ Check for alerts: grep "ALERT\|ERROR\|WARN" logs/session.json
  □ Verify trades executing: tail -20 logs/trades.json
  □ Check P&L trend: tail -1 logs/session.json | jq '.metrics.daily_pnl'
  □ Confirm win rate: tail -1 logs/session.json | jq '.metrics.win_rate'

HOURLY:
  □ Review daily metrics: cat logs/session.json | tail -50
  □ Check for anomalies: grep "anomaly\|unusual" logs/analysis.log
  □ Verify no memory leaks: ps aux | grep pnpm | grep -o "RES [0-9]*"

ON KILL SWITCH ACTIVATION (Daily loss > 5%):
  □ Stop new trades immediately (automatic)
  □ Close out high-risk positions (manual if needed)
  □ Document reason in logs
  □ Notify stakeholders
  □ Do NOT override kill switch

AFTER MARKET CLOSE (4:00 PM EST)
────────────────────────────────

STEP 1: Position Review (10 minutes)
  □ Get all open positions: tail logs/session.json | jq '.positions'
  □ Calculate overnight risk: (position_count × avg_size × avg_iv)
  □ Close if overnight risk > 3%
  □ Log all closed positions

STEP 2: Daily Report (5 minutes)
  □ Generate session report: node scripts/daily-report.ts
  □ Record metrics: trades, win_rate, profit_factor, sharpe
  □ Note any unusual activity
  □ Archive logs: cp logs/session.json archives/session-$(date +%Y%m%d).json

STEP 3: Backups (2 minutes)
  □ Backup trade database: mysqldump aoix1_live > backups/aoix1-$(date +%Y%m%d).sql
  □ Backup logs: tar -czf backups/logs-$(date +%Y%m%d).tar.gz logs/
  □ Verify backups exist: ls -lh backups/ | tail -5

STEP 4: Next Day Prep (5 minutes)
  □ Reset daily metrics: node scripts/reset-daily.ts
  □ Clear old logs: find logs -mtime +30 -delete
  □ Verify kill switch reset: grep "daily_loss_reset" logs/system.log
  □ Confirm system ready for next day

═════════════════════════════════════════════════════════════════════════════════════

2. MONITORING & ALERTS

═════════════════════════════════════════════════════════════════════════════════════

REAL-TIME MONITORING
────────────────────

Watch trade execution in real-time:
  $ tail -f logs/trades.json | jq '.[] | {symbol: .symbol, pnl: .pnl}'

Watch session metrics:
  $ watch -n 5 'tail -1 logs/session.json | jq ".metrics"'

Watch system health:
  $ watch -n 10 'echo "CPU:"; top -bn1 | grep "Cpu(s)"; echo "Memory:"; free -h'

ALERT TYPES & RESPONSES
───────────────────────

🟡 YELLOW ALERT (Daily loss > 2.5%)
   Status: Position size reduced to 50%
   Action: Monitor closely, no manual action needed
   Response time: Immediate (automatic)

🟠 ORANGE ALERT (Daily loss > 3.75%)
   Status: Position size reduced to 25%
   Action: Review recent trades, consider system adjustment
   Response time: 5 minutes

🔴 RED ALERT (Daily loss ≥ 5%)
   Status: Kill switch ACTIVE, no new trades
   Action: IMMEDIATE manual review
   Response time: < 1 minute
   Procedure:
     1. Check most recent loss (grep "ALERT" logs/session.json | tail -1)
     2. Identify losing trades
     3. Determine if system malfunction or bad setup
     4. Document incident
     5. Notify team
     6. Plan recovery

⚠️  SYSTEM ALERT (Error/Crash)
   Status: System may be down
   Action: IMMEDIATE intervention
   Response time: < 30 seconds
   Procedure:
     1. Check process: ps aux | grep pnpm
     2. Check logs: tail -50 logs/error.log
     3. Restart if needed: pnpm dev
     4. Verify recovery: Check logs/trades.json updates
     5. Document downtime

═════════════════════════════════════════════════════════════════════════════════════

3. RISK MANAGEMENT

═════════════════════════════════════════════════════════════════════════════════════

DAILY RISK LIMITS
─────────────────

Hard Limits (ENFORCED):
  □ Maximum daily loss: 5% of account ($5,000 on $100K)
  □ Maximum trades per day: 50
  □ Maximum position size: 5% of account ($5,000 on $100K)
  □ Maximum total exposure: 30% of account ($30,000 on $100K)

Soft Limits (WARNINGS):
  □ Yellow alert: Daily loss > 2.5% (position size → 50%)
  □ Orange alert: Daily loss > 3.75% (position size → 25%)
  □ Red alert: Daily loss = 5% (kill switch activated)

Risk Checks (Every Trade):
  □ Position size ≤ 5%
  □ Total exposure ≤ 30%
  □ Strike validation (delta 0.35-0.65, vol > 800, OI > 1500)
  □ ML score ≥ 0.70
  □ Spread < 3%

POSITION MANAGEMENT
───────────────────

Monitoring Open Positions:
  $ psql aoix1_live -c "SELECT symbol, entry_price, current_price, pnl FROM positions WHERE status='OPEN';"

Closing High-Risk Positions:
  1. Identify at-risk position: grep "HIGH_RISK" logs/analysis.log
  2. Calculate current P&L: (exit_price - entry_price) × quantity
  3. Evaluate: Close if P&L < -2% of trade risk budget
  4. Execute close: POST /api/close-position {trade_id}
  5. Log closure: Record in logs/manual-actions.log

Correlation Checks:
  - System avoids correlated positions (> 80%)
  - If forced: Close smaller position
  - Monitor: grep "CORRELATION" logs/system.log

═════════════════════════════════════════════════════════════════════════════════════

4. INCIDENT RESPONSE

═════════════════════════════════════════════════════════════════════════════════════

SYSTEM CRASH/OUTAGE
───────────────────

Immediate (< 1 minute):
  1. Check if process is running: ps aux | grep pnpm
  2. Check logs for error: tail -100 logs/error.log
  3. Check disk space: df -h
  4. Check IBKR connection: curl -k https://localhost:5000/api/health

Recovery Steps:
  1. If process crashed: pnpm dev (restart)
  2. If disk full: Delete old logs (find logs -mtime +30 -delete)
  3. If IBKR down: Wait 5 min, then reconnect
  4. If database error: Check MySQL: systemctl status mysql

After Recovery:
  1. Verify trades resuming: Check logs/trades.json timestamps
  2. Check for missed opportunities: Query missed_scans log
  3. Document incident: Record in incidents.log
  4. Notify team: Send incident report

EXCESSIVE LOSSES (> 3% in one hour)
───────────────────────────────────

Immediate:
  1. Reduce position size manually: LIVE_SIZE_FACTOR=0.25
  2. Review last 10 trades: tail -10 logs/trades.json
  3. Check if pattern exists: grep "symbol" logs/trades.json | uniq -c
  4. Determine cause: Market shift? System malfunction?

Investigation:
  1. Check scorer working: verify weights recent
  2. Check execution working: verify fill quality
  3. Check risk working: verify position limits
  4. Compare to baseline: Check performance metrics

Decision:
  □ If system malfunction: Rollback to previous version
  □ If market shift: Adjust parameters and continue
  □ If unclear: Reduce to 25% size and monitor

ANOMALOUS TRADE SEQUENCE (Win rate drops suddenly)
──────────────────────────────────────────────────

Investigation:
  1. Get recent trades: tail -50 logs/trades.json > recent_trades.json
  2. Analyze characteristics: jq '.[] | {score, winrate}' recent_trades.json
  3. Check filters: Are filters still appropriate?
  4. Check scoring: Did weights change?
  5. Check market: Did volatility spike?

Diagnosis:
  □ Low score trades getting through? → Increase filter threshold
  □ Weights misaligned? → Check learning-engine output
  □ Market regime change? → Adjust volatility parameters
  □ System error? → Check error logs

Resolution:
  1. Implement fix (parameter adjustment or code change)
  2. Test in paper trading for 1 hour
  3. Resume live trading with 50% size
  4. Document change and rationale

═════════════════════════════════════════════════════════════════════════════════════

5. MAINTENANCE & SCALING

═════════════════════════════════════════════════════════════════════════════════════

WEEKLY MAINTENANCE
──────────────────

Every Sunday Evening (Before market week):
  □ Run full system diagnostics: node scripts/system-diagnostics.ts
  □ Backup all data: tar -czf backups/weekly-$(date +%Y%m%d).tar.gz
  □ Review logs for issues: grep "ERROR\|WARN" logs/error.log > review.txt
  □ Verify all integrations: Test IBKR, DB, alerting
  □ Check disk usage: Cleanup old files if > 80% full

MONTHLY REVIEW
──────────────

First Monday of Month:
  □ Review monthly performance: win_rate, profit_factor, sharpe
  □ Compare to baseline: vs previous month, vs expected
  □ Analyze top/bottom performers: Which symbols/strategies best
  □ Identify improvements: Did upgrades deliver expected gains?
  □ Plan adjustments: Parameter tuning, new strategies
  □ Document findings: Create monthly report

QUARTERLY SCALING
──────────────────

Every 3 Months:
  □ Review account growth: Current equity vs starting
  □ Adjust position sizes if equity increased 10%+
  □ Add new symbols if performance allows (top 5 only)
  □ Optimize parameters based on 3-month data
  □ Plan next upgrades/improvements
  □ Document changes for audit trail

═════════════════════════════════════════════════════════════════════════════════════

6. DOCUMENTATION & LOGS

═════════════════════════════════════════════════════════════════════════════════════

LOG FILES
─────────

logs/trades.json
  • Every executed trade
  • Entry/exit price, P&L, timestamp
  • Read with: cat logs/trades.json | jq

logs/session.json
  • Daily metrics: win_rate, profit_factor, sharpe
  • Cumulative stats
  • Updated every hour
  • Read with: jq '.metrics' logs/session.json

logs/error.log
  • All errors and exceptions
  • System failures
  • Read with: tail -50 logs/error.log

logs/system.log
  • System events (startup, shutdown, resets)
  • Risk limit changes
  • Kill switch events
  • Read with: grep "keyword" logs/system.log

ARCHIVING
─────────

Daily (Automatic):
  • Old logs moved to archives/
  • Kept for 90 days
  • Compressed to save space

Query Historical Data:
  $ ls -lh archives/logs-2026-03-*.tar.gz
  $ tar -xzf archives/logs-2026-03-01.tar.gz
  $ jq '.metrics' archives/session-2026-03-01.json

═════════════════════════════════════════════════════════════════════════════════════

QUICK REFERENCE COMMANDS

═════════════════════════════════════════════════════════════════════════════════════

# Start trading
$ pnpm dev

# Check status
$ tail -f logs/trades.json

# Get today's P&L
$ jq '.metrics.daily_pnl' logs/session.json

# Get win rate
$ jq '.metrics.win_rate' logs/session.json

# Emergency stop
$ pkill -f "pnpm dev"

# Restart
$ pnpm dev

# View alerts
$ grep "ALERT" logs/session.json

# View errors
$ grep "ERROR" logs/error.log

# Backup
$ tar -czf backup-$(date +%Y%m%d).tar.gz logs/ .env.local

# Restore
$ tar -xzf backup-*.tar.gz

═════════════════════════════════════════════════════════════════════════════════════

ESCALATION PROTOCOL

═════════════════════════════════════════════════════════════════════════════════════

Level 1 (System Alert / Performance Issue):
  • Incident duration: < 1 minute
  • Action: Automatic / Manual investigation
  • Notify: On-duty operator
  • Response time: < 5 minutes

Level 2 (Kill Switch / Excessive Loss):
  • Incident duration: 1-30 minutes
  • Action: Manual intervention required
  • Notify: Operations manager + risk manager
  • Response time: < 2 minutes

Level 3 (System Outage / Data Loss):
  • Incident duration: > 30 minutes
  • Action: Emergency procedures / recovery
  • Notify: All stakeholders + leadership
  • Response time: < 1 minute

═════════════════════════════════════════════════════════════════════════════════════
