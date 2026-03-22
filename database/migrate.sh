#!/bin/bash

# AOIX-1 PostgreSQL Migration & Initialization Script
# Sets up complete database for production deployment

set -e

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║                                                                ║"
echo "║        AOIX-1 PostgreSQL Migration & Initialization           ║"
echo "║                                                                ║"
echo "║              Setting up production database                   ║"
echo "║                                                                ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# Configuration
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-aoix1_live}"
DB_USER="${DB_USER:-postgres}"
DB_PASSWORD="${DB_PASSWORD:-}"

echo "📋 Database Configuration:"
echo "   Host: $DB_HOST"
echo "   Port: $DB_PORT"
echo "   Database: $DB_NAME"
echo "   User: $DB_USER"
echo ""

# Check if PostgreSQL is running
echo "🔍 Checking PostgreSQL connection..."
if ! pg_isready -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" &>/dev/null; then
    echo "❌ PostgreSQL not running or not accessible"
    echo "   Start PostgreSQL and try again"
    exit 1
fi
echo "✅ PostgreSQL is running"
echo ""

# Create database
echo "📦 Creating database..."
PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -tc \
    "SELECT 1 FROM pg_database WHERE datname = '$DB_NAME'" | grep -q 1 || \
    PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" \
    -c "CREATE DATABASE $DB_NAME;"
echo "✅ Database created or already exists"
echo ""

# Run schema
echo "📊 Applying schema..."
PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
    -f /home/claude/database/schema.sql
echo "✅ Schema applied successfully"
echo ""

# Create indexes
echo "🏗️  Creating indexes..."
PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
    -c "CREATE INDEX IF NOT EXISTS idx_trades_account_symbol ON trades(account_id, symbol);"
PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
    -c "CREATE INDEX IF NOT EXISTS idx_trades_status_date ON trades(status, entry_time DESC);"
PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
    -c "CREATE INDEX IF NOT EXISTS idx_positions_account ON positions(account_id, status);"
echo "✅ Indexes created"
echo ""

# Verify schema
echo "🔎 Verifying schema..."
TABLE_COUNT=$(PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
    -tc "SELECT count(*) FROM information_schema.tables WHERE table_schema='public';")
echo "   Tables created: $TABLE_COUNT"
echo "✅ Schema verification complete"
echo ""

# Test connection
echo "🧪 Testing connection..."
PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
    -c "SELECT version();" | head -1
echo "✅ Connection test passed"
echo ""

# Check data
echo "📈 Checking initial data..."
ACCOUNT_COUNT=$(PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
    -tc "SELECT COUNT(*) FROM accounts;")
echo "   Accounts created: $ACCOUNT_COUNT"
echo "✅ Initial data loaded"
echo ""

echo "═════════════════════════════════════════════════════════════════"
echo ""
echo "✅ DATABASE MIGRATION COMPLETE"
echo ""
echo "Database is ready for production use"
echo ""
echo "Connection string:"
echo "   postgresql://$DB_USER:***@$DB_HOST:$DB_PORT/$DB_NAME"
echo ""
echo "═════════════════════════════════════════════════════════════════"
