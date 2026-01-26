"""Update checking service for ThermoRaw."""
import platform
import sys
import time
from dataclasses import dataclass
from typing import Optional
import urllib.request
import json

from packaging.version import Version

from thermo_raw import __version__


GITHUB_REPO = "RusEu/thermo-raw"
GITHUB_API_URL = f"https://api.github.com/repos/{GITHUB_REPO}/releases/latest"

# Platform-specific asset names
ASSET_NAMES = {
    ("darwin", "arm64"): "ThermoRaw-macos-arm64.dmg",
    ("darwin", "x86_64"): "ThermoRaw-macos-x64.dmg",
    ("win32", "AMD64"): "ThermoRaw-windows-x64-setup.exe",
    ("linux", "x86_64"): "ThermoRaw-linux-x64.tar.gz",
}

# Cache for update check results
_update_cache: Optional[dict] = None
_cache_timestamp: float = 0
CACHE_DURATION = 3600  # 1 hour in seconds


@dataclass
class UpdateInfo:
    """Information about an available update."""
    current_version: str
    latest_version: str
    update_available: bool
    download_url: Optional[str]
    release_url: Optional[str]
    release_notes: Optional[str]
    platform: str
    architecture: str


def get_platform_info() -> tuple[str, str]:
    """Get current platform and architecture."""
    system = sys.platform
    machine = platform.machine()
    return system, machine


def get_asset_download_url(assets: list[dict], system: str, machine: str) -> Optional[str]:
    """Find the download URL for the current platform."""
    asset_name = ASSET_NAMES.get((system, machine))
    if not asset_name:
        return None

    for asset in assets:
        if asset.get("name") == asset_name:
            return asset.get("browser_download_url")

    return None


def fetch_latest_release() -> Optional[dict]:
    """Fetch the latest release info from GitHub API."""
    global _update_cache, _cache_timestamp

    # Check cache
    if _update_cache and (time.time() - _cache_timestamp) < CACHE_DURATION:
        return _update_cache

    try:
        req = urllib.request.Request(
            GITHUB_API_URL,
            headers={
                "Accept": "application/vnd.github.v3+json",
                "User-Agent": f"ThermoRaw/{__version__}",
            },
        )
        with urllib.request.urlopen(req, timeout=10) as response:
            data = json.loads(response.read().decode())
            _update_cache = data
            _cache_timestamp = time.time()
            return data
    except Exception:
        return None


def check_for_updates() -> UpdateInfo:
    """Check if a new version is available."""
    system, machine = get_platform_info()
    current = __version__

    release_data = fetch_latest_release()

    if not release_data:
        return UpdateInfo(
            current_version=current,
            latest_version=current,
            update_available=False,
            download_url=None,
            release_url=None,
            release_notes=None,
            platform=system,
            architecture=machine,
        )

    # Parse version from tag (remove 'v' prefix if present)
    tag_name = release_data.get("tag_name", "")
    latest_version = tag_name.lstrip("v")

    try:
        update_available = Version(latest_version) > Version(current)
    except Exception:
        update_available = False

    download_url = get_asset_download_url(
        release_data.get("assets", []),
        system,
        machine,
    )

    return UpdateInfo(
        current_version=current,
        latest_version=latest_version,
        update_available=update_available,
        download_url=download_url,
        release_url=release_data.get("html_url"),
        release_notes=release_data.get("body"),
        platform=system,
        architecture=machine,
    )
