/**
 * SERVER INTEGRATION GUIDE
 * 
 * How to integrate the unified trading system into your existing index.ts
 */

// ============================================================================
// STEP 1: Update server/_core/index.ts
// ============================================================================

// Add these imports at the top:
import { setupTradingSystemOnStart, shutdownTradingSystem } from './trading-init';

// Update the startServer() function. After creating the Express app:

/*
async function startServer() {
  // ... existing code ...
  
  const app = express();
  const server = createServer(app);
  
  // IMPORTANT: Initialize trading system before starting server
  console.log('🚀 Starting AOIX-1 Trading System...');
  await setupTradingSystemOnStart();
  
  // ... rest of existing code ...
  
  // Add graceful shutdown
  process.on('SIGINT', async () => {
    console.log('📍 Graceful shutdown initiated...');
    await shutdownTradingSystem();
    process.exit(0);
  });
  
  process.on('SIGTERM', async () => {
    console.log('📍 Graceful shutdown initiated...');
    await shutdownTradingSystem();
    process.exit(0);
  });
  
  return new Promise<{ server: ReturnType<typeof createServer>; port: number }>((resolve) => {
    server.listen(port, async () => {
      const url = "http://localhost:" + port + "/";
      console.log("");
      console.log(">>> Server running: " + url);
      console.log("");
      console.log(">>> Trading System Ready: http://localhost:" + port + "/dashboard");
      console.log("");
      resolve({ server, port });
    });
  });
}
*/

// ============================================================================
// STEP 2: Update .env.local
// ============================================================================

/*
# IBKR Gateway Configuration
IBKR_HOST=localhost
IBKR_PORT=5000
IBKR_ACCOUNT_ID=your-account-id
IBKR_SESSION_TOKEN=your-session-from-ib-gateway

# Trading Configuration
ENABLE_LIVE_TRADING=false
*/

// ============================================================================
// STEP 3: Create Frontend Hook (client/src/hooks/useTrading.ts)
// ============================================================================

/*
import { trpc } from '@/lib/trpc';
import { useEffect } from 'react';

export function useTrading() {
  const query = trpc.trading.getSystemStatus.useQuery();
  const startMutation = trpc.trading.startEngine.useMutation();
  const stopMutation = trpc.trading.stopEngine.useMutation();
  const scanMutation = trpc.trading.scanMarket.useMutation();
  const connectIBKRMutation = trpc.trading.connectIBKR.useMutation();
  
  const healthCheck = trpc.trading.healthCheck.useQuery(undefined, {
    refetchInterval: 5000, // Refresh every 5 seconds
  });

  return {
    // Status
    status: query.data,
    isLoading: query.isLoading,
    
    // Engine control
    startEngine: () => startMutation.mutate(),
    stopEngine: () => stopMutation.mutate(),
    isEngineRunning: query.data?.engine.isRunning ?? false,
    
    // IBKR
    connectIBKR: (token: string) => 
      connectIBKRMutation.mutate({ sessionToken: token }),
    isIBKRConnected: query.data?.ibkr.connected ?? false,
    
    // Scanning
    scanMarket: () => scanMutation.mutate(),
    isScanning: scanMutation.isLoading,
    
    // Health
    health: healthCheck.data,
  };
}
*/

// ============================================================================
// STEP 4: Create Dashboard Component (client/src/pages/TradingDashboard.tsx)
// ============================================================================

/*
import { useTrading } from '@/hooks/useTrading';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function TradingDashboard() {
  const trading = useTrading();

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-3xl font-bold">AOIX-1 Trading System</h1>

      {/* IBKR Connection */}
      <Card>
        <CardHeader>
          <CardTitle>IBKR Connection</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <span>Status:</span>
            <span className={trading.isIBKRConnected ? 'text-green-600' : 'text-red-600'}>
              {trading.isIBKRConnected ? '✅ Connected' : '❌ Disconnected'}
            </span>
          </div>
          <Button onClick={() => {
            const token = prompt('Enter IBKR session token:');
            if (token) trading.connectIBKR(token);
          }}>
            Connect to IB Gateway
          </Button>
        </CardContent>
      </Card>

      {/* Engine Control */}
      <Card>
        <CardHeader>
          <CardTitle>Trading Engine</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <span>Status:</span>
            <span className={trading.isEngineRunning ? 'text-green-600' : 'text-gray-600'}>
              {trading.isEngineRunning ? '🚀 Running' : '⏹️  Stopped'}
            </span>
          </div>
          <div className="flex gap-2">
            <Button 
              onClick={() => trading.startEngine()}
              disabled={!trading.isIBKRConnected || trading.isEngineRunning}
            >
              Start Engine
            </Button>
            <Button 
              onClick={() => trading.stopEngine()}
              disabled={!trading.isEngineRunning}
              variant="destructive"
            >
              Stop Engine
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Market Scanning */}
      <Card>
        <CardHeader>
          <CardTitle>Market Scanner</CardTitle>
        </CardHeader>
        <CardContent>
          <Button 
            onClick={() => trading.scanMarket()}
            disabled={trading.isScanning}
          >
            {trading.isScanning ? 'Scanning...' : 'Scan Market'}
          </Button>
        </CardContent>
      </Card>

      {/* Statistics */}
      {trading.status && (
        <Card>
          <CardHeader>
            <CardTitle>Statistics</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-sm text-gray-600">Balance</div>
              <div className="text-2xl font-bold">
                ${trading.status.engine.balance.toLocaleString()}
              </div>
            </div>
            <div>
              <div className="text-sm text-gray-600">P&L</div>
              <div className={`text-2xl font-bold ${
                trading.status.engine.pnl >= 0 ? 'text-green-600' : 'text-red-600'
              }`}>
                ${trading.status.engine.pnl.toLocaleString()}
              </div>
            </div>
            <div>
              <div className="text-sm text-gray-600">Positions</div>
              <div className="text-2xl font-bold">
                {trading.status.engine.positions}
              </div>
            </div>
            <div>
              <div className="text-sm text-gray-600">Exposure</div>
              <div className="text-2xl font-bold">
                ${trading.status.risk.currentExposure.toLocaleString()}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
*/

// ============================================================================
// TESTING CHECKLIST
// ============================================================================

/*
After integration, test in this order:

1. Server Startup
   ✅ npm run dev
   ✅ Check logs for "AOIX-1 UNIFIED TRADING SYSTEM"
   ✅ Should see initialization messages

2. Health Check
   ✅ curl http://localhost:3000/api/health
   ✅ Should return system status

3. IBKR Connection
   ✅ Visit https://localhost:5000
   ✅ Log in with IB credentials
   ✅ Get session token from DevTools
   ✅ Call trading.connectIBKR with token
   ✅ Should show ✅ Connected

4. Market Scanner
   ✅ Call trading.scanMarket()
   ✅ Should return top 50 opportunities
   ✅ Verify strikes are validated

5. Engine Start
   ✅ Call trading.startEngine()
   ✅ Should show "Running" status
   ✅ Check for opportunities being evaluated

6. Position Opening
   ✅ Wait for trades
   ✅ Verify positions show in getPositions()
   ✅ Check P&L updates

7. Shutdown
   ✅ Ctrl+C
   ✅ Should call shutdownTradingSystem()
   ✅ Should gracefully close IBKR connection
*/

// ============================================================================
// DEBUGGING TIPS
// ============================================================================

/*
If something isn't working:

1. Check Environment
   - Verify .env.local has all required variables
   - Check IBKR_SESSION_TOKEN is valid (get fresh one from IB Gateway)

2. Check Logs
   - Look for [Trading] messages in console
   - Check [IBKR] connection messages
   - Look for errors in market scanner

3. Test Directly
   ```bash
   # Test IBKR connection
   curl -k https://localhost:5000/
   
   # Test market scanner
   npm run dev
   # Then in browser: trading.scanMarket()
   ```

4. Reset System
   - If stuck, call trading.resetAccount()
   - Or restart server

5. Check Routes
   - Verify trading-unified.ts is in routers/
   - Verify index.ts imports tradingRouter
   - Check tRPC setup is correct
*/

export {};
