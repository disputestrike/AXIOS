-- AOIX-1 PostgreSQL Database Schema
-- Production-grade database for autonomous trading system
-- Railway deployment ready

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "btree_gin";

-- ═══════════════════════════════════════════════════════════════════════════════
-- CORE ACCOUNT & SESSION TABLES
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id VARCHAR(50) UNIQUE NOT NULL,
  account_type VARCHAR(20) NOT NULL CHECK (account_type IN ('PAPER', 'LIVE')),
  initial_equity DECIMAL(15, 2) NOT NULL,
  current_equity DECIMAL(15, 2) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  is_active BOOLEAN DEFAULT true
);

CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id),
  session_type VARCHAR(20) NOT NULL CHECK (session_type IN ('PAPER', 'LIVE', 'BACKTEST')),
  start_time TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  end_time TIMESTAMP,
  status VARCHAR(20) DEFAULT 'RUNNING' CHECK (status IN ('RUNNING', 'PAUSED', 'STOPPED', 'ERROR')),
  trades_executed INT DEFAULT 0,
  total_pnl DECIMAL(15, 2) DEFAULT 0,
  win_rate DECIMAL(5, 2) DEFAULT 0,
  profit_factor DECIMAL(10, 2) DEFAULT 0,
  sharpe_ratio DECIMAL(10, 2) DEFAULT 0,
  max_drawdown DECIMAL(5, 2) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_account_id (account_id),
  INDEX idx_status (status),
  INDEX idx_start_time (start_time)
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- TRADE EXECUTION TABLES
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE trades (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES sessions(id),
  account_id UUID NOT NULL REFERENCES accounts(id),
  symbol VARCHAR(20) NOT NULL,
  trade_type VARCHAR(10) NOT NULL CHECK (trade_type IN ('CALL', 'PUT')),
  entry_price DECIMAL(15, 6) NOT NULL,
  entry_time TIMESTAMP NOT NULL,
  exit_price DECIMAL(15, 6),
  exit_time TIMESTAMP,
  quantity INT NOT NULL,
  pnl DECIMAL(15, 2),
  pnl_percent DECIMAL(10, 4),
  status VARCHAR(20) DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'CLOSED', 'EXPIRED', 'ERROR')),
  
  -- Trade characteristics
  strike DECIMAL(10, 2),
  expiry_date DATE,
  entry_iv DECIMAL(5, 4),
  exit_iv DECIMAL(5, 4),
  entry_delta DECIMAL(5, 4),
  entry_theta DECIMAL(5, 4),
  entry_vega DECIMAL(5, 4),
  
  -- Scoring
  ml_score DECIMAL(5, 4),
  trade_score DECIMAL(5, 4),
  confidence_level INT,
  
  -- Risk metrics
  max_loss DECIMAL(15, 2),
  intended_profit DECIMAL(15, 2),
  risk_reward_ratio DECIMAL(10, 2),
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  INDEX idx_session_id (session_id),
  INDEX idx_symbol (symbol),
  INDEX idx_status (status),
  INDEX idx_entry_time (entry_time),
  INDEX idx_pnl (pnl)
);

CREATE TABLE positions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES sessions(id),
  symbol VARCHAR(20) NOT NULL,
  trade_type VARCHAR(10) NOT NULL,
  quantity_open INT NOT NULL,
  average_entry DECIMAL(15, 6) NOT NULL,
  entry_time TIMESTAMP NOT NULL,
  current_price DECIMAL(15, 6),
  unrealized_pnl DECIMAL(15, 2),
  status VARCHAR(20) DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'CLOSED', 'PARTIAL')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_session_id (session_id),
  INDEX idx_symbol (symbol),
  INDEX idx_status (status)
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- MARKET DATA TABLES
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE market_scans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES sessions(id),
  scan_time TIMESTAMP NOT NULL,
  total_opportunities INT,
  opportunities_filtered INT,
  opportunities_passed INT,
  scan_duration_ms INT,
  vix_level DECIMAL(5, 2),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_session_id (session_id),
  INDEX idx_scan_time (scan_time)
);

CREATE TABLE opportunities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  scan_id UUID NOT NULL REFERENCES market_scans(id),
  symbol VARCHAR(20) NOT NULL,
  strike DECIMAL(10, 2),
  trade_type VARCHAR(10),
  bid DECIMAL(15, 6),
  ask DECIMAL(15, 6),
  volume INT,
  open_interest INT,
  iv DECIMAL(5, 4),
  delta DECIMAL(5, 4),
  theta DECIMAL(5, 4),
  gamma DECIMAL(5, 4),
  vega DECIMAL(5, 4),
  ml_score DECIMAL(5, 4),
  trade_score DECIMAL(5, 4),
  urgency_score INT,
  confidence_level INT,
  days_to_expiration INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_symbol (symbol),
  INDEX idx_score (trade_score),
  INDEX idx_scan_id (scan_id)
);

CREATE TABLE market_data (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  symbol VARCHAR(20) NOT NULL,
  timestamp TIMESTAMP NOT NULL,
  open_price DECIMAL(15, 6),
  high_price DECIMAL(15, 6),
  low_price DECIMAL(15, 6),
  close_price DECIMAL(15, 6),
  volume BIGINT,
  vix_level DECIMAL(5, 2),
  iv_rank DECIMAL(5, 2),
  atr DECIMAL(10, 6),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_symbol_timestamp (symbol, timestamp DESC),
  INDEX idx_timestamp (timestamp)
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- RISK MANAGEMENT TABLES
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE risk_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES sessions(id),
  event_type VARCHAR(50) NOT NULL,
  event_level VARCHAR(20) NOT NULL CHECK (event_level IN ('GREEN', 'YELLOW', 'ORANGE', 'RED')),
  daily_loss_percent DECIMAL(5, 2),
  daily_loss_limit DECIMAL(5, 2),
  position_size_multiplier DECIMAL(5, 4),
  message TEXT,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_session_id (session_id),
  INDEX idx_event_level (event_level),
  INDEX idx_timestamp (timestamp)
);

CREATE TABLE kill_switch_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES sessions(id),
  triggered_at TIMESTAMP NOT NULL,
  reason TEXT,
  daily_loss_percent DECIMAL(5, 2),
  reopened_at TIMESTAMP,
  duration_seconds INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_session_id (session_id),
  INDEX idx_triggered_at (triggered_at)
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- LEARNING & ADAPTATION TABLES
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE weight_adjustments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES sessions(id),
  trade_count INT,
  previous_weights JSONB,
  new_weights JSONB,
  win_rate_before DECIMAL(5, 4),
  win_rate_after DECIMAL(5, 4),
  reason TEXT,
  adjustment_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_session_id (session_id),
  INDEX idx_trade_count (trade_count)
);

CREATE TABLE performance_metrics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES sessions(id),
  metric_time TIMESTAMP NOT NULL,
  
  -- Win/Loss metrics
  total_trades INT,
  winning_trades INT,
  losing_trades INT,
  win_rate DECIMAL(5, 4),
  profit_factor DECIMAL(10, 2),
  
  -- Return metrics
  gross_profit DECIMAL(15, 2),
  gross_loss DECIMAL(15, 2),
  net_profit DECIMAL(15, 2),
  
  -- Risk metrics
  max_drawdown DECIMAL(5, 4),
  sharpe_ratio DECIMAL(10, 4),
  sortino_ratio DECIMAL(10, 4),
  calmar_ratio DECIMAL(10, 4),
  
  -- Execution metrics
  avg_trade_duration_seconds INT,
  avg_slippage DECIMAL(5, 4),
  fill_rate DECIMAL(5, 4),
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_session_id (session_id),
  INDEX idx_metric_time (metric_time)
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- BACKTESTING TABLES
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE backtest_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  backtest_name VARCHAR(255) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  initial_capital DECIMAL(15, 2) NOT NULL,
  trades_count INT,
  win_rate DECIMAL(5, 4),
  profit_factor DECIMAL(10, 2),
  total_return DECIMAL(10, 4),
  sharpe_ratio DECIMAL(10, 4),
  max_drawdown DECIMAL(5, 4),
  status VARCHAR(20) DEFAULT 'COMPLETED',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_created_at (created_at)
);

CREATE TABLE backtest_trades (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  backtest_id UUID NOT NULL REFERENCES backtest_runs(id),
  symbol VARCHAR(20),
  entry_date DATE,
  entry_price DECIMAL(15, 6),
  exit_date DATE,
  exit_price DECIMAL(15, 6),
  quantity INT,
  pnl DECIMAL(15, 2),
  pnl_percent DECIMAL(10, 4),
  win BOOLEAN,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_backtest_id (backtest_id),
  INDEX idx_symbol (symbol)
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- SYSTEM MONITORING TABLES
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE system_health (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID,
  check_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  cpu_percent DECIMAL(5, 2),
  memory_percent DECIMAL(5, 2),
  disk_percent DECIMAL(5, 2),
  error_count INT DEFAULT 0,
  error_messages TEXT,
  database_connection_healthy BOOLEAN,
  ibkr_connection_healthy BOOLEAN,
  system_status VARCHAR(20) CHECK (system_status IN ('HEALTHY', 'DEGRADED', 'ERROR')),
  INDEX idx_check_time (check_time),
  INDEX idx_session_id (session_id)
);

CREATE TABLE error_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID,
  error_type VARCHAR(100),
  error_message TEXT,
  stack_trace TEXT,
  severity VARCHAR(20) CHECK (severity IN ('INFO', 'WARNING', 'ERROR', 'CRITICAL')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_session_id (session_id),
  INDEX idx_severity (severity),
  INDEX idx_created_at (created_at)
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- CREATE INDEXES FOR PERFORMANCE
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE INDEX idx_trades_session_symbol ON trades(session_id, symbol);
CREATE INDEX idx_trades_status_time ON trades(status, entry_time DESC);
CREATE INDEX idx_positions_session_symbol ON positions(session_id, symbol);
CREATE INDEX idx_opportunities_trade_score ON opportunities(trade_score DESC);
CREATE INDEX idx_market_data_symbol_time ON market_data(symbol, timestamp DESC);
CREATE INDEX idx_performance_metrics_session_time ON performance_metrics(session_id, metric_time DESC);

-- ═══════════════════════════════════════════════════════════════════════════════
-- CREATE VIEWS FOR EASY QUERYING
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE VIEW session_summary AS
SELECT 
  s.id,
  s.account_id,
  a.account_id as account_number,
  s.session_type,
  s.start_time,
  s.end_time,
  s.status,
  s.trades_executed,
  s.total_pnl,
  s.win_rate,
  s.profit_factor,
  s.sharpe_ratio,
  s.max_drawdown
FROM sessions s
JOIN accounts a ON s.account_id = a.id;

CREATE VIEW trade_statistics AS
SELECT 
  symbol,
  COUNT(*) as total_trades,
  SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END) as wins,
  SUM(CASE WHEN pnl < 0 THEN 1 ELSE 0 END) as losses,
  ROUND(SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END)::numeric / COUNT(*) * 100, 2) as win_rate,
  ROUND(AVG(pnl), 2) as avg_pnl,
  MAX(pnl) as max_profit,
  MIN(pnl) as max_loss,
  SUM(pnl) as total_pnl
FROM trades
WHERE status = 'CLOSED'
GROUP BY symbol;

-- ═══════════════════════════════════════════════════════════════════════════════
-- GRANTS (for application user)
-- ═══════════════════════════════════════════════════════════════════════════════

-- Create application user (change password in production)
CREATE USER aoix_app WITH PASSWORD 'aoix_app_secure_password';

-- Grant privileges
GRANT USAGE ON SCHEMA public TO aoix_app;
GRANT CREATE ON SCHEMA public TO aoix_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO aoix_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO aoix_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO aoix_app;

-- Make privileges default for future tables
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO aoix_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO aoix_app;

-- ═══════════════════════════════════════════════════════════════════════════════

-- Schema created successfully
COMMIT;
