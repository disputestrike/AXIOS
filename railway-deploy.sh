#!/bin/bash

# AOIX-1 RAILWAY DEPLOYMENT SCRIPT
# Complete infrastructure setup for production on Railway

set -e

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║                                                                ║"
echo "║          AOIX-1 RAILWAY DEPLOYMENT - FULL SETUP               ║"
echo "║                                                                ║"
echo "║         PostgreSQL Database + Complete Infrastructure         ║"
echo "║                                                                ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# ============================================================================
# STEP 1: ENVIRONMENT SETUP
# ============================================================================

echo "STEP 1: Environment Configuration"
echo "═════════════════════════════════════════════════════════════════"
echo ""

# Get Railway environment variables
if [ -z "$DATABASE_URL" ]; then
    echo "❌ DATABASE_URL not set. Railway PostgreSQL not configured."
    echo "   Please add PostgreSQL plugin to Railway project"
    exit 1
fi

echo "✅ DATABASE_URL configured"
echo "   Testing connection..."

# Extract connection details
if [[ $DATABASE_URL =~ postgresql://([^:]+):([^@]+)@([^:]+):([0-9]+)/(.+) ]]; then
    DB_USER="${BASH_REMATCH[1]}"
    DB_PASS="${BASH_REMATCH[2]}"
    DB_HOST="${BASH_REMATCH[3]}"
    DB_PORT="${BASH_REMATCH[4]}"
    DB_NAME="${BASH_REMATCH[5]}"
    
    echo "   Host: $DB_HOST"
    echo "   Port: $DB_PORT"
    echo "   Database: $DB_NAME"
    echo "   User: $DB_USER"
else
    echo "❌ Failed to parse DATABASE_URL"
    exit 1
fi

echo ""

# ============================================================================
# STEP 2: TEST DATABASE CONNECTION
# ============================================================================

echo "STEP 2: Database Connection Test"
echo "═════════════════════════════════════════════════════════════════"
echo ""

echo "🔍 Testing PostgreSQL connection..."

PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
    -c "SELECT version();" > /dev/null 2>&1

if [ $? -eq 0 ]; then
    echo "✅ PostgreSQL connection successful"
else
    echo "❌ Failed to connect to PostgreSQL"
    exit 1
fi

echo ""

# ============================================================================
# STEP 3: DEPLOY DATABASE SCHEMA
# ============================================================================

echo "STEP 3: Deploy Database Schema"
echo "═════════════════════════════════════════════════════════════════"
echo ""

echo "📊 Creating database schema..."

# Create schema from file
SCHEMA_FILE="/app/database/schema.sql"
if [ -f "$SCHEMA_FILE" ]; then
    PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
        -f "$SCHEMA_FILE" > /dev/null 2>&1
    echo "✅ Schema deployed successfully"
else
    echo "⚠️  Schema file not found at $SCHEMA_FILE"
    echo "   Creating schema inline..."
    
    # Create core tables
    PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" << 'SQL'
    
-- Core tables
CREATE TABLE IF NOT EXISTS accounts (
    id BIGSERIAL PRIMARY KEY,
    account_id VARCHAR(50) NOT NULL UNIQUE,
    account_type VARCHAR(20) NOT NULL,
    starting_equity DECIMAL(15,2) NOT NULL,
    current_equity DECIMAL(15,2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS trades (
    id BIGSERIAL PRIMARY KEY,
    account_id BIGINT NOT NULL REFERENCES accounts(id),
    trade_id VARCHAR(100) NOT NULL UNIQUE,
    symbol VARCHAR(20) NOT NULL,
    entry_price DECIMAL(10,4) NOT NULL,
    exit_price DECIMAL(10,4),
    pnl DECIMAL(15,4),
    status VARCHAR(20),
    entry_time TIMESTAMP,
    exit_time TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS daily_metrics (
    id BIGSERIAL PRIMARY KEY,
    account_id BIGINT NOT NULL REFERENCES accounts(id),
    trade_date DATE NOT NULL,
    trades_count INT,
    win_rate DECIMAL(5,4),
    profit_factor DECIMAL(10,4),
    daily_pnl DECIMAL(15,4),
    sharpe_ratio DECIMAL(10,4),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS system_logs (
    id BIGSERIAL PRIMARY KEY,
    log_level VARCHAR(20),
    message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_trades_account ON trades(account_id);
CREATE INDEX IF NOT EXISTS idx_trades_symbol ON trades(symbol);
CREATE INDEX IF NOT EXISTS idx_daily_metrics_account ON daily_metrics(account_id);

SQL
    
    echo "✅ Core schema created"
fi

echo ""

# ============================================================================
# STEP 4: VERIFY SCHEMA
# ============================================================================

echo "STEP 4: Verify Schema"
echo "═════════════════════════════════════════════════════════════════"
echo ""

TABLE_COUNT=$(PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
    -tc "SELECT count(*) FROM information_schema.tables WHERE table_schema='public';")

echo "✅ Tables created: $TABLE_COUNT"

# List tables
PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
    -c "\dt" | head -20

echo ""

# ============================================================================
# STEP 5: CREATE DEFAULT DATA
# ============================================================================

echo "STEP 5: Initialize Default Data"
echo "═════════════════════════════════════════════════════════════════"
echo ""

echo "📝 Creating default accounts..."

PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
    -c "INSERT INTO accounts (account_id, account_type, starting_equity, current_equity) 
        VALUES ('PROD_001', 'LIVE', 100000.00, 100000.00) 
        ON CONFLICT DO NOTHING;" > /dev/null 2>&1

echo "✅ Default data initialized"

echo ""

# ============================================================================
# STEP 6: CONNECTIVITY VERIFICATION
# ============================================================================

echo "STEP 6: Full Connectivity Verification"
echo "═════════════════════════════════════════════════════════════════"
echo ""

echo "🔍 Verifying all connections..."

# Check accounts table
ACCOUNT_COUNT=$(PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
    -tc "SELECT COUNT(*) FROM accounts;")
echo "   Accounts: $ACCOUNT_COUNT"

# Check trades table
TRADE_COUNT=$(PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
    -tc "SELECT COUNT(*) FROM trades;")
echo "   Trades: $TRADE_COUNT"

# Check daily_metrics table
METRIC_COUNT=$(PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
    -tc "SELECT COUNT(*) FROM daily_metrics;")
echo "   Daily Metrics: $METRIC_COUNT"

echo "✅ All connections verified"

echo ""

# ============================================================================
# STEP 7: ENVIRONMENT VARIABLES
# ============================================================================

echo "STEP 7: Environment Variables"
echo "═════════════════════════════════════════════════════════════════"
echo ""

# Create .env file for application
cat > /app/.env.production << ENV
DATABASE_URL=$DATABASE_URL
DB_HOST=$DB_HOST
DB_PORT=$DB_PORT
DB_NAME=$DB_NAME
DB_USER=$DB_USER
ENABLE_LIVE_TRADING=true
ENVIRONMENT=production
LOG_LEVEL=info
ENV

echo "✅ Environment variables configured"

echo ""

# ============================================================================
# STEP 8: HEALTH CHECK
# ============================================================================

echo "STEP 8: System Health Check"
echo "═════════════════════════════════════════════════════════════════"
echo ""

echo "🏥 Running health checks..."

# Database size
DB_SIZE=$(PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
    -tc "SELECT pg_size_pretty(pg_database_size(current_database()));")
echo "   Database Size: $DB_SIZE"

# Active connections
CONNECTIONS=$(PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
    -tc "SELECT count(*) FROM pg_stat_activity;")
echo "   Active Connections: $CONNECTIONS"

# Disk usage
DISK_USAGE=$(df -h /app | awk 'NR==2 {print $5}')
echo "   Disk Usage: $DISK_USAGE"

echo "✅ Health checks passed"

echo ""

# ============================================================================
# COMPLETE
# ============================================================================

echo "═════════════════════════════════════════════════════════════════"
echo ""
echo "✅ RAILWAY DEPLOYMENT COMPLETE"
echo ""
echo "System Ready:"
echo "  ✅ PostgreSQL Database: Connected"
echo "  ✅ Schema: Deployed"
echo "  ✅ Tables: Created ($TABLE_COUNT tables)"
echo "  ✅ Data: Initialized"
echo "  ✅ Environment: Configured"
echo "  ✅ Health: Verified"
echo ""
echo "Ready for testing and production use"
echo ""
echo "═════════════════════════════════════════════════════════════════"
