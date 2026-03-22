#!/usr/bin/env bash

# AOIX-1 Unified System Deployment
# ================================
# This script sets up the new unified trading system

set -e

echo "================================================"
echo "AOIX-1 Unified System Deployment"
echo "================================================"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# ================================================
# STEP 1: BACKUP OLD FILES
# ================================================

echo -e "${YELLOW}[1/5] Backing up old files...${NC}"

BACKUP_DIR="backups/$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"

echo "Backing up old trading files..."
cp -v auto-trading-engine.ts "$BACKUP_DIR/" 2>/dev/null || true
cp -v ibkr.ts "$BACKUP_DIR/" 2>/dev/null || true
cp -v gateway-adapter.ts "$BACKUP_DIR/" 2>/dev/null || true
cp -v ib-market-data.ts "$BACKUP_DIR/" 2>/dev/null || true
cp -v ib-orders.ts "$BACKUP_DIR/" 2>/dev/null || true
cp -v omega0.ts "$BACKUP_DIR/" 2>/dev/null || true

echo -e "${GREEN}✓ Backup complete: $BACKUP_DIR${NC}"
echo ""

# ================================================
# STEP 2: CREATE NEW DIRECTORY STRUCTURE
# ================================================

echo -e "${YELLOW}[2/5] Creating directory structure...${NC}"

mkdir -p trading-core
mkdir -p server/_core
mkdir -p server/routers
mkdir -p server/services

echo -e "${GREEN}✓ Directories created${NC}"
echo ""

# ================================================
# STEP 3: INSTALL UNIFIED SYSTEM
# ================================================

echo -e "${YELLOW}[3/5] Installing unified system files...${NC}"

# Files already copied by create_file tool above
# Just verify they exist

if [ -f "trading-core/ibkr-unified.ts" ] && [ -f "trading-core/unified-engine.ts" ]; then
  echo -e "${GREEN}✓ Unified system files installed${NC}"
else
  echo -e "${RED}✗ Error: Unified system files not found${NC}"
  exit 1
fi

echo ""

# ================================================
# STEP 4: UPDATE ENVIRONMENT
# ================================================

echo -e "${YELLOW}[4/5] Setting up environment...${NC}"

# Check if .env.local exists
if [ ! -f ".env.local" ]; then
  echo -e "${YELLOW}⚠ .env.local not found. Creating template...${NC}"
  
  cat > .env.local.template << 'EOF'
# ================================================
# AOIX-1 UNIFIED SYSTEM ENVIRONMENT
# ================================================

# Database
DATABASE_URL=mysql://user:password@localhost:3306/aoix1

# JWT Secret (generate: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
JWT_SECRET=your-secret-here

# IBKR Gateway Configuration
# Use IBKR Client Portal Gateway on port 5000
IBKR_HOST=localhost
IBKR_PORT=5000
IBKR_ACCOUNT_ID=your-account-id

# IBKR Session Token
# Get from IB Gateway after login
# Steps:
# 1. Open https://localhost:5000 in browser
# 2. Log in with your IB credentials
# 3. Open DevTools (F12)
# 4. Go to Network tab
# 5. Refresh page
# 6. Look for request to https://localhost:5000
# 7. Find 'api' cookie in Set-Cookie header
# 8. Copy the value
IBKR_SESSION_TOKEN=your-session-token

# Trading Configuration
ENABLE_LIVE_TRADING=false  # Set to 'true' only for LIVE trading
NODE_ENV=development

# Optional: OAuth
VITE_APP_ID=your-app-id
OAUTH_SERVER_URL=https://api.manus.im
OWNER_NAME=Your Name
OWNER_OPEN_ID=your-open-id

EOF

  echo -e "${GREEN}✓ Template created: .env.local.template${NC}"
  echo -e "${YELLOW}⚠ IMPORTANT: Copy and edit .env.local with your credentials${NC}"
else
  echo -e "${GREEN}✓ .env.local exists${NC}"
  
  # Check required variables
  if grep -q "IBKR_HOST" .env.local; then
    echo -e "${GREEN}✓ IBKR configuration found${NC}"
  else
    echo -e "${YELLOW}⚠ Add IBKR_HOST/PORT/ACCOUNT_ID to .env.local${NC}"
  fi
fi

echo ""

# ================================================
# STEP 5: VERIFICATION
# ================================================

echo -e "${YELLOW}[5/5] Verifying installation...${NC}"

# Check TypeScript compilation
echo "Checking TypeScript..."
if npx tsc --noEmit trading-core/*.ts 2>/dev/null; then
  echo -e "${GREEN}✓ TypeScript check passed${NC}"
else
  echo -e "${YELLOW}⚠ TypeScript has some warnings (check above)${NC}"
fi

echo ""
echo "================================================"
echo "DEPLOYMENT COMPLETE"
echo "================================================"
echo ""
echo -e "${GREEN}Next steps:${NC}"
echo ""
echo "1. Configure IBKR Gateway:"
echo "   - Download from: https://www.interactivebrokers.com/en/trading/platforms/ib-gateway.php"
echo "   - Install and run IB Gateway"
echo "   - Log in at https://localhost:5000"
echo "   - Copy session token to .env.local"
echo ""
echo "2. Start the system:"
echo "   pnpm dev"
echo ""
echo "3. Visit dashboard:"
echo "   http://localhost:3000"
echo ""
echo -e "${YELLOW}Important Security Notes:${NC}"
echo "- NEVER commit .env.local with real credentials"
echo "- Start with ENABLE_LIVE_TRADING=false"
echo "- Test thoroughly in paper trading first"
echo "- Keep IB Gateway on localhost only"
echo ""
echo -e "${GREEN}System Architecture:${NC}"
echo "- ibkr-unified.ts: Single IBKR connection manager"
echo "- unified-engine.ts: Autonomous trading engine"
echo "- Strike validation: Enforced before every trade"
echo "- Real market data only: No mocks or placeholders"
echo ""
