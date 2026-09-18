#!/usr/bin/env bash
# start.sh — Run ATLAS Study Sentinel (backend + frontend)
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "=== ATLAS Study Sentinel Startup ==="

# Check Python
if ! command -v python3 &>/dev/null; then
  echo "ERROR: python3 not found" && exit 1
fi

# Check pip packages
python3 -c "import fastapi, uvicorn" 2>/dev/null || {
  echo "Installing Python dependencies..."
  pip3 install -r requirements.txt -q
}

# Check npm
if ! command -v npm &>/dev/null; then
  echo "ERROR: npm not found. Install Node.js >= 18" && exit 1
fi

# Build frontend if dist doesn't exist
if [ ! -d "frontend/dist" ]; then
  echo "Building frontend..."
  cd frontend && npm install --silent && npm run build && cd ..
fi

echo ""
echo "Starting FastAPI backend on http://localhost:8000 ..."
echo "  API docs: http://localhost:8000/docs"
echo ""
echo "Starting Vite dev server on http://localhost:8080 ..."
echo ""

# Start backend in background
ATLAS_DATA_DIR="hackathon-data" python3 -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload &
BACKEND_PID=$!

# Start frontend dev server
cd frontend && npm run dev &
FRONTEND_PID=$!

echo "Backend PID: $BACKEND_PID"
echo "Frontend PID: $FRONTEND_PID"
echo ""
echo "Press Ctrl+C to stop both servers."

# Cleanup on exit
trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null" EXIT
wait
