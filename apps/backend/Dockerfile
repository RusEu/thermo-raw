FROM python:3.12-slim

WORKDIR /app

# Install dependencies (mono for ThermoRawFileParser .NET runtime)
RUN apt-get update && apt-get install -y \
    unzip \
    mono-complete \
    && rm -rf /var/lib/apt/lists/*

# Install ThermoRawFileParser
COPY vendor/ThermoRawFileParser.zip /tmp/ThermoRawFileParser.zip
RUN unzip /tmp/ThermoRawFileParser.zip -d /opt/ThermoRawFileParser \
    && rm /tmp/ThermoRawFileParser.zip

ENV THERMO_RAW_FILE_PARSER=/opt/ThermoRawFileParser/ThermoRawFileParser.exe

# fisher_py reads the Thermo Trailer Extra directly from .raw via pythonnet;
# force the Mono runtime (no .NET Core in this image).
ENV PYTHONNET_RUNTIME=mono

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

CMD ["uvicorn", "thermo_raw.main:app", "--host", "0.0.0.0", "--port", "8000"]
