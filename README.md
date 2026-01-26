# ThermoRaw

Interactive mass spectrometry data analysis dashboard for Thermo Scientific instruments. Built with FastAPI, React, and Bokeh.

## Quick Start

### Download

| Platform | Architecture | Download |
|----------|--------------|----------|
| **macOS** | Apple Silicon (M1/M2/M3) | [ThermoRaw-macos-arm64.zip](https://github.com/RusEu/thermo-raw/releases/download/v0.3.1/ThermoRaw-macos-arm64.zip) |
| **Windows** | x64 | [ThermoRaw-windows-x64.zip](https://github.com/RusEu/thermo-raw/releases/download/v0.3.1/ThermoRaw-windows-x64.zip) |
| **Linux** | x64 | [ThermoRaw-linux-x64.tar.gz](https://github.com/RusEu/thermo-raw/releases/download/v0.3.1/ThermoRaw-linux-x64.tar.gz) |

> See all releases: [Releases](https://github.com/RusEu/thermo-raw/releases)
## Features

- **File Upload**: Upload Thermo `.raw` files (auto-converted to mzML) or `.mzML` files directly
- **Chromatograms**: View TIC (Total Ion Chromatogram) and BPC (Base Peak Chromatogram)
- **Spectrum Explorer**: Interactive mass spectrum visualization with zoom and pan
- **Heatmap**: m/z vs retention time intensity heatmap
- **SNR Analysis**: Signal-to-Noise ratio calculations using Thermo noise data
- **Precursor Analysis**: Automated peak detection and SNR calculation workflow

## Development

### Quick Start (Docker)

The easiest way to run locally for development:

```bash
git clone https://github.com/RusEu/thermo-raw.git
cd thermo-charts
docker-compose up
```

- Frontend: http://localhost:5173
- Backend API: http://localhost:8000

Docker handles all dependencies including ThermoRawFileParser for `.raw` file conversion.

### Project Structure

```
thermo-charts/
├── apps/
│   ├── backend/          # FastAPI + Bokeh backend
│   │   ├── src/thermo_raw/
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

### Manual Setup (Without Docker)

Requires:
- Python 3.12+
- Node.js 20+
- [uv](https://docs.astral.sh/uv/) (Python package manager)
- [Mono](https://www.mono-project.com/) (for `.raw` file conversion on macOS/Linux)

```bash
# Clone the repository
git clone https://github.com/RusEu/thermo-raw.git
cd thermo-charts

# Backend
cd apps/backend
uv sync
uv run python -m thermo_raw.main

# Frontend (in another terminal)
cd apps/frontend
npm install
npm run dev
```

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
