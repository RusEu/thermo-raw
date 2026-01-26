"""Raw to mzML conversion service using ThermoRawFileParser."""
import os
import sys
import subprocess
from pathlib import Path


class ConversionError(Exception):
    """Raised when file conversion fails."""
    pass


def is_frozen() -> bool:
    """Check if running as a PyInstaller bundle."""
    return getattr(sys, 'frozen', False)


def get_base_path() -> Path:
    """Get base path - works for both dev and PyInstaller frozen."""
    if is_frozen():
        return Path(sys._MEIPASS)
    return Path(__file__).parent


def get_parser_path() -> str:
    """Get path to ThermoRawFileParser executable.

    In frozen mode (PyInstaller), looks for bundled binary.
    In development, uses environment variable or default path.
    """
    # Check environment variable first (works in both modes)
    if "THERMO_RAW_FILE_PARSER" in os.environ:
        return os.environ["THERMO_RAW_FILE_PARSER"]

    # In frozen mode, find bundled binary
    if is_frozen():
        base = get_base_path()
        parser_path = base / "ThermoRawFileParser" / "ThermoRawFileParser.exe"
        return str(parser_path)

    # Development mode default
    return "/opt/ThermoRawFileParser/ThermoRawFileParser.exe"


def find_mono() -> str | None:
    """Find mono executable, checking common installation paths.

    PyWebView doesn't inherit shell PATH, so we check common locations.
    """
    # Common mono installation paths
    mono_paths = [
        "/opt/homebrew/bin/mono",  # Homebrew on Apple Silicon
        "/usr/local/bin/mono",     # Homebrew on Intel Mac
        "/usr/bin/mono",           # System or Linux package manager
        "/Library/Frameworks/Mono.framework/Versions/Current/Commands/mono",  # Mono installer on macOS
    ]

    # First try PATH (works in terminal/dev mode)
    import shutil
    mono_in_path = shutil.which("mono")
    if mono_in_path:
        return mono_in_path

    # Check common locations
    for path in mono_paths:
        if os.path.isfile(path) and os.access(path, os.X_OK):
            return path

    return None


def get_parser_command(parser_path: str) -> list[str]:
    """Get the command to run ThermoRawFileParser.

    On Windows, run directly. On macOS/Linux, use mono.
    """
    if sys.platform == 'win32':
        return [parser_path]
    else:
        # macOS and Linux need mono to run .NET executables
        mono = find_mono()
        if mono:
            return [mono, parser_path]
        # Fall back to "mono" and let it fail with helpful error message
        return ["mono", parser_path]


def convert_raw_to_mzml(raw_path: Path, output_dir: Path) -> Path:
    """
    Convert a Thermo .raw file to .mzML format.

    Args:
        raw_path: Path to the input .raw file
        output_dir: Directory to write the output .mzML file

    Returns:
        Path to the converted .mzML file

    Raises:
        ConversionError: If conversion fails
    """
    parser_path = get_parser_path()

    if not raw_path.exists():
        raise ConversionError(f"Input file not found: {raw_path}")

    output_dir.mkdir(parents=True, exist_ok=True)

    # ThermoRawFileParser command:
    # ThermoRawFileParser -i <input.raw> -o <output_dir> -f 2 -N
    # -f 2 = mzML format
    # -N = include noise data for accurate SNR calculations
    cmd = get_parser_command(parser_path) + [
        "-i", str(raw_path),
        "-o", str(output_dir),
        "-f", "2",  # mzML format
        "-N",       # Include noise data
    ]

    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=600,  # 10 minute timeout
        )

        if result.returncode != 0:
            raise ConversionError(
                f"ThermoRawFileParser failed: {result.stderr or result.stdout}"
            )

    except subprocess.TimeoutExpired:
        raise ConversionError("Conversion timed out after 10 minutes")
    except FileNotFoundError as e:
        if sys.platform != 'win32' and "mono" in str(e).lower():
            raise ConversionError(
                "Mono runtime not found. Install mono to convert .raw files:\n"
                "  macOS: brew install mono\n"
                "  Linux: apt install mono-complete"
            )
        raise ConversionError(
            "ThermoRawFileParser not found. "
            "Ensure ThermoRawFileParser is installed."
        )

    # Output file has same name but .mzML extension
    output_path = output_dir / f"{raw_path.stem}.mzML"

    if not output_path.exists():
        raise ConversionError(
            f"Conversion completed but output file not found: {output_path}"
        )

    return output_path
