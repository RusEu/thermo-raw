FROM python:3.12-slim

WORKDIR /app

# Install dependencies (mono for ThermoRawFileParser .NET runtime)
RUN apt-get update && apt-get install -y \
    mono-complete \
    && rm -rf /var/lib/apt/lists/*

# Copy ThermoRawFileParser (pre-unpacked linux binaries)
COPY vendor/linux/ /opt/ThermoRawFileParser/

ENV THERMO_RAW_FILE_PARSER=/opt/ThermoRawFileParser/ThermoRawFileParser.exe

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

# Copy project files
COPY pyproject.toml .
COPY src/ src/

# Install dependencies
RUN uv pip install --system -e .

# Default data directory
ENV DATA_DIR=/data

EXPOSE 8000

# Single worker to maintain file cache in memory
CMD ["uvicorn", "thermo_stats.main:app", "--host", "0.0.0.0", "--port", "8000"]
