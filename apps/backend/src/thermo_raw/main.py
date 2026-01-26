"""FastAPI application for ThermoRaw."""
import os
import sys
import threading
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

# Use absolute imports for PyInstaller compatibility
from thermo_raw.api import files, plots
from thermo_raw import __version__
from thermo_raw.services.updater import check_for_updates, get_platform_info


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
    version=__version__,
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


# Version endpoint
@app.get("/api/version")
def version():
    """Return current application version and platform info."""
    system, machine = get_platform_info()
    return {
        "version": __version__,
        "platform": system,
        "architecture": machine,
    }


# Update check endpoint
@app.get("/api/updates/check")
def check_updates():
    """Check for available updates."""
    update_info = check_for_updates()
    return {
        "current_version": update_info.current_version,
        "latest_version": update_info.latest_version,
        "update_available": update_info.update_available,
        "download_url": update_info.download_url,
        "release_url": update_info.release_url,
        "release_notes": update_info.release_notes,
        "platform": update_info.platform,
        "architecture": update_info.architecture,
    }


# Serve static frontend in production
# In frozen mode, static files are bundled at thermo_raw/static
# In development, they're at the same relative location
static_dir = get_base_path() / "thermo_raw" / "static" if is_frozen() else Path(__file__).parent / "static"
if static_dir.exists():
    app.mount("/", StaticFiles(directory=static_dir, html=True), name="static")


# Global server reference for cleanup
_server = None


def _run_server_background():
    """Run the uvicorn server in a background thread."""
    global _server
    import uvicorn

    config = uvicorn.Config(
        app,
        host="127.0.0.1",
        port=8000,
        log_level="warning",
    )
    _server = uvicorn.Server(config)
    _server.run()


def _shutdown_server():
    """Signal the server to shut down."""
    global _server
    if _server:
        _server.should_exit = True


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


LOADING_HTML = """
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>ThermoRaw</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
            height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #e4e4e7;
        }
        .container {
            text-align: center;
        }
        .logo {
            width: 80px;
            height: 80px;
            margin-bottom: 24px;
            background: linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%);
            border-radius: 20px;
            display: flex;
            align-items: center;
            justify-content: center;
            margin-left: auto;
            margin-right: auto;
        }
        .logo svg {
            width: 48px;
            height: 48px;
            fill: white;
        }
        h1 {
            font-size: 28px;
            font-weight: 600;
            margin-bottom: 8px;
        }
        .status {
            color: #a1a1aa;
            font-size: 14px;
            margin-bottom: 24px;
        }
        .spinner {
            width: 32px;
            height: 32px;
            border: 3px solid #27272a;
            border-top-color: #3b82f6;
            border-radius: 50%;
            animation: spin 1s linear infinite;
            margin: 0 auto;
        }
        @keyframes spin {
            to { transform: rotate(360deg); }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="logo">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M3 3v18h18" stroke="white" fill="none"/>
                <path d="M7 16l4-8 4 6 4-10" stroke="white" fill="none"/>
            </svg>
        </div>
        <h1>ThermoRaw</h1>
        <p class="status">Starting application...</p>
        <div class="spinner"></div>
    </div>
</body>
</html>
"""


class Api:
    """Python API exposed to JavaScript in pywebview for native OS features."""

    def __init__(self):
        self._window = None

    def set_window(self, window):
        """Set the window reference after creation."""
        self._window = window

    def save_file(self, content: str, default_filename: str) -> dict:
        """Show native Save As dialog and save content to file.

        Args:
            content: The file content to save
            default_filename: Suggested filename for the save dialog

        Returns:
            dict with 'success' boolean and optional 'error' message
        """
        if not self._window:
            return {"success": False, "error": "Window not initialized"}

        try:
            import webview

            # Show native file dialog
            result = self._window.create_file_dialog(
                webview.SAVE_DIALOG,
                save_filename=default_filename,
                file_types=('CSV Files (*.csv)', 'All Files (*.*)'),
            )

            if result:
                filepath = result if isinstance(result, str) else result[0]
                with open(filepath, 'w', encoding='utf-8') as f:
                    f.write(content)
                return {"success": True}
            else:
                return {"success": False, "error": "Save cancelled"}
        except Exception as e:
            return {"success": False, "error": str(e)}


def cli():
    """CLI entry point.

    In frozen mode (standalone app): launches native GUI window with pywebview.
    In development mode: runs web server accessible via browser.
    """
    import uvicorn

    if is_frozen():
        # Standalone mode: native GUI with pywebview
        import webview

        # Start server IMMEDIATELY in background (parallel with window creation)
        server_thread = threading.Thread(target=_run_server_background, daemon=True)
        server_thread.start()

        # Create API instance
        api = Api()

        def on_loaded():
            """Called when webview is ready - wait for server and load app."""
            # Server is already starting, just wait for it
            _wait_for_server()

            # Navigate to the actual app
            window.load_url("http://127.0.0.1:8000")

        def on_closed():
            """Called when the window is closed - clean up and exit."""
            _shutdown_server()
            # Force exit to ensure all threads are terminated
            os._exit(0)

        # Create native window with loading screen first
        window = webview.create_window(
            "ThermoRaw",
            html=LOADING_HTML,
            width=1400,
            height=900,
            min_size=(800, 600),
            js_api=api,
        )

        # Set window reference in API
        api.set_window(window)

        # Register close handler
        window.events.closed += on_closed

        # Start the GUI event loop with callback
        webview.start(on_loaded)
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
