"""Bokeh plot generation API."""
from typing import Optional
from fastapi import APIRouter
from bokeh.embed import json_item
from bokeh.plotting import figure
from bokeh.models import ColumnDataSource, HoverTool, LinearColorMapper, ColorBar, BasicTicker, CustomJS, TapTool, Span, RangeSlider
from bokeh.events import RangesUpdate
from bokeh.palettes import Viridis256
import numpy as np

from .files import get_file_service

router = APIRouter()

# Theme configurations
THEMES = {
    "light": {
        "background": "#ffffff",
        "border": "#ffffff",
        "outline": "#e4e4e7",
        "grid": "#e4e4e7",
        "axis": "#a1a1aa",
        "tick": "#a1a1aa",
        "label": "#71717a",
        "title": "#18181b",
    },
    "dark": {
        "background": "#18181b",
        "border": "#09090b",
        "outline": "#27272a",
        "grid": "#27272a",
        "axis": "#27272a",
        "tick": "#27272a",
        "label": "#71717a",
        "title": "#fafafa",
    },
}


def apply_theme(p, theme: str = "light"):
    """Apply theme to plot."""
    t = THEMES.get(theme, THEMES["light"])
    p.background_fill_color = t["background"]
    p.border_fill_color = t["border"]
    p.outline_line_color = t["outline"]
    p.xgrid.grid_line_color = t["grid"]
    p.ygrid.grid_line_color = t["grid"]
    p.xaxis.axis_line_color = t["axis"]
    p.yaxis.axis_line_color = t["axis"]
    p.xaxis.major_tick_line_color = t["tick"]
    p.yaxis.major_tick_line_color = t["tick"]
    p.xaxis.axis_label_text_color = t["label"]
    p.yaxis.axis_label_text_color = t["label"]
    p.xaxis.major_label_text_color = t["label"]
    p.yaxis.major_label_text_color = t["label"]
    p.title.text_color = t["title"]
    return p


@router.get("/{file_id}/tic")
def plot_tic(file_id: str, theme: str = "light"):
    """Generate TIC plot."""
    service = get_file_service(file_id)
    times, intensities = service.get_tic()

    source = ColumnDataSource(data={"time": times, "intensity": intensities})

    p = figure(
        title="Total Ion Chromatogram",
        x_axis_label="Retention Time (min)",
        y_axis_label="Intensity",
        height=250,
        sizing_mode="stretch_width",
        tools="pan,wheel_zoom,box_zoom,reset",
    )
    p.line("time", "intensity", source=source, line_width=1.5, color="#3b82f6")

    # Add circles that appear on hover only
    circles = p.circle(
        "time", "intensity", source=source, size=8,
        fill_color="#3b82f6", line_color="white", line_width=2,
        alpha=0, hover_alpha=1,
        selection_alpha=0, nonselection_alpha=0
    )

    hover = HoverTool(tooltips=None, mode="vline", renderers=[circles])
    p.add_tools(hover)

    apply_theme(p, theme)
    return json_item(p, "tic-plot")


@router.get("/{file_id}/bpc")
def plot_bpc(file_id: str, theme: str = "light"):
    """Generate BPC plot."""
    service = get_file_service(file_id)
    times, intensities = service.get_bpc()

    source = ColumnDataSource(data={"time": times, "intensity": intensities})

    p = figure(
        title="Base Peak Chromatogram",
        x_axis_label="Retention Time (min)",
        y_axis_label="Intensity",
        height=250,
        sizing_mode="stretch_width",
        tools="pan,wheel_zoom,box_zoom,reset",
    )
    p.line("time", "intensity", source=source, line_width=1.5, color="#ec4899")

    # Add circles that appear on hover only
    circles = p.circle(
        "time", "intensity", source=source, size=8,
        fill_color="#ec4899", line_color="white", line_width=2,
        alpha=0, hover_alpha=1,
        selection_alpha=0, nonselection_alpha=0
    )

    hover = HoverTool(tooltips=None, mode="vline", renderers=[circles])
    p.add_tools(hover)

    apply_theme(p, theme)
    return json_item(p, "bpc-plot")


@router.get("/{file_id}/chromatogram-interactive")
def plot_chromatogram_interactive(
    file_id: str,
    chrom_type: str = "tic",
    selected_rt: Optional[float] = None,
    theme: str = "light"
):
    """
    Generate interactive chromatogram with click-to-select RT.
    Sends 'chromatogram-click' message with RT when clicked.
    """
    service = get_file_service(file_id)

    if chrom_type == "bpc":
        times, intensities = service.get_bpc()
        title = "Base Peak Chromatogram"
        color = "#ec4899"
    else:
        times, intensities = service.get_tic()
        title = "Total Ion Chromatogram"
        color = "#3b82f6"

    source = ColumnDataSource(data={"time": times, "intensity": intensities})

    p = figure(
        title=title,
        x_axis_label="Retention Time (min)",
        y_axis_label="Intensity",
        height=200,
        sizing_mode="stretch_width",
        tools="pan,wheel_zoom,box_zoom,reset",
    )

    # Main chromatogram line
    p.line("time", "intensity", source=source, line_width=1.5, color=color)

    # Add circles that appear on hover and are clickable
    circles = p.circle(
        "time", "intensity", source=source, size=10,
        fill_color=color, line_color="white", line_width=2,
        alpha=0, hover_alpha=1,
        selection_alpha=0, nonselection_alpha=0,
        name="tap_target"
    )

    # Add hover tool for the circles (no tooltip, just visual)
    hover = HoverTool(tooltips=None, mode="vline", renderers=[circles])
    p.add_tools(hover)

    # Vertical line indicator for selected RT
    if selected_rt is not None:
        rt_line = Span(location=selected_rt, dimension='height',
                       line_color='#ef4444', line_width=2, line_dash='dashed')
        p.add_layout(rt_line)

    # Tap tool with callback to send RT to parent
    tap_callback = CustomJS(args=dict(source=source), code="""
        const indices = source.selected.indices;
        if (indices.length > 0) {
            const idx = indices[0];
            const rt = source.data['time'][idx];
            window.postMessage({
                type: 'chromatogram-click',
                rt: rt
            }, '*');
            // Clear selection so circle doesn't stay visible
            source.selected.indices = [];
        }
    """)

    tap_tool = TapTool(renderers=[circles], callback=tap_callback)
    p.add_tools(tap_tool)

    apply_theme(p, theme)
    return json_item(p, "chromatogram-interactive")


@router.get("/{file_id}/spectrum")
def plot_spectrum(file_id: str, rt: float, ms_level: Optional[int] = None, theme: str = "light"):
    """Generate spectrum plot."""
    service = get_file_service(file_id)
    mz, intensity, metadata = service.get_spectrum_by_rt(rt, ms_level)

    source = ColumnDataSource(data={"mz": mz, "intensity": intensity})

    p = figure(
        title=f"Mass Spectrum @ RT {metadata.get('rt', rt):.2f} min (MS{metadata.get('ms_level', 1)})",
        x_axis_label="m/z",
        y_axis_label="Intensity",
        height=300,
        sizing_mode="stretch_width",
        tools="pan,wheel_zoom,box_zoom,reset,save",
    )
    p.segment(x0="mz", y0=0, x1="mz", y1="intensity", source=source, line_width=1, color="#22c55e")

    # Add circles at peak tops that appear on hover only
    circles = p.circle(
        "mz", "intensity", source=source, size=6,
        fill_color="#22c55e", line_color="white", line_width=1.5,
        alpha=0, hover_alpha=1,
        selection_alpha=0, nonselection_alpha=0
    )

    hover = HoverTool(tooltips=None, renderers=[circles])
    p.add_tools(hover)

    # Callback to send visible m/z range when zooming/panning (wheel, box, or pan)
    range_callback = CustomJS(args=dict(x_range=p.x_range), code="""
        clearTimeout(window._spectrumRangeTimeout);
        window._spectrumRangeTimeout = setTimeout(() => {
            window.postMessage({
                type: 'spectrum-range',
                mz_min: x_range.start,
                mz_max: x_range.end
            }, '*');
        }, 100);
    """)
    p.x_range.js_on_change('start', range_callback)
    p.x_range.js_on_change('end', range_callback)

    # Also fire on RangesUpdate event (fires when interaction ends)
    p.js_on_event(RangesUpdate, range_callback)

    apply_theme(p, theme)
    return json_item(p, "spectrum-plot")


@router.get("/{file_id}/heatmap")
def plot_heatmap(
    file_id: str,
    rt_bins: int = 200,
    mz_bins: int = 200,
    intensity_min: Optional[float] = None,
    intensity_max: Optional[float] = None,
    theme: str = "light",
):
    """Generate m/z vs RT heatmap plot with optional intensity filtering."""
    service = get_file_service(file_id)
    data = service.get_heatmap(rt_bins=rt_bins, mz_bins=mz_bins)

    # Create image data
    intensity_matrix = np.array(data["intensity"], dtype=np.float64)

    # Apply intensity filtering
    if intensity_min is not None:
        intensity_matrix[intensity_matrix < intensity_min] = 0
    if intensity_max is not None:
        intensity_matrix[intensity_matrix > intensity_max] = intensity_max

    # Apply log transform
    intensity_log = np.log10(intensity_matrix + 1)

    # Get valid range
    min_val = 0.0
    max_val = float(np.nanmax(intensity_log))
    if max_val <= 0 or np.isnan(max_val):
        max_val = 1.0

    rt_min = float(data["rt_min"])
    rt_max = float(data["rt_max"])
    mz_min = float(data["mz_min"])
    mz_max = float(data["mz_max"])

    # Ensure valid ranges
    if rt_max <= rt_min:
        rt_max = rt_min + 1.0
    if mz_max <= mz_min:
        mz_max = mz_min + 1.0

    p = figure(
        title="m/z vs Retention Time Heatmap",
        x_axis_label="Retention Time (min)",
        y_axis_label="m/z",
        height=450,
        sizing_mode="stretch_width",
        tools="pan,wheel_zoom,box_zoom,reset,save",
        x_range=(rt_min, rt_max),
        y_range=(mz_min, mz_max),
    )

    # Create palette with white background for zero values
    white_viridis = ["#ffffff"] + list(Viridis256)

    # Use image with palette directly instead of color_mapper to avoid ColorBar issues
    p.image(
        image=[intensity_log],
        x=rt_min,
        y=mz_min,
        dw=rt_max - rt_min,
        dh=mz_max - mz_min,
        palette=white_viridis,
        level="image",
    )

    apply_theme(p, theme)
    return json_item(p, "heatmap-plot")
