"""
ThermoFisher Data Analytics Dashboard
"""
import subprocess
import sys
from pathlib import Path

from bokeh.io import curdoc
from bokeh.layouts import column
from bokeh.models import Div


def create_app():
    """Create the Bokeh application."""
    title = Div(text="<h1>ThermoFisher Analytics</h1>")
    placeholder = Div(text="<p>Add data to data/ folder to begin analysis.</p>")

    return column(title, placeholder)


def main():
    """CLI entry point - launches bokeh server."""
    app_path = Path(__file__).resolve()
    subprocess.run([sys.executable, "-m", "bokeh", "serve", str(app_path), "--show"])


# For bokeh serve
curdoc().add_root(create_app())
curdoc().title = "ThermoFisher Analytics"
