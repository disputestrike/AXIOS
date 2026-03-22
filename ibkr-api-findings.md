# IBKR API Authentication Research Findings

## Key Discovery: OAuth 1.0a is for Licensed Entities Only

From IBKR documentation:
> "Interactive Brokers offers an OAuth 1.0a authentication procedure for **licensed Financial Advisors, Organizations, IBrokers, and third party services**."

**This means individual accounts CANNOT use OAuth 1.0a directly.**

## Authentication Options for Individual Accounts

### 1. Client Portal Gateway (Current Limitation)
- Requires running Java gateway on localhost
- Must authenticate through browser on same machine
- All API calls must originate from same machine
- **This is what our current implementation uses**

### 2. OAuth 1.0a (NOT Available for Individual Accounts)
- Only for: Financial Advisors, Organizations, IBrokers, Third-party services
- Requires approval process from IBKR
- First Party OAuth: Self-Service Portal registration
- Third Party OAuth: Full vetting process (6-12 weeks)

## Critical Limitation
> "For individual accounts looking to access the WebAPI, developers **must authenticate using the Client Portal Gateway**"

## Alternative Approaches

### Option A: Run IB Gateway in Cloud (Docker)
- Deploy IB Gateway/TWS in a cloud container
- Authenticate once manually
- Keep session alive with /tickle endpoint
- Our server connects to cloud-hosted gateway

### Option B: Use ib_insync with IB Gateway
- ib_insync library connects to TWS/IB Gateway
- Can run IB Gateway headless in Docker
- Still requires initial 2FA authentication

### Option C: Paper Trading Simulation Mode
- Build simulation engine that mimics IBKR behavior
- Use real market data (Polygon.io)
- Execute virtual trades with realistic fills
- Track P&L, positions, risk metrics
- **Best option for fully autonomous operation without IBKR dependency**

## Recommendation

Since the user wants **fully automatic trading without manual intervention**, and IBKR's API requires either:
1. Localhost Gateway with manual browser auth
2. OAuth 1.0a (only for licensed entities)

**The best approach is to build a sophisticated paper trading simulation engine** that:
1. Uses real market data from Polygon.io
2. Simulates realistic order execution with slippage
3. Tracks positions, P&L, and performance metrics
4. Implements all risk management rules
5. Can later be connected to real IBKR when user runs Gateway

This allows the system to operate fully autonomously while demonstrating the trading logic works correctly.

## API Endpoints Reference (for future IBKR integration)

Base URL (OAuth): https://api.ibkr.com/v1/api
Base URL (Gateway): https://localhost:5000/v1/api

Key endpoints:
- POST /iserver/account/{accountId}/orders - Place orders
- GET /iserver/account/orders - Get live orders
- GET /portfolio/{accountId}/positions - Get positions
- GET /iserver/marketdata/snapshot - Market data
- POST /iserver/auth/ssodh/init - Initialize brokerage session
- GET /tickle - Keep session alive (every 60s)
