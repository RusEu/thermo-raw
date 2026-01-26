#!/bin/bash
# Build ThermoCharts as a standalone executable for macOS/Linux
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
FRONTEND_DIR="$ROOT_DIR/apps/frontend"
BACKEND_DIR="$ROOT_DIR/apps/backend"

echo "=== ThermoCharts Standalone Build ==="
echo ""

# Check for required tools
command -v node >/dev/null 2>&1 || { echo "Error: node is required but not installed."; exit 1; }
command -v npm >/dev/null 2>&1 || { echo "Error: npm is required but not installed."; exit 1; }
command -v python3 >/dev/null 2>&1 || { echo "Error: python3 is required but not installed."; exit 1; }

# Step 1: Build frontend
echo "[1/4] Building frontend..."
cd "$FRONTEND_DIR"
npm ci
npm run build
echo "Frontend built successfully."
echo ""

# Step 2: Copy frontend build to backend static folder
echo "[2/4] Copying frontend to backend static folder..."
rm -rf "$BACKEND_DIR/src/thermo_stats/static"
mkdir -p "$BACKEND_DIR/src/thermo_stats/static"
cp -r "$FRONTEND_DIR/dist/"* "$BACKEND_DIR/src/thermo_stats/static/"
echo "Frontend copied to backend."
echo ""

# Step 3: Check for ThermoRawFileParser
echo "[3/4] Checking for ThermoRawFileParser..."
if [[ "$OSTYPE" == "darwin"* ]]; then
    PARSER_DIR="$BACKEND_DIR/vendor/macos"
    PARSER_NAME="ThermoRawFileParser"
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    PARSER_DIR="$BACKEND_DIR/vendor/linux"
    PARSER_NAME="ThermoRawFileParser"
else
    PARSER_DIR="$BACKEND_DIR/vendor/windows"
    PARSER_NAME="ThermoRawFileParser.exe"
fi

if [ -f "$PARSER_DIR/$PARSER_NAME" ]; then
    echo "ThermoRawFileParser found at $PARSER_DIR/$PARSER_NAME"
else
    echo "WARNING: ThermoRawFileParser not found at $PARSER_DIR/$PARSER_NAME"
    echo "Download from: https://github.com/compomics/ThermoRawFileParser/releases"
    echo "Place the executable in: $PARSER_DIR/"
    echo ""
    echo "Continuing build without ThermoRawFileParser..."
    echo "(The app will work but won't convert .raw files)"
fi
echo ""

# Step 4: Build executable with PyInstaller
echo "[4/4] Building executable with PyInstaller..."
cd "$BACKEND_DIR"

# Create virtual environment if needed
if [ ! -d ".venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv .venv
fi

# Activate venv and install dependencies
source .venv/bin/activate
pip install -q --upgrade pip
pip install -q pyinstaller

# Install project dependencies (using pyproject.toml)
pip install -q -e .

# Run PyInstaller
pyinstaller thermocharts.spec --clean --noconfirm

echo ""
echo "=== Build Complete ==="
if [[ "$OSTYPE" == "darwin"* ]]; then
    echo "macOS app bundle: $BACKEND_DIR/dist/ThermoCharts.app"
    echo ""
    echo "To run: open $BACKEND_DIR/dist/ThermoCharts.app"
else
    echo "Executable: $BACKEND_DIR/dist/ThermoCharts"
    echo ""
    echo "To run: $BACKEND_DIR/dist/ThermoCharts"
fi
echo ""
echo "The app will:"
echo "  1. Start a local server on http://localhost:8000"
echo "  2. Open your browser automatically"
echo "  3. Store data in ~/ThermoCharts/data/"
