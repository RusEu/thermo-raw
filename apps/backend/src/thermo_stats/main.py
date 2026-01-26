"""FastAPI application for ThermoStats."""
import sys
import threading
import webbrowser
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

# Use absolute imports for PyInstaller compatibility
from thermo_stats.api import files, plots


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
    title="ThermoStats API",
    version="0.1.0",
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
# In frozen mode, static files are bundled at thermo_stats/static
# In development, they're at the same relative location
static_dir = get_base_path() / "thermo_stats" / "static" if is_frozen() else Path(__file__).parent / "static"
if static_dir.exists():
    app.mount("/", StaticFiles(directory=static_dir, html=True), name="static")


def _open_browser_delayed():
    """Open browser after a short delay to let server start."""
    import time
    time.sleep(1.5)  # Wait for server to start
    webbrowser.open("http://localhost:8000")


def cli():
    """CLI entry point."""
    import uvicorn

    # Open browser in background thread (delayed to let server start)
    browser_thread = threading.Thread(target=_open_browser_delayed, daemon=True)
    browser_thread.start()

    # Run server
    # In frozen mode, we need to run the app directly, not by import string
    if is_frozen():
        uvicorn.run(
            app,
            host="127.0.0.1",
            port=8000,
            log_level="info",
        )
    else:
        uvicorn.run(
            "thermo_stats.main:app",
            host="0.0.0.0",
            port=8000,
            reload=False,
        )


if __name__ == "__main__":
    cli()
