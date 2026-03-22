#!/usr/bin/env bash

# AOIX-1 GO LIVE CHECKLIST
# =======================
# Follow this exactly. No skips.

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║         AOIX-1 GO LIVE CHECKLIST                           ║"
echo "║                                                            ║"
echo "║  Follow EXACTLY in order. This takes ~30 minutes.          ║"
echo "║                                                            ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# ============================================================================
# PHASE 1: ENVIRONMENT SETUP
# ============================================================================

echo -e "${BLUE}PHASE 1: ENVIRONMENT SETUP${NC}"
echo ""

# Check Node.js
echo "1. Checking Node.js..."
if ! command -v node &> /dev/null; then
  echo -e "${RED}✗ Node.js not found - install from https://nodejs.org/${NC}"
  exit 1
fi
NODE_VERSION=$(node --version)
echo -e "${GREEN}✓ Node.js ${NODE_VERSION}${NC}"

# Check pnpm
echo "2. Checking pnpm..."
if ! command -v pnpm &> /dev/null; then
  echo -e "${YELLOW}Installing pnpm...${NC}"
  npm install -g pnpm
fi
PNPM_VERSION=$(pnpm --version)
echo -e "${GREEN}✓ pnpm ${PNPM_VERSION}${NC}"

# Check dependencies
echo "3. Installing dependencies..."
if [ ! -d "node_modules" ]; then
  echo -e "${YELLOW}Running pnpm install...${NC}"
  pnpm install
fi
echo -e "${GREEN}✓ Dependencies installed${NC}"

echo ""

# ============================================================================
# PHASE 2: IBKR GATEWAY SETUP
# ============================================================================

echo -e "${BLUE}PHASE 2: IBKR GATEWAY SETUP${NC}"
echo ""

echo "1. Download IB Gateway"
echo "   Visit: https://www.interactivebrokers.com/en/trading/platforms/ib-gateway.php"
echo "   Download the latest version for your OS"
echo ""

echo "2. Install and Run IB Gateway"
echo "   - Install the downloaded file"
echo "   - Start IB Gateway"
echo "   - You should see login screen"
echo ""

echo "3. Log in to IB Gateway"
echo "   - Open browser: https://localhost:5000"
echo "   - Log in with your IB username/password"
echo "   - If prompted for 2FA, complete it"
echo "   - You should see authenticated dashboard"
echo ""

read -p "Press ENTER when logged into IB Gateway at https://localhost:5000"
echo ""

# Test IB Gateway connection
echo "4. Testing IB Gateway connection..."
if curl -s -k https://localhost:5000/ > /dev/null 2>&1; then
  echo -e "${GREEN}✓ IB Gateway responding on :5000${NC}"
else
  echo -e "${RED}✗ IB Gateway not responding - check if it's running on https://localhost:5000${NC}"
  echo "  Make sure IB Gateway is running and you're logged in"
  exit 1
fi

echo ""

# ============================================================================
# PHASE 3: GET SESSION TOKEN
# ============================================================================

echo -e "${BLUE}PHASE 3: GET SESSION TOKEN${NC}"
echo ""

echo "1. Open DevTools in IB Gateway"
echo "   - Go to: https://localhost:5000"
echo "   - Press F12 (or Cmd+Option+I on Mac)"
echo "   - Go to Network tab"
echo ""

echo "2. Find Session Cookie"
echo "   - Refresh the page (F5)"
echo "   - Look for a request to 'localhost:5000'"
echo "   - Click on it"
echo "   - Go to 'Cookies' tab"
echo "   - Find the 'api' cookie"
echo "   - Copy its VALUE (long string, starts with 'eyJ')"
echo ""

read -p "Paste your IB Gateway session token here: " IB_SESSION_TOKEN

if [ -z "$IB_SESSION_TOKEN" ]; then
  echo -e "${RED}✗ No token provided${NC}"
  exit 1
fi

echo -e "${GREEN}✓ Session token saved${NC}"
echo ""

# ============================================================================
# PHASE 4: CONFIGURE ENVIRONMENT
# ============================================================================

echo -e "${BLUE}PHASE 4: CONFIGURE ENVIRONMENT${NC}"
echo ""

echo "1. Creating .env.local..."

# Check if .env.local exists
if [ -f ".env.local" ]; then
  echo "   (Updating existing .env.local)"
  
  # Update session token
  sed -i.bak "s/IBKR_SESSION_TOKEN=.*/IBKR_SESSION_TOKEN=$IB_SESSION_TOKEN/" .env.local
  rm -f .env.local.bak
else
  echo "   (Creating new .env.local)"
  
  # Create .env.local from template or defaults
  cat > .env.local << EOF
# AOIX-1 TRADING SYSTEM CONFIGURATION

# Database (required - update with your database)
DATABASE_URL=mysql://user:password@localhost:3306/aoix1

# JWT Secret (keep this secret!)
JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")

# IBKR Gateway Configuration
IBKR_HOST=localhost
IBKR_PORT=5000
IBKR_ACCOUNT_ID=
IBKR_SESSION_TOKEN=$IB_SESSION_TOKEN

# Trading Configuration
ENABLE_LIVE_TRADING=false
NODE_ENV=development

# Frontend
VITE_APP_ID=aoix-1
VITE_OAUTH_PORTAL_URL=https://oauth.manus.im

# Server
PORT=3000
EOF
fi

echo -e "${GREEN}✓ .env.local configured${NC}"

echo ""

# ============================================================================
# PHASE 5: DATABASE
# ============================================================================

echo -e "${BLUE}PHASE 5: DATABASE${NC}"
echo ""

echo "1. Verify database connection"
echo "   Edit .env.local and update DATABASE_URL if needed"
echo ""

echo "2. Run migrations"
echo -e "${YELLOW}Running: pnpm db:push${NC}"
pnpm db:push
echo -e "${GREEN}✓ Database ready${NC}"

echo ""

# ============================================================================
# PHASE 6: START SYSTEM
# ============================================================================

echo -e "${BLUE}PHASE 6: START SYSTEM${NC}"
echo ""

echo -e "${YELLOW}Starting development server...${NC}"
echo ""
echo "You should see:"
echo "  ✓ [Trading] Initializing unified trading system..."
echo "  ✓ [Trading] IBKR Gateway connected"
echo "  ✓ [Trading] Trading engine ready"
echo "  ✓ [Trading] Market scanner ready"
echo ""

read -p "Ready to start? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "Cancelled."
  exit 0
fi

echo ""
pnpm dev

# Note: Server should auto-open browser
# If not, manually open: http://localhost:3000

exit 0

# ============================================================================
# POST-STARTUP STEPS (if you get here, server is running)
# ============================================================================

# 1. Open http://localhost:3000/dashboard
# 2. You should see:
#    - IBKR Status: Connected ✅
#    - Trading Engine: Ready
#    - Market Scanner: Ready
#
# 3. Test strike validation
#    - Go to scanner
#    - Click "Scan Market"
#    - Should see opportunities with validated strikes
#
# 4. Start engine
#    - Click "Start Engine"
#    - Engine should begin scanning for opportunities
#    - Watch for trades opening
#
# 5. Monitor
#    - Watch dashboard P&L
#    - Watch open positions
#    - Watch execution log
#
# ============================================================================
