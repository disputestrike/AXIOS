# AOIX-1: Autonomous Trading System

A fully autonomous trading system that connects to Interactive Brokers via TWS API for real-time market data, signal generation, and automated trade execution.

## 🚀 Quick Start

### Prerequisites

- **Node.js 22+** - [Download](https://nodejs.org/)
- **pnpm** - Install with `npm install -g pnpm`
- **MySQL/TiDB Database** - Local or remote connection
- **IB Gateway** (Optional) - For real market data on localhost:4001

### Installation

1. **Clone and install dependencies**
   ```bash
   pnpm install
   ```

2. **Configure environment**
   ```bash
   # Copy the example file
   cp .env.local.example .env.local
   
   # Edit .env.local and fill in your values
   # See .env.local.example for all required variables
   ```

3. **Verify setup**
   ```bash
   pnpm verify
   ```

4. **Run database migrations**
   ```bash
   pnpm db:push
   ```

5. **Start development server**

   **Windows:**
   ```powershell
   .\START_LOCAL.ps1
   ```

   **Mac/Linux:**
   ```bash
   ./START_LOCAL.sh
   ```

   **Or manually:**
   ```bash
   pnpm dev
   ```

6. **Open in browser**
   - Frontend: http://localhost:5173
   - API: http://localhost:3000

### Deploy with Docker (10/10 Ecosystem)

```bash
docker build -t aoix-1 .
docker run -p 3000:3000 --env-file .env.local aoix-1
```

Requires built assets and `NODE_ENV=production`. See `docs/RUNBOOK.md` for config and troubleshooting.

## 📋 Environment Variables

Create a `.env.local` file in the project root with the following variables:

### Required Variables

```env
# Database Connection
DATABASE_URL=mysql://user:password@host:port/database

# JWT Secret (generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
JWT_SECRET=your-secret-key-here

# OAuth Configuration
VITE_APP_ID=your_app_id
OAUTH_SERVER_URL=https://api.manus.im
VITE_OAUTH_PORTAL_URL=https://oauth.manus.im

# Owner Information
OWNER_NAME=Your Name
OWNER_OPEN_ID=your_open_id

# Forge API Configuration
BUILT_IN_FORGE_API_URL=https://api.manus.im
BUILT_IN_FORGE_API_KEY=your_api_key
VITE_FRONTEND_FORGE_API_URL=https://api.manus.im
VITE_FRONTEND_FORGE_API_KEY=your_frontend_key

# Interactive Brokers Gateway (Optional)
TWS_HOST=localhost
TWS_PORT=4001
```

See `.env.local.example` for the complete template with descriptions.

## 🏗️ Project Structure

```
aoix-1/
├── client/              # React frontend
│   └── src/
│       ├── pages/       # Dashboard pages
│       ├── components/  # UI components
│       └── lib/         # Utilities
├── server/              # Express backend
│   ├── _core/           # Core server setup
│   ├── routers/        # tRPC routers
│   └── services/       # Business logic
├── shared/              # Shared types and constants
├── drizzle/             # Database schema and migrations
└── scripts/             # Utility scripts
```

## 📚 Available Scripts

- `pnpm dev` - Start development server with hot reload
- `pnpm build` - Build for production
- `pnpm start` - Start production server
- `pnpm test` - Run tests
- `pnpm verify` - Verify setup and configuration
- `pnpm setup` - Run verification, install deps, and migrate database
- `pnpm db:push` - Generate and run database migrations
- `pnpm db:migrate` - Run database migrations
- `pnpm db:generate` - Generate migration files
- `pnpm check` - Type check without emitting
- `pnpm format` - Format code with Prettier

## 🎯 Key Features

### Market Scanner
- Scans 500+ stocks for trading opportunities
- Generates Class A/B/C/D signals based on market conditions
- Ranks opportunities by profit probability (0-100)
- Updates in real-time as market conditions change

### Autonomous Trading Engine
- Executes trades automatically on high-confidence signals
- Risk management: 1% max risk per trade, 3 max positions, 5% daily loss limit
- Automatic exits: +30% take profit, -20% stop loss, 10% trailing stop
- Kill switch: Stops trading if ruin probability exceeds 10%

### Dashboards
- **Auto Trading** - Engine status, P&L, positions, recent trades
- **Market Opportunities** - Top 20 ranked trading opportunities
- **System Health** - Component status and performance metrics
- **Market Data** - Real-time prices, IV, GEX/DEX levels
- **Regime Classification** - Market regime identification
- **Signal Taxonomy** - Active signals with confidence scores
- **Risk Engine** - Portfolio risk monitoring
- **Execution Dashboard** - Trade execution and monitoring
- **Meta-Intelligence** - System self-awareness metrics
- **Failure Taxonomy** - Loss analysis and learning
- **Shadow System** - Ruin probability simulations
- **Cross-Asset Reflexivity** - Correlation monitoring

## 🔧 Configuration

### Database Setup

1. **Create database** (if using local MySQL)
   ```sql
   CREATE DATABASE aoix1;
   ```

2. **Run migrations**
   ```bash
   pnpm db:push
   ```

3. **Verify connection**
   ```bash
   pnpm verify
   ```

### IB Gateway Setup (Optional)

1. **Download and install** IB Gateway from Interactive Brokers
2. **Configure API settings:**
   - Enable ActiveX and Socket Clients
   - Set Socket Port to 4001
   - Allow connections from localhost only
3. **Start IB Gateway** and log in
4. **Verify connection** in System Health dashboard

See `IB_GATEWAY_SETUP.md` for detailed instructions.

## 🐛 Troubleshooting

### Port Already in Use

If port 3000 is busy, the server will automatically find the next available port. You can also set a custom port:

```env
PORT=3001
```

### Database Connection Failed

1. Verify `DATABASE_URL` is correct in `.env.local`
2. Check database is running
3. Verify network connectivity
4. Check firewall settings

### IB Gateway Not Connecting

1. Use **Client Portal Gateway** (port 5000), not the old socket Gateway. See **IB_GATEWAY_SETUP.md** and **IB_CLIENT_PORTAL_5000.md**.
2. Start the Gateway, open http://localhost:5000 in your browser, and log in. If you see **"Authentication failed"**, that's your IB credentials or 2FA — see **IB_GATEWAY_SETUP.md** → "Login page shows Authentication failed".
3. Set `IB_GATEWAY_COOKIE=api=...` in `.env.local` (copy the `api` cookie from DevTools after logging in at localhost:5000) and restart the server.
4. Check `TWS_PORT=5000` in `.env.local` and that the firewall allows localhost:5000.

### Missing Environment Variables

1. Copy `.env.local.example` to `.env.local`
2. Fill in all required values
3. Run `pnpm verify` to check

### Module Not Found

1. Run `pnpm install`
2. Clear `node_modules` and reinstall
3. Check Node.js version compatibility (22+)

## 📖 Documentation

- **[LOCAL_DEPLOYMENT.md](./LOCAL_DEPLOYMENT.md)** - Detailed local deployment guide
- **[QUICKSTART.md](./QUICKSTART.md)** - Quick start guide for trading
- **[IB_GATEWAY_SETUP.md](./IB_GATEWAY_SETUP.md)** - IB Gateway configuration
- **[ANALYSIS_AND_IMPROVEMENT_PLAN.md](./ANALYSIS_AND_IMPROVEMENT_PLAN.md)** - Complete analysis and improvement plan
- **[TODO.md](./todo.md)** - Project roadmap and todos

## 🧪 Testing

Run the test suite:

```bash
pnpm test
```

The project includes 92+ unit tests covering core functionality.

## 🔒 Security Notes

1. **Never commit `.env.local`** - Contains sensitive credentials
2. **Use paper trading first** - Test thoroughly before live trading
3. **Keep IB Gateway secure** - Only allow localhost connections
4. **Monitor regularly** - Check System Health dashboard
5. **Backup settings** - Save your configuration regularly

## 📝 Development

### Code Structure

- **Frontend**: React with TypeScript, Vite, tRPC
- **Backend**: Express with tRPC, Drizzle ORM
- **Database**: MySQL/TiDB with Drizzle migrations
- **Real-time**: Socket.io for live updates

### Adding New Features

1. Create tRPC router in `server/routers/`
2. Add frontend page in `client/src/pages/`
3. Update database schema if needed
4. Run migrations: `pnpm db:push`
5. Test thoroughly

## 🤝 Support

For issues or questions:

1. Check System Health dashboard for component status
2. Review logs in `.manus-logs/` directory
3. Verify all prerequisites are installed
4. Ensure IB Gateway is properly configured (if using)

## 📄 License

MIT

---

**Status:** ✅ Ready for local development

For detailed setup instructions, see [ANALYSIS_AND_IMPROVEMENT_PLAN.md](./ANALYSIS_AND_IMPROVEMENT_PLAN.md)
