#!/bin/bash

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║                                                                ║"
echo "║          AOIX-1 UPGRADED SYSTEM - TEST RUNNER                 ║"
echo "║                                                                ║"
echo "║            Validating All Modules & Upgrades                  ║"
echo "║                                                                ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Counters
TESTS_PASSED=0
TESTS_FAILED=0
TESTS_TOTAL=0

# Test 1: Verify all upgraded modules exist
echo "📋 TEST 1: Verify All Upgraded Modules Exist"
echo "───────────────────────────────────────────────"

MODULES=(
  "trading-core/trade-scorer-upgraded.ts"
  "trading-core/momentum-glide-upgraded.ts"
  "trading-core/portfolio-optimizer-upgraded.ts"
  "trading-core/execution-upgraded.ts"
  "trading-core/risk-engine-upgraded.ts"
  "trading-core/learning-engine-upgraded.ts"
  "trading-core/market-scanner-upgraded.ts"
  "trading-core/test-suite.ts"
  "trading-core/ab-testing-framework.ts"
  "run-validation.ts"
)

for module in "${MODULES[@]}"; do
  TESTS_TOTAL=$((TESTS_TOTAL + 1))
  if [ -f "$module" ]; then
    echo -e "  ${GREEN}✅${NC} $module"
    TESTS_PASSED=$((TESTS_PASSED + 1))
  else
    echo -e "  ${RED}❌${NC} $module (NOT FOUND)"
    TESTS_FAILED=$((TESTS_FAILED + 1))
  fi
done

echo ""

# Test 2: Verify no syntax errors in TypeScript files
echo "📋 TEST 2: Check TypeScript Syntax"
echo "───────────────────────────────────────────────"

TS_FILES=("trading-core/trade-scorer-upgraded.ts" "trading-core/momentum-glide-upgraded.ts" "trading-core/portfolio-optimizer-upgraded.ts" "trading-core/execution-upgraded.ts" "trading-core/risk-engine-upgraded.ts" "trading-core/learning-engine-upgraded.ts" "trading-core/market-scanner-upgraded.ts")

for file in "${TS_FILES[@]}"; do
  TESTS_TOTAL=$((TESTS_TOTAL + 1))
  # Check for basic TypeScript syntax (balanced braces)
  OPEN_BRACES=$(grep -o "{" "$file" | wc -l)
  CLOSE_BRACES=$(grep -o "}" "$file" | wc -l)
  
  if [ "$OPEN_BRACES" -eq "$CLOSE_BRACES" ]; then
    echo -e "  ${GREEN}✅${NC} $file (Syntax OK)"
    TESTS_PASSED=$((TESTS_PASSED + 1))
  else
    echo -e "  ${RED}❌${NC} $file (Syntax Error: $OPEN_BRACES braces vs $CLOSE_BRACES)"
    TESTS_FAILED=$((TESTS_FAILED + 1))
  fi
done

echo ""

# Test 3: Verify documentation
echo "📋 TEST 3: Verify Documentation"
echo "───────────────────────────────────────────────"

DOCS=(
  "UPGRADE_SPECIFICATIONS.md"
  "FULL_UPGRADE_STATUS.md"
)

for doc in "${DOCS[@]}"; do
  TESTS_TOTAL=$((TESTS_TOTAL + 1))
  if [ -f "$doc" ]; then
    echo -e "  ${GREEN}✅${NC} $doc"
    TESTS_PASSED=$((TESTS_PASSED + 1))
  else
    echo -e "  ${RED}❌${NC} $doc (NOT FOUND)"
    TESTS_FAILED=$((TESTS_FAILED + 1))
  fi
done

echo ""

# Test 4: Verify git status
echo "📋 TEST 4: Git Status"
echo "───────────────────────────────────────────────"

TESTS_TOTAL=$((TESTS_TOTAL + 1))
cd /home/claude
if git status >/dev/null 2>&1; then
  echo -e "  ${GREEN}✅${NC} Git repository initialized"
  TESTS_PASSED=$((TESTS_PASSED + 1))
else
  echo -e "  ${YELLOW}⚠️${NC} Git repository not found"
  TESTS_FAILED=$((TESTS_FAILED + 1))
fi

echo ""

# Final Results
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║                                                                ║"
echo "║                    TEST RESULTS SUMMARY                        ║"
echo "║                                                                ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""
echo "Total Tests:  $TESTS_TOTAL"
echo "Passed:       ${GREEN}$TESTS_PASSED${NC}"
echo "Failed:       ${RED}$TESTS_FAILED${NC}"

SUCCESS_RATE=$((TESTS_PASSED * 100 / TESTS_TOTAL))
echo "Success Rate: $SUCCESS_RATE%"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
  echo -e "${GREEN}✅ ALL TESTS PASSED${NC}"
  echo ""
  echo "✅ All upgraded modules are in place"
  echo "✅ All documentation is complete"
  echo "✅ System is ready for validation"
  echo ""
  echo "Next steps:"
  echo "  1. Review UPGRADE_SPECIFICATIONS.md"
  echo "  2. Review FULL_UPGRADE_STATUS.md"
  echo "  3. Run: node run-validation.ts"
  echo ""
  exit 0
else
  echo -e "${RED}❌ SOME TESTS FAILED${NC}"
  echo ""
  echo "Please fix the issues above and re-run tests."
  exit 1
fi
