╔════════════════════════════════════════════════════════════════════════════════╗
║                                                                              ║
║               AOIX-1 RAILWAY DEPLOYMENT GUIDE                                ║
║                                                                              ║
║            Move from GitHub to Railway with PostgreSQL Database             ║
║                                                                              ║
╚════════════════════════════════════════════════════════════════════════════════╝

═════════════════════════════════════════════════════════════════════════════════════

ARCHITECTURE OVERVIEW

═════════════════════════════════════════════════════════════════════════════════════

RAILWAY DEPLOYMENT STRUCTURE:

┌─────────────────────────────────────────────────────────────────────┐
│                          RAILWAY PROJECT                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  WEB SERVICE (Node.js)                                       │  │
│  │  - AOIX-1 Trading Application                               │  │
│  │  - Port: 5000                                               │  │
│  │  - Memory: 4GB                                              │  │
│  │  - CPU: 2 cores                                             │  │
│  │  - Auto-scale: 1-5 instances                                │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                  │                                   │
│                    (TCP connection over Railway)                     │
│                                  │                                   │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  PostgreSQL DATABASE                                         │  │
│  │  - Version: 14                                               │  │
│  │  - Storage: 20GB                                             │  │
│  │  - Replicas: 1 (backup)                                      │  │
│  │  - Auto-backup: Daily (30-day retention)                     │  │
│  │  - Tables: 15+ (fully indexed)                               │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  VOLUMES                                                     │  │
│  │  - /app/logs (10GB): Transaction & error logs               │  │
│  │  - /app/backups (50GB): Database backups                    │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘

═════════════════════════════════════════════════════════════════════════════════════

STEP 1: INSTALL RAILWAY CLI

═════════════════════════════════════════════════════════════════════════════════════

Windows:
  $ choco install railway

macOS:
  $ brew install railway

Linux:
  $ curl -fsSL https://railway.app/install.sh | sh

Verify installation:
  $ railway --version

═════════════════════════════════════════════════════════════════════════════════════

STEP 2: AUTHENTICATE WITH RAILWAY

═════════════════════════════════════════════════════════════════════════════════════

Login to Railway:
  $ railway login

This will open a browser window to authenticate. Follow the prompts.

Verify authentication:
  $ railway whoami

═════════════════════════════════════════════════════════════════════════════════════

STEP 3: CREATE RAILWAY PROJECT

═════════════════════════════════════════════════════════════════════════════════════

Initialize project:
  $ railway init

When prompted:
  - Project name: aoix-1-trading
  - Environment: production

This creates a railway.toml configuration file.

═════════════════════════════════════════════════════════════════════════════════════

STEP 4: ADD PostgreSQL DATABASE

═════════════════════════════════════════════════════════════════════════════════════

Add PostgreSQL:
  $ railway add -p postgresql

This will:
  1. Provision PostgreSQL 14
  2. Create database: aoix1
  3. Create user: aoix_app
  4. Generate password
  5. Set DATABASE_URL environment variable

Verify:
  $ railway status

═════════════════════════════════════════════════════════════════════════════════════

STEP 5: CONFIGURE ENVIRONMENT VARIABLES

═════════════════════════════════════════════════════════════════════════════════════

Set Railway environment variables:
  $ railway variables set NODE_ENV=production
  $ railway variables set LOG_LEVEL=info
  $ railway variables set ENABLE_LIVE_TRADING=false
  $ railway variables set MAX_DAILY_LOSS_PERCENT=5
  $ railway variables set MAX_POSITION_SIZE_PERCENT=5
  $ railway variables set MAX_TRADES_PER_DAY=50
  $ railway variables set ENABLE_MONITORING=true

View all variables:
  $ railway variables

═════════════════════════════════════════════════════════════════════════════════════

STEP 6: DEPLOY APPLICATION

═════════════════════════════════════════════════════════════════════════════════════

Deploy to Railway:
  $ railway up

This will:
  1. Build Docker image
  2. Push to Railway registry
  3. Deploy application
  4. Initialize PostgreSQL schema
  5. Start services

Monitor deployment:
  $ railway logs --follow

═════════════════════════════════════════════════════════════════════════════════════

STEP 7: INITIALIZE DATABASE SCHEMA

═════════════════════════════════════════════════════════════════════════════════════

Once deployed, initialize the database:

  $ railway run npm run db:init

Or manually in Railway shell:
  $ railway shell
  # psql $DATABASE_URL < db/schema.sql

This will:
  1. Create all tables (15+ tables)
  2. Create indexes (auto-optimized)
  3. Set up views
  4. Configure user permissions
  5. Seed initial data

═════════════════════════════════════════════════════════════════════════════════════

STEP 8: RUN COMPREHENSIVE TESTS

═════════════════════════════════════════════════════════════════════════════════════

Run 45,000+ tests:

  $ railway run npm run test:comprehensive

Tests will run:
  ✅ Unit Tests (5,000+) - Core logic validation
  ✅ Integration Tests (5,000+) - Database operations
  ✅ Scenario Analysis (15,000+) - Different account sizes & markets
  ✅ Stress Tests (10,000+) - High-frequency scenarios
  ✅ Edge Cases (5,000+) - Boundary conditions
  ✅ Market Conditions (5,000+) - Up/down/volatile/crash scenarios

Expected results:
  • Total tests: 45,000+
  • Pass rate: 99%+
  • Duration: 5-10 minutes
  • Success criteria: 0 critical failures

═════════════════════════════════════════════════════════════════════════════════════

STEP 9: VERIFY DEPLOYMENT

═════════════════════════════════════════════════════════════════════════════════════

Check application health:
  $ curl https://[railway-app-url]/api/health

Should return:
  {
    "status": "healthy",
    "database": "connected",
    "version": "2.0.0",
    "timestamp": "2026-03-22T16:40:00Z"
  }

Check logs:
  $ railway logs --follow

Check deployment status:
  $ railway status

═════════════════════════════════════════════════════════════════════════════════════

STEP 10: CONFIGURE MONITORING & ALERTS

═════════════════════════════════════════════════════════════════════════════════════

In Railway dashboard:
  1. Go to Services → Web Service
  2. Click "Settings"
  3. Enable monitoring:
     ✓ CPU monitoring
     ✓ Memory monitoring
     ✓ Network monitoring
     ✓ Error tracking
  4. Set up alerts:
     - CPU > 80% → Email notification
     - Memory > 85% → Email notification
     - Error rate > 1% → Slack notification
     - Database connection down → PagerDuty alert

═════════════════════════════════════════════════════════════════════════════════════

STEP 11: CONFIGURE AUTO-SCALING

═════════════════════════════════════════════════════════════════════════════════════

In Railway dashboard:
  1. Services → Web Service → Settings
  2. Scaling policy:
     - Minimum instances: 1
     - Maximum instances: 5
     - Target CPU: 70%
     - Target memory: 80%
     - Scale up after: 2 minutes at high load
     - Scale down after: 5 minutes at low load

═════════════════════════════════════════════════════════════════════════════════════

STEP 12: CONFIGURE BACKUPS

═════════════════════════════════════════════════════════════════════════════════════

In Railway dashboard:
  1. Databases → PostgreSQL → Settings
  2. Backups:
     ✓ Enable automatic backups
     ✓ Backup schedule: Daily at 02:00 UTC
     ✓ Retention: 30 days
     ✓ Point-in-time recovery: Enabled
  3. Manual backup:
     $ railway backup create

═════════════════════════════════════════════════════════════════════════════════════

COMMON COMMANDS REFERENCE

═════════════════════════════════════════════════════════════════════════════════════

# Project management
railway init                    # Initialize new project
railway status                  # Check deployment status
railway logs                    # View application logs
railway logs --follow           # Stream logs in real-time
railway ps                      # List running services

# Database operations
railway run npm run db:init     # Initialize schema
railway shell                   # Open PostgreSQL shell
railway backup list             # List backups
railway backup create           # Create manual backup
railway backup restore <id>     # Restore from backup

# Variables & secrets
railway variables               # List environment variables
railway variables set KEY=VAL   # Set variable
railway variables get KEY       # Get variable value

# Testing & deployment
railway run npm test            # Run test suite
railway up                      # Deploy/redeploy
railway down                    # Stop services
railway env prod                # Switch to production
railway env dev                 # Switch to development

# Monitoring
railway metrics                 # View performance metrics
railway logs --service postgres # Database logs
railway logs --service web      # Application logs

═════════════════════════════════════════════════════════════════════════════════════

TROUBLESHOOTING

═════════════════════════════════════════════════════════════════════════════════════

DATABASE CONNECTION ISSUES:
  ✓ Check DATABASE_URL is set: railway variables get DATABASE_URL
  ✓ Verify database is running: railway status
  ✓ Check logs: railway logs --service postgres
  ✓ Reconnect: railway up (redeploy)

DEPLOYMENT FAILURES:
  ✓ Check logs: railway logs --follow
  ✓ Verify environment: railway env
  ✓ Reset services: railway down && railway up
  ✓ Clear cache: railway artifacts clear

HIGH MEMORY USAGE:
  ✓ Check processes: railway shell (then: ps aux)
  ✓ Increase memory: railway services edit [service] --memory 8Gi
  ✓ Restart service: railway restart [service]

SLOW PERFORMANCE:
  ✓ Check CPU: railway metrics
  ✓ Check database indexes: SELECT * FROM pg_indexes;
  ✓ Analyze query plans: EXPLAIN ANALYZE [query];
  ✓ Add indexes if needed: CREATE INDEX ...

═════════════════════════════════════════════════════════════════════════════════════

PRODUCTION CHECKLIST

═════════════════════════════════════════════════════════════════════════════════════

Before going live:
  ☐ Database schema verified
  ☐ All 45,000+ tests passing
  ☐ Environment variables configured
  ☐ Backups enabled and tested
  ☐ Monitoring and alerts set up
  ☐ Auto-scaling configured
  ☐ SSL/TLS certificate installed
  ☐ Security groups configured
  ☐ Rate limiting enabled
  ☐ Logging configured
  ☐ Error tracking enabled
  ☐ Performance metrics baseline established
  ☐ Incident response plan ready
  ☐ On-call rotation active
  ☐ Documentation complete

═════════════════════════════════════════════════════════════════════════════════════

POST-DEPLOYMENT MONITORING

═════════════════════════════════════════════════════════════════════════════════════

Daily checks:
  □ Review logs for errors
  □ Monitor CPU/memory usage
  □ Check trade execution metrics
  □ Verify backup completion
  □ Check alert/incident count

Weekly reviews:
  □ Performance analysis
  □ Database health check
  □ Query performance audit
  □ Security audit
  □ Capacity planning

Monthly:
  □ Disaster recovery test
  □ Full system audit
  □ Performance optimization
  □ Cost optimization
  □ Team training/updates

═════════════════════════════════════════════════════════════════════════════════════

SUPPORT & DOCUMENTATION

═════════════════════════════════════════════════════════════════════════════════════

Railway Documentation:
  https://docs.railway.app

PostgreSQL Documentation:
  https://www.postgresql.org/docs/14/

AOIX-1 Documentation:
  - OPERATIONS_MANUAL.md (daily operations)
  - GO_LIVE_CHECKLIST.md (pre-production verification)
  - UPGRADE_SPECIFICATIONS.md (system specifications)

═════════════════════════════════════════════════════════════════════════════════════

DEPLOYMENT COMPLETE ✅

═════════════════════════════════════════════════════════════════════════════════════

Your AOIX-1 trading system is now:
  ✅ Deployed on Railway
  ✅ Connected to PostgreSQL
  ✅ Tested (45,000+ tests)
  ✅ Monitored & backed up
  ✅ Production-ready

System status: LIVE AND OPERATING

═════════════════════════════════════════════════════════════════════════════════════
