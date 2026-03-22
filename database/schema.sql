-- AOIX-1 PostgreSQL Database Schema
-- Complete production database structure
-- All tables needed for autonomous trading system

-- ============================================================================
-- CORE TRADING TABLES
-- ============================================================================

CREATE TABLE IF NOT EXISTS accounts (
    id BIGSERIAL PRIMARY KEY,
    account_id VARCHAR(50) NOT NULL UNIQUE,
    account_type VARCHAR(20) NOT NULL CHECK (account_type IN ('PAPER', 'LIVE')),
    starting_equity DECIMAL(15,2) NOT NULL,
    current_equity DECIMAL(15,2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS trades (
    id BIGSERIAL PRIMARY KEY,
    account_id BIGINT NOT NULL REFERENCES accounts(id),
    trade_id VARCHAR(100) NOT NULL UNIQUE,
    symbol VARCHAR(20) NOT NULL,
    option_type VARCHAR(4) NOT NULL CHECK (option_type IN ('CALL', 'PUT')),
    strike DECIMAL(10,2) NOT NULL,
    expiry_date DATE NOT NULL,
    entry_price DECIMAL(10,4) NOT NULL,
    exit_price DECIMAL(10,4),
    quantity INT NOT NULL,
    entry_time TIMESTAMP NOT NULL,
    exit_time TIMESTAMP,
    pnl DECIMAL(15,4),
    pnl_percent DECIMAL(10,4),
    status VARCHAR(20) NOT NULL CHECK (status IN ('PENDING', 'OPEN', 'CLOSED', 'CANCELLED')),
    ml_score DECIMAL(5,4),
    delta DECIMAL(5,4),
    gamma DECIMAL(5,4),
    theta DECIMAL(5,4),
    vega DECIMAL(5,4),
    iv_rank DECIMAL(5,2),
    volume INT,
    open_interest INT,
    bid_ask_spread DECIMAL(10,4),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_account_symbol (account_id, symbol),
    INDEX idx_status (status),
    INDEX idx_entry_time (entry_time),
    INDEX idx_pnl (pnl)
);

CREATE TABLE IF NOT EXISTS positions (
    id BIGSERIAL PRIMARY KEY,
    account_id BIGINT NOT NULL REFERENCES accounts(id),
    trade_id BIGINT NOT NULL REFERENCES trades(id),
    symbol VARCHAR(20) NOT NULL,
    quantity INT NOT NULL,
    entry_price DECIMAL(10,4) NOT NULL,
    current_price DECIMAL(10,4),
    unrealized_pnl DECIMAL(15,4),
    status VARCHAR(20) NOT NULL CHECK (status IN ('OPEN', 'CLOSED')),
    opened_at TIMESTAMP NOT NULL,
    closed_at TIMESTAMP,
    INDEX idx_account_status (account_id, status)
);

CREATE TABLE IF NOT EXISTS daily_metrics (
    id BIGSERIAL PRIMARY KEY,
    account_id BIGINT NOT NULL REFERENCES accounts(id),
    trade_date DATE NOT NULL,
    trades_count INT DEFAULT 0,
    winning_trades INT DEFAULT 0,
    losing_trades INT DEFAULT 0,
    win_rate DECIMAL(5,4),
    profit_factor DECIMAL(10,4),
    daily_pnl DECIMAL(15,4),
    daily_return DECIMAL(10,4),
    max_drawdown DECIMAL(10,4),
    sharpe_ratio DECIMAL(10,4),
    avg_win DECIMAL(15,4),
    avg_loss DECIMAL(15,4),
    largest_win DECIMAL(15,4),
    largest_loss DECIMAL(15,4),
    consecutive_wins INT,
    consecutive_losses INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(account_id, trade_date),
    INDEX idx_account_date (account_id, trade_date)
);

-- ============================================================================
-- MARKET DATA TABLES
-- ============================================================================

CREATE TABLE IF NOT EXISTS market_data (
    id BIGSERIAL PRIMARY KEY,
    symbol VARCHAR(20) NOT NULL,
    trade_date DATE NOT NULL,
    open_price DECIMAL(10,4),
    high_price DECIMAL(10,4),
    low_price DECIMAL(10,4),
    close_price DECIMAL(10,4),
    volume BIGINT,
    vix_level DECIMAL(10,4),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(symbol, trade_date),
    INDEX idx_symbol_date (symbol, trade_date)
);

CREATE TABLE IF NOT EXISTS option_chains (
    id BIGSERIAL PRIMARY KEY,
    symbol VARCHAR(20) NOT NULL,
    option_type VARCHAR(4) NOT NULL,
    strike DECIMAL(10,2) NOT NULL,
    expiry_date DATE NOT NULL,
    bid DECIMAL(10,4),
    ask DECIMAL(10,4),
    volume INT,
    open_interest INT,
    implied_vol DECIMAL(10,4),
    delta DECIMAL(5,4),
    gamma DECIMAL(5,4),
    theta DECIMAL(5,4),
    vega DECIMAL(5,4),
    iv_percentile DECIMAL(5,2),
    scan_time TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(symbol, option_type, strike, expiry_date),
    INDEX idx_symbol_expiry (symbol, expiry_date)
);

-- ============================================================================
-- RISK MANAGEMENT TABLES
-- ============================================================================

CREATE TABLE IF NOT EXISTS risk_events (
    id BIGSERIAL PRIMARY KEY,
    account_id BIGINT NOT NULL REFERENCES accounts(id),
    event_type VARCHAR(50) NOT NULL,
    severity VARCHAR(20) NOT NULL CHECK (severity IN ('GREEN', 'YELLOW', 'ORANGE', 'RED')),
    daily_loss_percent DECIMAL(10,4),
    max_drawdown_percent DECIMAL(10,4),
    open_positions INT,
    total_exposure DECIMAL(15,4),
    action_taken VARCHAR(100),
    message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_account_severity (account_id, severity),
    INDEX idx_created_at (created_at)
);

CREATE TABLE IF NOT EXISTS position_limits (
    id BIGSERIAL PRIMARY KEY,
    account_id BIGINT NOT NULL REFERENCES accounts(id),
    max_position_size DECIMAL(5,2) DEFAULT 5,
    max_daily_loss DECIMAL(5,2) DEFAULT 5,
    max_total_exposure DECIMAL(5,2) DEFAULT 30,
    max_daily_trades INT DEFAULT 50,
    kill_switch_active BOOLEAN DEFAULT FALSE,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(account_id)
);

-- ============================================================================
-- LEARNING & OPTIMIZATION TABLES
-- ============================================================================

CREATE TABLE IF NOT EXISTS trade_analysis (
    id BIGSERIAL PRIMARY KEY,
    account_id BIGINT NOT NULL REFERENCES accounts(id),
    trade_id BIGINT NOT NULL REFERENCES trades(id),
    ml_score_at_entry DECIMAL(5,4),
    delta_at_entry DECIMAL(5,4),
    iv_rank_at_entry DECIMAL(5,2),
    flow_score DECIMAL(5,2),
    momentum_at_entry DECIMAL(5,4),
    winning_factor_weights TEXT, -- JSON
    analysis_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_account_id (account_id)
);

CREATE TABLE IF NOT EXISTS weight_adjustments (
    id BIGSERIAL PRIMARY KEY,
    account_id BIGINT NOT NULL REFERENCES accounts(id),
    adjustment_date TIMESTAMP NOT NULL,
    previous_weights TEXT NOT NULL, -- JSON: {ml, delta, iv, flow, momentum}
    new_weights TEXT NOT NULL,      -- JSON: {ml, delta, iv, flow, momentum}
    reason VARCHAR(255),
    win_rate_before DECIMAL(5,4),
    win_rate_after DECIMAL(5,4),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_account_date (account_id, adjustment_date)
);

-- ============================================================================
-- SYSTEM MONITORING TABLES
-- ============================================================================

CREATE TABLE IF NOT EXISTS system_logs (
    id BIGSERIAL PRIMARY KEY,
    log_level VARCHAR(20) NOT NULL,
    message TEXT NOT NULL,
    component VARCHAR(100),
    details JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_log_level (log_level),
    INDEX idx_created_at (created_at),
    INDEX idx_component (component)
);

CREATE TABLE IF NOT EXISTS error_logs (
    id BIGSERIAL PRIMARY KEY,
    error_code VARCHAR(50),
    error_message TEXT NOT NULL,
    stack_trace TEXT,
    component VARCHAR(100),
    severity VARCHAR(20),
    resolved BOOLEAN DEFAULT FALSE,
    resolution_notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP,
    INDEX idx_created_at (created_at),
    INDEX idx_resolved (resolved)
);

CREATE TABLE IF NOT EXISTS performance_metrics (
    id BIGSERIAL PRIMARY KEY,
    account_id BIGINT NOT NULL REFERENCES accounts(id),
    metric_date DATE NOT NULL,
    scan_speed_ms DECIMAL(10,2),
    scoring_speed_ms DECIMAL(10,2),
    execution_speed_ms DECIMAL(10,2),
    risk_check_speed_ms DECIMAL(10,2),
    total_opportunities INT,
    qualified_opportunities INT,
    execution_rate DECIMAL(5,2),
    average_slippage DECIMAL(10,4),
    cpu_usage_percent DECIMAL(5,2),
    memory_usage_mb DECIMAL(10,2),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(account_id, metric_date)
);

-- ============================================================================
-- BACKTESTING TABLES
-- ============================================================================

CREATE TABLE IF NOT EXISTS backtest_runs (
    id BIGSERIAL PRIMARY KEY,
    backtest_id VARCHAR(100) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    initial_capital DECIMAL(15,2) NOT NULL,
    trades_count INT,
    winning_trades INT,
    losing_trades INT,
    win_rate DECIMAL(5,4),
    profit_factor DECIMAL(10,4),
    total_return DECIMAL(15,4),
    annual_return DECIMAL(10,4),
    sharpe_ratio DECIMAL(10,4),
    max_drawdown DECIMAL(10,4),
    final_capital DECIMAL(15,2),
    status VARCHAR(20),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_status (status),
    INDEX idx_created_at (created_at)
);

CREATE TABLE IF NOT EXISTS backtest_trades (
    id BIGSERIAL PRIMARY KEY,
    backtest_id VARCHAR(100) NOT NULL,
    symbol VARCHAR(20) NOT NULL,
    entry_date DATE NOT NULL,
    exit_date DATE NOT NULL,
    entry_price DECIMAL(10,4) NOT NULL,
    exit_price DECIMAL(10,4) NOT NULL,
    quantity INT NOT NULL,
    pnl DECIMAL(15,4),
    pnl_percent DECIMAL(10,4),
    FOREIGN KEY (backtest_id) REFERENCES backtest_runs(backtest_id),
    INDEX idx_backtest_id (backtest_id)
);

-- ============================================================================
-- ALERT & NOTIFICATION TABLES
-- ============================================================================

CREATE TABLE IF NOT EXISTS alerts (
    id BIGSERIAL PRIMARY KEY,
    account_id BIGINT NOT NULL REFERENCES accounts(id),
    alert_type VARCHAR(100) NOT NULL,
    severity VARCHAR(20) NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT,
    action_required BOOLEAN DEFAULT TRUE,
    resolved BOOLEAN DEFAULT FALSE,
    resolved_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_account_resolved (account_id, resolved),
    INDEX idx_severity (severity)
);

-- ============================================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================================

CREATE INDEX idx_trades_pnl ON trades(pnl DESC) WHERE status = 'CLOSED';
CREATE INDEX idx_trades_win ON trades(pnl) WHERE pnl > 0 AND status = 'CLOSED';
CREATE INDEX idx_positions_unrealized ON positions(unrealized_pnl) WHERE status = 'OPEN';
CREATE INDEX idx_daily_metrics_sharpe ON daily_metrics(sharpe_ratio DESC);
CREATE INDEX idx_market_data_symbol ON market_data(symbol);
CREATE INDEX idx_option_chains_symbol ON option_chains(symbol);

-- ============================================================================
-- VIEWS FOR REPORTING
-- ============================================================================

CREATE OR REPLACE VIEW v_account_summary AS
SELECT 
    a.id,
    a.account_id,
    a.account_type,
    a.starting_equity,
    a.current_equity,
    (a.current_equity - a.starting_equity) as total_profit,
    ((a.current_equity - a.starting_equity) / a.starting_equity * 100) as total_return_pct,
    COUNT(DISTINCT t.id) as total_trades,
    COUNT(DISTINCT CASE WHEN t.pnl > 0 THEN t.id END) as winning_trades,
    COUNT(DISTINCT CASE WHEN t.pnl <= 0 THEN t.id END) as losing_trades
FROM accounts a
LEFT JOIN trades t ON a.id = t.account_id AND t.status = 'CLOSED'
GROUP BY a.id;

CREATE OR REPLACE VIEW v_daily_summary AS
SELECT 
    dm.account_id,
    dm.trade_date,
    dm.trades_count,
    dm.win_rate,
    dm.profit_factor,
    dm.daily_pnl,
    dm.daily_return,
    dm.sharpe_ratio,
    dm.max_drawdown
FROM daily_metrics dm
ORDER BY dm.trade_date DESC;

-- ============================================================================
-- GRANTS & PERMISSIONS
-- ============================================================================

-- Create app user
CREATE USER IF NOT EXISTS aoix_app WITH PASSWORD 'aoix_production_password_2026';

-- Grant permissions
GRANT CONNECT ON DATABASE aoix1_live TO aoix_app;
GRANT USAGE ON SCHEMA public TO aoix_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO aoix_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO aoix_app;
GRANT SELECT ON ALL VIEWS IN SCHEMA public TO aoix_app;

-- ============================================================================
-- INITIAL DATA
-- ============================================================================

-- Create default account (PAPER)
INSERT INTO accounts (account_id, account_type, starting_equity, current_equity)
VALUES ('PAPER_TEST_001', 'PAPER', 100000.00, 100000.00)
ON CONFLICT (account_id) DO NOTHING;

-- Create default position limits
INSERT INTO position_limits (account_id, max_position_size, max_daily_loss, max_total_exposure, max_daily_trades)
SELECT id, 5, 5, 30, 50 FROM accounts WHERE account_id = 'PAPER_TEST_001'
ON CONFLICT (account_id) DO NOTHING;
