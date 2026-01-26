FROM python:3.12-slim

WORKDIR /app

# Install dependencies (libicu required for ThermoRawFileParser .NET runtime)
RUN apt-get update && apt-get install -y \
    unzip \
    libicu-dev \
    && rm -rf /var/lib/apt/lists/*

# Install ThermoRawFileParser v2.0.0 (native Linux x86_64 build)
COPY vendor/ThermoRawFileParser.zip /tmp/ThermoRawFileParser.zip
RUN unzip /tmp/ThermoRawFileParser.zip -d /opt/ThermoRawFileParser \
    && chmod +x /opt/ThermoRawFileParser/ThermoRawFileParser \
    && rm /tmp/ThermoRawFileParser.zip

ENV THERMO_RAW_FILE_PARSER=/opt/ThermoRawFileParser/ThermoRawFileParser

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
# --no-reload ensures no file watching overhead
CMD ["uvicorn", "thermo_stats.main:app", "--host", "0.0.0.0", "--port", "8000"]
