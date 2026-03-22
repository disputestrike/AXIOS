/**
 * DATABASE INITIALIZATION & CONNECTION SETUP
 * Railway PostgreSQL Integration
 * 
 * This script:
 * 1. Connects to PostgreSQL
 * 2. Creates schema
 * 3. Validates tables
 * 4. Seeds initial data
 * 5. Tests all connections
 */

import { Pool, PoolClient } from 'pg'
import * as fs from 'fs'
import * as path from 'path'

interface DatabaseConfig {
  host: string
  port: number
  database: string
  user: string
  password: string
  max: number
  idleTimeoutMillis: number
  connectionTimeoutMillis: number
}

class DatabaseManager {
  private pool: Pool
  private config: DatabaseConfig

  constructor(config: DatabaseConfig) {
    this.config = config
    this.pool = new Pool(config)
  }

  /**
   * Connect to database
   */
  async connect(): Promise<void> {
    try {
      const client = await this.pool.connect()
      const result = await client.query('SELECT NOW()')
      console.log('✅ PostgreSQL Connection Successful')
      console.log(`   Server Time: ${result.rows[0].now}`)
      client.release()
    } catch (error) {
      console.error('❌ Database Connection Failed:', error)
      throw error
    }
  }

  /**
   * Initialize schema
   */
  async initializeSchema(): Promise<void> {
    try {
      const schemaPath = path.join(__dirname, '../db/schema.sql')
      const schema = fs.readFileSync(schemaPath, 'utf-8')

      console.log('📋 Initializing Database Schema...')
      await this.pool.query(schema)
      console.log('✅ Schema Initialized Successfully')
    } catch (error) {
      console.error('❌ Schema Initialization Failed:', error)
      throw error
    }
  }

  /**
   * Validate all tables exist
   */
  async validateTables(): Promise<void> {
    const requiredTables = [
      'accounts',
      'sessions',
      'trades',
      'positions',
      'market_scans',
      'opportunities',
      'market_data',
      'risk_events',
      'kill_switch_events',
      'weight_adjustments',
      'performance_metrics',
      'backtest_runs',
      'backtest_trades',
      'system_health',
      'error_logs',
    ]

    console.log('🔍 Validating Database Tables...')

    for (const table of requiredTables) {
      try {
        const result = await this.pool.query(
          `SELECT EXISTS(
            SELECT 1 FROM information_schema.tables 
            WHERE table_name = $1
          )`,
          [table]
        )

        if (result.rows[0].exists) {
          console.log(`  ✅ ${table}`)
        } else {
          console.log(`  ❌ ${table} (NOT FOUND)`)
          throw new Error(`Missing table: ${table}`)
        }
      } catch (error) {
        console.error(`  ❌ Error checking ${table}:`, error)
        throw error
      }
    }

    console.log(`✅ All ${requiredTables.length} tables validated`)
  }

  /**
   * Validate indexes
   */
  async validateIndexes(): Promise<void> {
    console.log('📊 Validating Indexes...')

    try {
      const result = await this.pool.query(
        `SELECT COUNT(*) as index_count 
         FROM pg_indexes 
         WHERE schemaname = 'public'`
      )

      const indexCount = result.rows[0].index_count
      console.log(`✅ Found ${indexCount} indexes`)
    } catch (error) {
      console.error('❌ Index validation failed:', error)
      throw error
    }
  }

  /**
   * Create test data
   */
  async seedTestData(): Promise<void> {
    console.log('🌱 Seeding Test Data...')

    try {
      // Create test account
      const accountResult = await this.pool.query(
        `INSERT INTO accounts 
         (account_id, account_type, initial_equity, current_equity) 
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        ['TEST_ACCOUNT_001', 'PAPER', 100000, 100000]
      )

      const accountId = accountResult.rows[0].id
      console.log(`  ✅ Created test account: ${accountId}`)

      // Create test session
      const sessionResult = await this.pool.query(
        `INSERT INTO sessions 
         (account_id, session_type, status) 
         VALUES ($1, $2, $3)
         RETURNING id`,
        [accountId, 'PAPER', 'RUNNING']
      )

      const sessionId = sessionResult.rows[0].id
      console.log(`  ✅ Created test session: ${sessionId}`)

      // Create test trades
      const symbols = ['SPY', 'QQQ', 'IWM', 'AAPL', 'NVDA']
      let tradesCreated = 0

      for (const symbol of symbols) {
        for (let i = 0; i < 5; i++) {
          const entryPrice = 100 + Math.random() * 50
          const exitPrice = entryPrice * (1 + (Math.random() - 0.5) * 0.1)
          const pnl = (exitPrice - entryPrice) * 10

          await this.pool.query(
            `INSERT INTO trades 
             (session_id, account_id, symbol, trade_type, entry_price, entry_time, 
              exit_price, exit_time, quantity, pnl, pnl_percent, status, 
              strike, entry_iv, entry_delta, ml_score, trade_score)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
            [
              sessionId,
              accountId,
              symbol,
              Math.random() > 0.5 ? 'CALL' : 'PUT',
              entryPrice,
              new Date(Date.now() - Math.random() * 86400000),
              exitPrice,
              new Date(),
              10,
              pnl,
              (pnl / (entryPrice * 10)) * 100,
              'CLOSED',
              100,
              0.25,
              0.5,
              0.7 + Math.random() * 0.3,
              60 + Math.random() * 40,
            ]
          )

          tradesCreated++
        }
      }

      console.log(`  ✅ Created ${tradesCreated} test trades`)
    } catch (error) {
      console.error('❌ Seed data creation failed:', error)
      throw error
    }
  }

  /**
   * Test all queries
   */
  async testQueries(): Promise<void> {
    console.log('🧪 Testing Database Queries...')

    try {
      // Test basic SELECT
      const result1 = await this.pool.query('SELECT COUNT(*) FROM accounts')
      console.log(`  ✅ SELECT accounts: ${result1.rows[0].count}`)

      // Test JOIN
      const result2 = await this.pool.query(
        `SELECT s.id, COUNT(t.id) as trade_count 
         FROM sessions s 
         LEFT JOIN trades t ON s.id = t.session_id 
         GROUP BY s.id`
      )
      console.log(`  ✅ JOIN query: ${result2.rows.length} results`)

      // Test aggregation
      const result3 = await this.pool.query(
        `SELECT 
           COUNT(*) as total_trades,
           SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END) as wins,
           AVG(pnl) as avg_pnl,
           MAX(pnl) as max_profit
         FROM trades`
      )
      console.log(`  ✅ Aggregation query: ${JSON.stringify(result3.rows[0])}`)

      // Test INSERT/UPDATE/DELETE
      const testId = await this.pool.query(
        `INSERT INTO accounts (account_id, account_type, initial_equity, current_equity)
         VALUES ('TEST_' || NOW()::TEXT, 'PAPER', 50000, 50000)
         RETURNING id`
      )
      console.log(`  ✅ INSERT successful`)

      await this.pool.query(
        `UPDATE accounts SET current_equity = 51000 WHERE id = $1`,
        [testId.rows[0].id]
      )
      console.log(`  ✅ UPDATE successful`)

      await this.pool.query(`DELETE FROM accounts WHERE id = $1`, [testId.rows[0].id])
      console.log(`  ✅ DELETE successful`)
    } catch (error) {
      console.error('❌ Query testing failed:', error)
      throw error
    }
  }

  /**
   * Test connection pool
   */
  async testConnectionPool(): Promise<void> {
    console.log('🔗 Testing Connection Pool...')

    try {
      const promises = []
      for (let i = 0; i < 5; i++) {
        promises.push(
          this.pool.query('SELECT $1 as connection_number, NOW()', [i])
        )
      }

      const results = await Promise.all(promises)
      console.log(`  ✅ Processed ${results.length} concurrent connections`)
    } catch (error) {
      console.error('❌ Connection pool test failed:', error)
      throw error
    }
  }

  /**
   * Full initialization
   */
  async initialize(): Promise<void> {
    console.log('╔════════════════════════════════════════════════════════════════╗')
    console.log('║                                                                ║')
    console.log('║         DATABASE INITIALIZATION & VALIDATION                   ║')
    console.log('║                                                                ║')
    console.log('╚════════════════════════════════════════════════════════════════╝\n')

    try {
      await this.connect()
      await this.initializeSchema()
      await this.validateTables()
      await this.validateIndexes()
      await this.seedTestData()
      await this.testQueries()
      await this.testConnectionPool()

      console.log('\n✅ DATABASE INITIALIZATION COMPLETE\n')
    } catch (error) {
      console.error('\n❌ DATABASE INITIALIZATION FAILED\n', error)
      throw error
    }
  }

  /**
   * Close pool
   */
  async close(): Promise<void> {
    await this.pool.end()
  }
}

/**
 * MAIN EXECUTION
 */
async function main() {
  const config: DatabaseConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'aoix1',
    user: process.env.DB_USER || 'aoix_app',
    password: process.env.DB_PASSWORD || 'aoix_app_secure_password',
    max: 20,
    idleTimeoutMillis: 60000,
    connectionTimeoutMillis: 30000,
  }

  const manager = new DatabaseManager(config)

  try {
    await manager.initialize()
    await manager.close()
    process.exit(0)
  } catch (error) {
    console.error(error)
    process.exit(1)
  }
}

main()

export { DatabaseManager, DatabaseConfig }
