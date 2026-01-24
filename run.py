#!/usr/bin/env python3
"""
Run the ThermoFisher Analytics dashboard.
"""
import subprocess
import sys
from pathlib import Path


def main():
    app_path = Path(__file__).parent / "src" / "app.py"
    subprocess.run([sys.executable, "-m", "bokeh", "serve", str(app_path), "--show"])


if __name__ == "__main__":
    main()
