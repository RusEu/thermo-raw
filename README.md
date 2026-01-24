# ThermoCharts

ThermoFisher data analytics dashboard built with Python and Bokeh.

## Installation

### Download Pre-built Binaries

Download the latest release for your platform:

| Platform | Download |
|----------|----------|
| Windows (64-bit) | [thermo-charts-windows-amd64.exe](https://github.com/RusEu/thermo-charts/releases/download/v0.1.0/thermo-charts-windows-amd64.exe) |
| macOS (Apple Silicon) | [thermo-charts-macos-arm64](https://github.com/RusEu/thermo-charts/releases/download/v0.1.0/thermo-charts-macos-arm64) |
| macOS (Intel) | [thermo-charts-macos-amd64](https://github.com/RusEu/thermo-charts/releases/download/v0.1.0/thermo-charts-macos-amd64) |
| Linux (64-bit) | [thermo-charts-linux-amd64](https://github.com/RusEu/thermo-charts/releases/download/v0.1.0/thermo-charts-linux-amd64) |

#### Windows

1. Download `thermo-charts-windows-amd64.exe`
2. Double-click to run

#### macOS

```bash
# Apple Silicon (M1/M2/M3)
curl -LO https://github.com/RusEu/thermo-charts/releases/download/v0.1.0/thermo-charts-macos-arm64
chmod +x thermo-charts-macos-arm64
./thermo-charts-macos-arm64

# Intel
curl -LO https://github.com/RusEu/thermo-charts/releases/download/v0.1.0/thermo-charts-macos-amd64
chmod +x thermo-charts-macos-amd64
./thermo-charts-macos-amd64
```

#### Linux

```bash
curl -LO https://github.com/RusEu/thermo-charts/releases/download/v0.1.0/thermo-charts-linux-amd64
chmod +x thermo-charts-linux-amd64
./thermo-charts-linux-amd64
```

### From Source

Requires Python 3.10+

```bash
# Using uv (recommended)
uv sync
uv run thermo-charts

# Using pip
pip install -r requirements.txt
python run.py
```

## Usage

1. Place your ThermoFisher data files in a `data/` folder
2. Run the application
3. Open your browser to view the dashboard

## Development

```bash
# Install with dev dependencies
uv sync --dev

# Run locally
uv run python run.py

# Build executable
uv run pyinstaller run.py --onefile --name thermo-charts
```
