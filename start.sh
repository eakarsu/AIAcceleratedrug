#!/bin/bash

# ============================================================
# AI-Accelerated Drug Discovery Platform - Startup Script
# ============================================================

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${PURPLE}"
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║       AI-Accelerated Drug Discovery Platform             ║"
echo "║       Starting all services...                           ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Load environment variables
if [ -f "$SCRIPT_DIR/.env" ]; then
  set -a
  source "$SCRIPT_DIR/.env"
  set +a
  echo -e "${GREEN}✓ Environment variables loaded${NC}"
else
  echo -e "${RED}✗ .env file not found! Please create one.${NC}"
  exit 1
fi

# Set defaults
BACKEND_PORT=${BACKEND_PORT:-3001}
FRONTEND_PORT=${FRONTEND_PORT:-3000}
DB_PORT=${DB_PORT:-5432}
DB_NAME=${DB_NAME:-drug_discovery}
DB_USER=${DB_USER:-$(whoami)}
DB_HOST=${DB_HOST:-localhost}

# ============================================================
# Clean up used ports
# ============================================================
echo -e "\n${YELLOW}► Cleaning up ports...${NC}"

cleanup_port() {
  local port=$1
  local pids=$(lsof -ti:$port 2>/dev/null || true)
  if [ -n "$pids" ]; then
    echo -e "  Killing processes on port $port: $pids"
    echo "$pids" | xargs kill -9 2>/dev/null || true
    sleep 1
  fi
}

cleanup_port $BACKEND_PORT
cleanup_port $FRONTEND_PORT
echo -e "${GREEN}✓ Ports cleaned${NC}"

# ============================================================
# Check PostgreSQL
# ============================================================
echo -e "\n${YELLOW}► Checking PostgreSQL...${NC}"

if command -v pg_isready &> /dev/null; then
  if pg_isready -h $DB_HOST -p $DB_PORT > /dev/null 2>&1; then
    echo -e "${GREEN}✓ PostgreSQL is running${NC}"
  else
    echo -e "${YELLOW}  Starting PostgreSQL...${NC}"
    if command -v brew &> /dev/null; then
      brew services start postgresql@14 2>/dev/null || brew services start postgresql 2>/dev/null || true
    fi
    sleep 3
    if pg_isready -h $DB_HOST -p $DB_PORT > /dev/null 2>&1; then
      echo -e "${GREEN}✓ PostgreSQL started${NC}"
    else
      echo -e "${RED}✗ Could not start PostgreSQL. Please start it manually.${NC}"
      exit 1
    fi
  fi
else
  echo -e "${YELLOW}  pg_isready not found, assuming PostgreSQL is running...${NC}"
fi

# ============================================================
# Create database if not exists
# ============================================================
echo -e "\n${YELLOW}► Setting up database...${NC}"

DB_EXISTS=$(psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d postgres -tc "SELECT 1 FROM pg_database WHERE datname = '$DB_NAME'" 2>/dev/null || echo "")

if ! echo "$DB_EXISTS" | grep -q 1; then
  echo -e "  Creating database $DB_NAME..."
  createdb -h $DB_HOST -p $DB_PORT -U $DB_USER $DB_NAME 2>/dev/null || \
  psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d postgres -c "CREATE DATABASE $DB_NAME;" 2>/dev/null || true
fi
echo -e "${GREEN}✓ Database ready${NC}"

# ============================================================
# Install dependencies
# ============================================================
echo -e "\n${YELLOW}► Installing dependencies...${NC}"

if [ ! -d "$SCRIPT_DIR/backend/node_modules" ]; then
  echo -e "  Installing backend dependencies..."
  (cd "$SCRIPT_DIR/backend" && npm install)
else
  echo -e "  Backend dependencies already installed"
fi

if [ ! -d "$SCRIPT_DIR/frontend/node_modules" ]; then
  echo -e "  Installing frontend dependencies..."
  (cd "$SCRIPT_DIR/frontend" && npm install)
else
  echo -e "  Frontend dependencies already installed"
fi
echo -e "${GREEN}✓ Dependencies installed${NC}"

# ============================================================
# Seed database
# ============================================================
echo -e "\n${YELLOW}► Seeding database...${NC}"
(cd "$SCRIPT_DIR/backend" && node src/seeds/seed.js)
echo -e "${GREEN}✓ Database seeded with sample data${NC}"

# ============================================================
# Start Backend (with auto-reload via nodemon)
# ============================================================
echo -e "\n${YELLOW}► Starting backend server on port $BACKEND_PORT...${NC}"
(cd "$SCRIPT_DIR/backend" && npx nodemon src/server.js) &
BACKEND_PID=$!

sleep 3
echo -e "${GREEN}✓ Backend running (PID: $BACKEND_PID) with hot-reload${NC}"

# ============================================================
# Start Frontend (Vite dev server with HMR)
# ============================================================
echo -e "\n${YELLOW}► Starting frontend on port $FRONTEND_PORT...${NC}"
(cd "$SCRIPT_DIR/frontend" && npx vite --port $FRONTEND_PORT --host) &
FRONTEND_PID=$!

sleep 3
echo -e "${GREEN}✓ Frontend running (PID: $FRONTEND_PID) with hot-reload${NC}"

# ============================================================
# Print summary
# ============================================================
echo -e "\n${PURPLE}"
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║                  All Services Running!                    ║"
echo "╠═══════════════════════════════════════════════════════════╣"
echo -e "║  ${CYAN}Frontend:${NC}  http://localhost:$FRONTEND_PORT                    ${PURPLE}║"
echo -e "║  ${CYAN}Backend:${NC}   http://localhost:$BACKEND_PORT/api                 ${PURPLE}║"
echo -e "║  ${CYAN}Database:${NC}  PostgreSQL on port $DB_PORT                   ${PURPLE}║"
echo "╠═══════════════════════════════════════════════════════════╣"
echo -e "║  ${YELLOW}Login:${NC}     admin@drugdiscovery.com / password123     ${PURPLE}║"
echo -e "║  ${YELLOW}AI Model:${NC}  $OPENROUTER_MODEL              ${PURPLE}║"
echo "╠═══════════════════════════════════════════════════════════╣"
echo -e "║  ${GREEN}Hot-reload enabled for both frontend and backend${NC}     ${PURPLE}║"
echo "║  Press Ctrl+C to stop all services                       ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# ============================================================
# Handle shutdown
# ============================================================
cleanup() {
  echo -e "\n${YELLOW}Shutting down services...${NC}"
  kill $BACKEND_PID 2>/dev/null || true
  kill $FRONTEND_PID 2>/dev/null || true
  cleanup_port $BACKEND_PORT
  cleanup_port $FRONTEND_PORT
  echo -e "${GREEN}All services stopped.${NC}"
  exit 0
}

trap cleanup SIGINT SIGTERM

# Wait for processes
wait
