# ThermoCharts

Interactive mass spectrometry data analysis dashboard for Thermo Scientific instruments. Built with FastAPI, React, and Bokeh.

## Quick Start

### Download

| Platform | Architecture | Download |
|----------|--------------|----------|
| **macOS** | Apple Silicon (M1/M2/M3) | [ThermoCharts-macos-arm64.zip](https://github.com/RusEu/thermo-charts/releases/latest/download/ThermoCharts-macos-arm64.zip) |
| **macOS** | Intel | [ThermoCharts-macos-x64.zip](https://github.com/RusEu/thermo-charts/releases/latest/download/ThermoCharts-macos-x64.zip) |
| **Windows** | x64 | [ThermoCharts-windows-x64.zip](https://github.com/RusEu/thermo-charts/releases/latest/download/ThermoCharts-windows-x64.zip) |
| **Linux** | x64 | [ThermoCharts-linux-x64.tar.gz](https://github.com/RusEu/thermo-charts/releases/latest/download/ThermoCharts-linux-x64.tar.gz) |

> See all releases: [Releases](https://github.com/RusEu/thermo-charts/releases)

### Installation

1. Download the appropriate file for your platform
2. Extract the archive
3. Run the application:
   - **macOS**: Double-click `ThermoCharts.app` (you may need to right-click > "Open" the first time)
   - **Windows**: Double-click `ThermoCharts.exe`
   - **Linux**: Run `./ThermoCharts` in terminal

### Usage

1. The application starts a local server and opens your browser to http://localhost:8000
2. Upload `.raw` or `.mzML` mass spectrometry files
3. Explore chromatograms, spectra, and perform SNR analysis

Data is stored in `~/ThermoCharts/data/`

## Features

- **File Upload**: Upload Thermo `.raw` files (auto-converted to mzML) or `.mzML` files directly
- **Chromatograms**: View TIC (Total Ion Chromatogram) and BPC (Base Peak Chromatogram)
- **Spectrum Explorer**: Interactive mass spectrum visualization with zoom and pan
- **Heatmap**: m/z vs retention time intensity heatmap
- **SNR Analysis**: Signal-to-Noise ratio calculations using Thermo noise data
- **Precursor Analysis**: Automated peak detection and SNR calculation workflow

## Development

### Prerequisites

- Python 3.12+
- Node.js 20+
- [uv](https://docs.astral.sh/uv/) (Python package manager)

### Project Structure

```
thermo-charts/
├── apps/
│   ├── backend/          # FastAPI + Bokeh backend
│   │   ├── src/thermo_stats/
│   │   │   ├── main.py           # FastAPI app entry point
│   │   │   ├── api/              # API routes
│   │   │   └── services/         # Data processing services
│   │   └── pyproject.toml
│   └── frontend/         # React + Vite frontend
│       ├── src/
│       └── package.json
├── scripts/              # Build scripts
└── docker-compose.yml    # Docker development setup
```

### Setup

```bash
# Clone the repository
git clone https://github.com/RusEu/thermo-charts.git
cd thermo-charts

# Backend
cd apps/backend
uv sync
uv run python -m thermo_stats.main

# Frontend (in another terminal)
cd apps/frontend
npm install
npm run dev
```

### Docker Development

```bash
docker-compose up
```

- Frontend: http://localhost:5173
- Backend API: http://localhost:8000

### Building Standalone Executable

```bash
# macOS/Linux
./scripts/build-standalone.sh

# Windows
scripts\build-standalone.bat
```

The executable will be in `apps/backend/dist/`.

### ThermoRawFileParser

For `.raw` file conversion, download ThermoRawFileParser from [compomics/ThermoRawFileParser](https://github.com/compomics/ThermoRawFileParser/releases) and place it in:
- `apps/backend/vendor/macos/ThermoRawFileParser` (macOS)
- `apps/backend/vendor/windows/ThermoRawFileParser.exe` (Windows)
- `apps/backend/vendor/linux/ThermoRawFileParser` (Linux)

Or set the `THERMO_RAW_FILE_PARSER` environment variable to the executable path.

## License

MIT
