"""FastAPI application for ThermoRaw."""
import sys
import threading
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

# Use absolute imports for PyInstaller compatibility
from thermo_raw.api import files, plots


def is_frozen() -> bool:
    """Check if running as a PyInstaller bundle."""
    return getattr(sys, 'frozen', False)


def get_base_path() -> Path:
    """Get base path - works for both dev and PyInstaller frozen."""
    if is_frozen():
        # PyInstaller extracts to temp folder stored in sys._MEIPASS
        return Path(sys._MEIPASS)
    return Path(__file__).parent


app = FastAPI(
    title="ThermoRaw API",
    version="0.2.0",
)

# CORS for development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# API routes
app.include_router(files.router, prefix="/api/files", tags=["files"])
app.include_router(plots.router, prefix="/api/plots", tags=["plots"])


# Health check
@app.get("/api/health")
def health():
    return {"status": "ok"}


# Serve static frontend in production
# In frozen mode, static files are bundled at thermo_raw/static
# In development, they're at the same relative location
static_dir = get_base_path() / "thermo_raw" / "static" if is_frozen() else Path(__file__).parent / "static"
if static_dir.exists():
    app.mount("/", StaticFiles(directory=static_dir, html=True), name="static")


def _run_server_background():
    """Run the uvicorn server in a background thread."""
    import uvicorn

    config = uvicorn.Config(
        app,
        host="127.0.0.1",
        port=8000,
        log_level="warning",
    )
    server = uvicorn.Server(config)
    server.run()


def _wait_for_server():
    """Wait for the server to start."""
    import time
    import urllib.request

    for _ in range(50):  # Try for 5 seconds
        try:
            urllib.request.urlopen("http://127.0.0.1:8000/api/health", timeout=0.1)
            return True
        except Exception:
            time.sleep(0.1)
    return False


def cli():
    """CLI entry point.

    In frozen mode (standalone app): launches native GUI window with pywebview.
    In development mode: runs web server accessible via browser.
    """
    import uvicorn

    if is_frozen():
        # Standalone mode: native GUI with pywebview
        import webview

        # Start server in background thread
        server_thread = threading.Thread(target=_run_server_background, daemon=True)
        server_thread.start()

        # Wait for server to start
        _wait_for_server()

        # Create native window with embedded webview
        window = webview.create_window(
            "ThermoRaw",
            "http://127.0.0.1:8000",
            width=1400,
            height=900,
            min_size=(800, 600),
        )

        # Start the GUI event loop (blocking)
        webview.start()
    else:
        # Development mode: run web server (access via browser)
        uvicorn.run(
            "thermo_raw.main:app",
            host="0.0.0.0",
            port=8000,
            reload=True,
        )


if __name__ == "__main__":
    cli()
