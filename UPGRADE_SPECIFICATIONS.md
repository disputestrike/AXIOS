╔════════════════════════════════════════════════════════════════════════════════╗
║                                                                              ║
║           AOIX-1 INSTITUTIONAL UPGRADE - COMPLETE SPECIFICATION              ║
║                                                                              ║
║          Module-by-Module Optimization Plan with Testing & Validation        ║
║                                                                              ║
╚════════════════════════════════════════════════════════════════════════════════╝

═════════════════════════════════════════════════════════════════════════════════════

🎯 UPGRADE SCOPE

═════════════════════════════════════════════════════════════════════════════════════

14 CORE MODULES TO UPGRADE:
  1. ✅ trade-scorer.ts (Dynamic weights + better filtering)
  2. ✅ momentum-glide.ts (ATR-based dynamic TP/SL)
  3. ✅ portfolio-optimizer.ts (Volatility-scaled sizing)
  4. ✅ execution.ts (Smart spread-aware pricing)
  5. ✅ risk-engine.ts (Soft warnings + adaptive reduction)
  6. ✅ learning-engine.ts (Active weight tuning loop)
  7. ✅ market-scanner.ts (Faster + deeper coverage)
  8. ✅ decision-engine.ts (Improved orchestration)
  9. ✅ data-enricher.ts (Better signal generation)
  10. ✅ meta-orchestrator.ts (Smarter trade selection)
  11. ✅ performance-engine.ts (Enhanced metrics)
  12. ✅ backtest-engine.ts (More robust validation)
  13. ✅ trade-logger.ts (A/B testing support)
  14. ✅ ibkr-unified.ts (Connection optimization)

═════════════════════════════════════════════════════════════════════════════════════

📋 MODULE 1: trade-scorer.ts (WIN RATE OPTIMIZER)

═════════════════════════════════════════════════════════════════════════════════════

CURRENT STATE:
  • Fixed weights: 30% ML, 25% Greeks, 20% IV, 15% Flow, 10% Momentum
  • Hard filters: Delta 0.3-0.7, Volume > 500, OI > 1000, Spread < 5%, ML > 0.65
  • No adaptation based on recent performance

UPGRADE SPECS:
  ────────────

1. DYNAMIC WEIGHTING (Based on last 20 trades)
   ┌─────────────────────────────────────────────┐
   │ IF recent_win_rate > 60% THEN:              │
   │   Increase weight of winning factors by 2%  │
   │   Decrease weight of losing factors by 2%   │
   │                                             │
   │ IF recent_profit_factor < 1.5 THEN:        │
   │   Increase risk management weight by 3%     │
   │   Reduce aggressive factors by 3%           │
   └─────────────────────────────────────────────┘

   Base Weights (Initial):
   - ML Probability:      30%  (most predictive)
   - Greeks Quality:      25%  (delta, theta, gamma balance)
   - IV Rank:            20%  (mean reversion signal)
   - Flow Analysis:       15%  (institutional moves)
   - Momentum:            10%  (trend following)

   Adjustment Range (per factor):
   - Max increase: +5% (don't over-correct)
   - Max decrease: -5% (keep diversity)
   - Rebalance frequency: Every 10 trades

2. IMPROVED HARD FILTERS
   ┌─────────────────────────────────────────────┐
   │ CURRENT          │ UPGRADED             │ WHY
   ├──────────────────┼──────────────────────┼──────────────
   │ Delta 0.3-0.7    │ 0.35-0.65 (tighter)  │ Less gamma risk
   │ Volume > 500     │ 800+ (better liquidity) │ Better fills
   │ OI > 1000        │ 1500+ (deep markets) │ More stable
   │ Spread < 5%      │ < 3% (tighter)       │ Lower slippage
   │ ML > 0.65        │ > 0.70 (higher bar)  │ Better accuracy
   └─────────────────────────────────────────────┘

3. NEW FILTER: VOLATILITY ADAPTATION
   • If VIX > 25: Reduce position size scoring (risk management)
   • If VIX < 12: Increase position size scoring (capture moves)
   • Dynamically adjust filter thresholds based on market regime

4. NEW FEATURE: SCORE DECAY
   • Trades with scores 70-75: Keep for 1 minute, then drop
   • Trades with scores 75-85: Keep for 3 minutes, then re-evaluate
   • Trades with scores 85+: Hold until momentum stops

EXPECTED IMPROVEMENT:
  • Win Rate: 55-60% → 60-65% (+5-7%)
  • Profit Factor: 1.5-1.8 → 1.8-2.0 (+0.3-0.2)
  • Code Changes: ~80 lines modified/added

═════════════════════════════════════════════════════════════════════════════════════

📋 MODULE 2: momentum-glide.ts (PROFIT LOCKING OPTIMIZATION)

═════════════════════════════════════════════════════════════════════════════════════

CURRENT STATE:
  • Fixed TP: +30% (one-size-fits-all)
  • Fixed SL: -20% (one-size-fits-all)
  • Trailing stop: 20% → 10% → 7.5% → 5% (static bands)

UPGRADE SPECS:
  ────────────

1. ATR-BASED DYNAMIC STOPS
   ┌─────────────────────────────────────────────┐
   │ ATR = Average True Range (14-period)        │
   │                                             │
   │ Dynamic SL = Entry - (1.5 × ATR)           │
   │ Dynamic TP = Entry + (3.0 × ATR)           │
   │                                             │
   │ → Adapts to market volatility              │
   │ → Tighter stops in calm markets            │
   │ → Wider stops in volatile markets          │
   └─────────────────────────────────────────────┘

2. VOLATILITY-ADJUSTED TRAILING STOPS
   Current:          Upgraded:
   ├─ 0% profit      ├─ 0% profit: Stop = -ATR (dynamic)
   ├─ +0-10%: 10%    ├─ +0-15%: ATR × 1.5
   ├─ +10-20%: 7.5%  ├─ +15-30%: ATR × 2.0
   ├─ +20-30%: 5%    ├─ +30-50%: ATR × 2.5
   └─ +30%+: TP      └─ +50%+: TAKE PROFIT

3. NEW FEATURE: PARTIAL PROFIT TAKING
   • At +20%: Take 25% of position off
   • At +35%: Take another 25%
   • At +50%: Take remaining at market
   • Lock in gains while keeping upside exposure

4. NEW FEATURE: VOLATILITY-BASED EXIT
   • If IV drops > 20% from entry: Exit (volatility crush)
   • If IV spikes > 30%: Tighten stops (protect gains)
   • Re-evaluate TP/SL every 1 minute based on new volatility

EXPECTED IMPROVEMENT:
  • Max Drawdown: 10-15% → 7-10% (-3-5%)
  • Profit Factor: +0.2 (more consistent wins)
  • Sharpe Ratio: 1.0-1.5 → 1.5-2.0 (+0.5-0.5)
  • Code Changes: ~100 lines modified/added

═════════════════════════════════════════════════════════════════════════════════════

📋 MODULE 3: portfolio-optimizer.ts (CAPITAL ALLOCATION OPTIMIZER)

═════════════════════════════════════════════════════════════════════════════════════

CURRENT STATE:
  • Fixed max per trade: 5% of account
  • Fixed total exposure: 30%
  • No volatility adjustment
  • No correlation awareness

UPGRADE SPECS:
  ────────────

1. VOLATILITY-SCALED POSITION SIZING
   ┌─────────────────────────────────────────────┐
   │ Base Size = 5% of account                   │
   │                                             │
   │ IF VIX < 12 (Calm):                        │
   │   Size = 5% × 1.2 = 6.0% (take advantage) │
   │                                             │
   │ IF VIX 12-20 (Normal):                     │
   │   Size = 5% × 1.0 = 5.0% (standard)       │
   │                                             │
   │ IF VIX 20-30 (Elevated):                   │
   │   Size = 5% × 0.7 = 3.5% (reduce risk)    │
   │                                             │
   │ IF VIX > 30 (Extreme):                     │
   │   Size = 5% × 0.4 = 2.0% (minimal)        │
   └─────────────────────────────────────────────┘

2. EQUITY-BASED DYNAMIC SIZING
   • Track account equity in real-time
   • If equity up 10%+ from start: Size up to 6%
   • If equity down 5%+ from start: Size down to 3%
   • Never exceed 30% total exposure

3. CORRELATION-AWARE POSITIONING
   ┌─────────────────────────────────────────────┐
   │ Track correlations between open positions:  │
   │                                             │
   │ If two positions > 80% correlated:         │
   │   Reduce smaller position by 50%            │
   │   Maintain diversification                  │
   │                                             │
   │ Example:                                    │
   │ • SPY Call + QQQ Call = Highly correlated  │
   │ • SPY Call + TLT Put = Low correlated      │
   │ • System prefers uncorrelated trades       │
   └─────────────────────────────────────────────┘

4. KELLY CRITERION ENHANCEMENT
   • Classic Kelly: f* = (Win% × Avg_Win - Loss% × Avg_Loss) / Avg_Win
   • Apply to position sizing: Size = f* × Current_Capital
   • Conservative Kelly: 0.5 × f* (half Kelly = safer)

EXPECTED IMPROVEMENT:
  • Monthly Return: 8-12% → 12-18% (+4-6%)
  • Sharpe Ratio: +0.3 (more consistent sizing)
  • Equity curve: Smoother (less variance)
  • Code Changes: ~90 lines modified/added

═════════════════════════════════════════════════════════════════════════════════════

📋 MODULE 4: execution.ts (SMART ORDER EXECUTION)

═════════════════════════════════════════════════════════════════════════════════════

CURRENT STATE:
  • Always orders at mid-price
  • Fixed retry logic (3 retries, 1% adjustment)
  • No spread awareness
  • No slippage tracking

UPGRADE SPECS:
  ────────────

1. SPREAD-AWARE SMART PRICING
   ┌─────────────────────────────────────────────┐
   │ Instead of: Mid-price                       │
   │ Use: Mid-price ± (Spread × 0.6)            │
   │                                             │
   │ Example:                                    │
   │ Bid = $10.50, Ask = $10.70, Spread = $0.20│
   │ Current: Order $10.60 (mid)                │
   │ Upgraded: Order $10.58 (bid + 60% spread) │
   │ → Better execution, passive entry          │
   └─────────────────────────────────────────────┘

2. INTELLIGENT RETRY LOGIC
   ┌─────────────────────────────────────────────┐
   │ Retry 1 (after 1 sec):  +0.3% worse price  │
   │ Retry 2 (after 2 sec):  +0.5% worse price  │
   │ Retry 3 (after 3 sec):  +1.0% worse price  │
   │ Final (after 4 sec):    Market order       │
   │                                             │
   │ Rationale:                                  │
   │ • Stay patient early (market may move)     │
   │ • Get aggressive later (time decay hurts)  │
   │ • Market order as ultimate fallback        │
   └─────────────────────────────────────────────┘

3. SLIPPAGE TRACKING & ADAPTATION
   ┌─────────────────────────────────────────────┐
   │ Track per-symbol slippage:                  │
   │ • SPY avg slippage: 0.15%                   │
   │ • IWM avg slippage: 0.35%                   │
   │ • TSLA avg slippage: 0.45%                  │
   │                                             │
   │ Adjust aggressive factor by slippage:      │
   │ High slippage symbols → More patient       │
   │ Low slippage symbols → More aggressive     │
   └─────────────────────────────────────────────┘

4. PARTIAL FILL HANDLING
   • If partial fill, don't complete order
   • Wait 2 seconds, reassess market
   • Cancel and re-enter if setup still valid
   • Avoids "scaling in" accidentally

EXPECTED IMPROVEMENT:
  • Slippage: -0.3 to -0.5% per trade
  • Fill Rate: 95%+ (better fills)
  • Code Changes: ~75 lines modified/added

═════════════════════════════════════════════════════════════════════════════════════

📋 MODULE 5: risk-engine.ts (ADAPTIVE RISK MANAGEMENT)

═════════════════════════════════════════════════════════════════════════════════════

CURRENT STATE:
  • Hard kill switch at 5% daily loss
  • No warnings before limit
  • No position reduction capability
  • Binary: trading on/off

UPGRADE SPECS:
  ────────────

1. SOFT WARNING SYSTEM
   ┌─────────────────────────────────────────────┐
   │ At -2.5% daily loss (50% of limit):         │
   │ → Yellow Alert: Reduce position size to 50% │
   │                                             │
   │ At -3.75% daily loss (75% of limit):        │
   │ → Orange Alert: Reduce position size to 25% │
   │                                             │
   │ At -5% daily loss (100% of limit):          │
   │ → Red Alert: KILL SWITCH ACTIVATED          │
   │                                             │
   │ Benefit: Controlled degression instead of  │
   │ binary stop/go                              │
   └─────────────────────────────────────────────┘

2. DYNAMIC POSITION REDUCTION
   • As daily loss approaches limit, reduce new position size
   • Existing positions unaffected (let them run)
   • Only new trades are smaller
   • Prevents catastrophic days

3. VOLATILITY-ADJUSTED RISK LIMITS
   ┌─────────────────────────────────────────────┐
   │ Base daily loss limit: 5%                   │
   │                                             │
   │ IF VIX > 30 (Extreme vol):                  │
   │   Daily limit = 3% (more conservative)     │
   │                                             │
   │ IF VIX < 12 (Low vol):                      │
   │   Daily limit = 7% (can take more risk)    │
   └─────────────────────────────────────────────┘

4. POSITION CORRELATION KILL SWITCH
   • If two positions have > 90% correlation
   • AND both are losing
   • Close smaller position to reduce bleeding

5. INTRADAY MOMENTUM CHECK
   • Every 30 minutes: Are we in a drawdown cycle?
   • If yes: Reduce new position size by 20%
   • If no: Resume normal sizing

EXPECTED IMPROVEMENT:
  • Smoother equity curve (fewer sharp drops)
  • Better psychological stability
  • Reduced consecutive losses
  • Code Changes: ~85 lines modified/added

═════════════════════════════════════════════════════════════════════════════════════

📋 MODULE 6: learning-engine.ts (ACTIVE LEARNING & ADAPTATION)

═════════════════════════════════════════════════════════════════════════════════════

CURRENT STATE:
  • Tracks last 100 trades
  • Calculates metrics (win rate, Sharpe, etc.)
  • No active parameter adjustment
  • Passive observation only

UPGRADE SPECS:
  ────────────

1. ACTIVE WEIGHT TUNING (Every 10 Trades)
   ┌─────────────────────────────────────────────┐
   │ SCENARIO: Last 10 trades had 70% win rate  │
   │                                             │
   │ Analyze winning trades:                     │
   │ • Avg winning ML score: 0.78                │
   │ • Avg winning Delta: 0.50                   │
   │ • Avg winning IV Rank: 65th percentile      │
   │                                             │
   │ Adjust weights:                             │
   │ • ML: 30% → 33% (+3%)                       │
   │ • Greeks: 25% → 25% (unchanged)             │
   │ • IV: 20% → 18% (-2%)                       │
   │ • Flow: 15% → 15% (unchanged)               │
   │ • Momentum: 10% → 9% (-1%)                  │
   │                                             │
   │ → Shift weights toward WINNING factors     │
   └─────────────────────────────────────────────┘

2. LOSS ANALYSIS & CORRECTION
   ┌─────────────────────────────────────────────┐
   │ If recent win rate < 50%:                   │
   │                                             │
   │ Diagnose:                                   │
   │ • Are we entering too early? (High delta)   │
   │ • Are we entering in low IV? (Mean revert?) │
   │ • Are we ignoring flow signals?             │
   │                                             │
   │ Auto-correct:                               │
   │ • Tighten filters (higher volume, OI)       │
   │ • Increase filter threshold scores          │
   │ • Reduce position sizes temporarily        │
   │                                             │
   │ Re-enable higher risk once stabilized      │
   └─────────────────────────────────────────────┘

3. BOUNDED LEARNING (Safety Guardrails)
   • Max weight change per adjustment: 5%
   • Max total weight deviation: ±10% from base
   • If performance gets worse after change: Revert
   • Minimum 20 trades before re-evaluating

4. SESSION-BASED LEARNING
   • Track daily performance patterns
   • Identify which times of day are profitable
   • Adjust scanner sensitivity by time-of-day
   • Example: "Pre-market = high false positives, reduce sensitivity"

EXPECTED IMPROVEMENT:
  • Win Rate: Continuous optimization (+2-3%)
  • Profit Factor: Adaptive to market conditions
  • System: Self-improving over time
  • Code Changes: ~110 lines modified/added

═════════════════════════════════════════════════════════════════════════════════════

📋 MODULE 7: market-scanner.ts (FASTER & DEEPER SCANNING)

═════════════════════════════════════════════════════════════════════════════════════

CURRENT STATE:
  • Scans 17+ symbols
  • Checks ATM ±10% strikes
  • Returns top 50 opportunities
  • 5-second cycle

UPGRADE SPECS:
  ────────────

1. EXPANDED STRIKE COVERAGE
   Current:           Upgraded:
   ├─ ATM ±10%       ├─ ATM ±15% (deeper OTM)
   ├─ Weeklies only  ├─ Weekly + Monthly (more expiries)
   ├─ ~400 combos    └─ ~600+ combos per scan
   
   • More opportunities = Higher chance of finding alpha
   • Deeper OTM = Lower cost, higher leverage
   • Monthly options = Longer theta decay benefit

2. ASYNC OPTIMIZATION
   ┌─────────────────────────────────────────────┐
   │ Current: Sequential scanning (slow)         │
   │ Upgraded: Parallel async calls (fast)       │
   │                                             │
   │ Query IBKR for all symbols simultaneously   │
   │ Merge results in-memory                     │
   │ Score + rank in batch                       │
   │                                             │
   │ Target: 5 seconds → 2-3 seconds            │
   └─────────────────────────────────────────────┘

3. SMART LIQUIDITY FILTERING
   ┌─────────────────────────────────────────────┐
   │ Filter out illiquid options:                │
   │ • Volume < 200: Exclude (can't exit)        │
   │ • Bid-Ask > 10%: Exclude (too wide)        │
   │ • OI < 500: Exclude (thin markets)         │
   │                                             │
   │ Keep only liquid, tradeable options         │
   └─────────────────────────────────────────────┘

4. OPPORTUNITY RANKING
   ┌─────────────────────────────────────────────┐
   │ Current: Score only                         │
   │ Upgraded: Score + Urgency + Confidence      │
   │                                             │
   │ Urgency = How fast is volatility changing?  │
   │ Confidence = How many factors align?        │
   │                                             │
   │ Rank by: Score × Urgency × Confidence      │
   │ → Prioritize highest probability trades     │
   └─────────────────────────────────────────────┘

EXPECTED IMPROVEMENT:
  • Opportunities: 50 → 75+ per cycle
  • Scan Speed: 5 sec → 2-3 sec
  • Fill Rate: Higher (more liquid options)
  • Code Changes: ~95 lines modified/added

═════════════════════════════════════════════════════════════════════════════════════

📋 MODULES 8-14: SUPPORTING OPTIMIZATIONS

═════════════════════════════════════════════════════════════════════════════════════

**Module 8: decision-engine.ts**
  • Integrate all improvements into main loop
  • Add cycle timing telemetry
  • Error handling for edge cases
  • Lines changed: ~50

**Module 9: data-enricher.ts**
  • Cache Greeks calculations (don't recalculate)
  • Parallel enrichment (faster)
  • Fallback if one signal fails
  • Lines changed: ~40

**Module 10: meta-orchestrator.ts**
  • Smarter diversification logic
  • Avoid correlated trades
  • Better confidence ranking
  • Lines changed: ~45

**Module 11: performance-engine.ts**
  • Add A/B testing metrics
  • Track per-factor performance
  • Slippage analytics
  • Lines changed: ~60

**Module 12: backtest-engine.ts**
  • More robust historical testing
  • Walk-forward validation
  • Monte Carlo simulation
  • Lines changed: ~70

**Module 13: trade-logger.ts**
  • Log A/B test flags
  • Track version changes
  • Better correlation tracking
  • Lines changed: ~30

**Module 14: ibkr-unified.ts**
  • Connection pooling
  • Retry on failures
  • Better error messages
  • Lines changed: ~35

═════════════════════════════════════════════════════════════════════════════════════

📊 EXPECTED OVERALL IMPROVEMENTS

═════════════════════════════════════════════════════════════════════════════════════

| Metric | Current | After Upgrade | Improvement |
|--------|---------|---------------|-------------|
| Win Rate | 55-60% | 60-68% | +5-8% |
| Profit Factor | 1.5-1.8 | 1.8-2.2 | +0.3-0.4 |
| Monthly Return | 8-12% | 12-18% | +4-6% |
| Max Drawdown | 10-15% | 7-10% | -3-5% |
| Sharpe Ratio | 1.0-1.5 | 1.5-2.0 | +0.5 |
| Slippage | -0.4% | -0.1% | +0.3% |
| Trade Frequency | Unchanged | +15-20% | Better opportunities |

═════════════════════════════════════════════════════════════════════════════════════

🧪 TESTING STRATEGY

═════════════════════════════════════════════════════════════════════════════════════

**Phase 1: Unit Testing** (Each module individually)
  • Test dynamic weight adjustment
  • Test ATR-based stops
  • Test volatility scaling
  • Test execution logic
  • Test risk limits
  • Test learning loop

**Phase 2: Integration Testing** (All modules together)
  • Full trading cycle with new logic
  • Trade from scan to execution
  • Verify all signals flow correctly
  • Check performance calculations

**Phase 3: Backtest Validation** (Historical performance)
  • Run on 1 year of data
  • Compare to baseline
  • Verify improvements match expectations
  • Stress test on extreme market days

**Phase 4: Paper Trading** (Real-time validation)
  • Run parallel: Current vs. Upgraded
  • 2-4 weeks of paper trading
  • Compare P&L, win rate, drawdown
  • Verify no bugs or issues

**Phase 5: A/B Testing Framework** (Ready for live)
  • Harness to compare both systems
  • Log all trades from both
  • Daily performance reports
  • Easy rollback if needed

═════════════════════════════════════════════════════════════════════════════════════

📈 TIMELINE

═════════════════════════════════════════════════════════════════════════════════════

Day 1-2:   Implement modules 1-7 (biggest wins)
Day 3:     Implement modules 8-14 (support)
Day 4:     Unit testing + bug fixes
Day 5:     Integration testing + validation
Day 6:     Backtest on historical data
Day 7:     Final verification + documentation
Day 8+:    Paper trading + A/B testing

═════════════════════════════════════════════════════════════════════════════════════

✅ READY TO PROCEED?

═════════════════════════════════════════════════════════════════════════════════════

Should I now:

1. Generate upgraded code for all 14 modules
2. Create comprehensive test suite
3. Build A/B testing framework
4. Run backtests
5. Validate everything works
6. Provide deployment guide

Answer: YES ➜ PROCEED WITH FULL UPGRADE
