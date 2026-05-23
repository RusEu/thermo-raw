"""File management API."""
import shutil
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException, UploadFile, File
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel

from ..services.mzml import MzMLService, get_data_dir
from ..services.converter import convert_raw_to_mzml, ConversionError
from ..services import trailer as trailer_svc

router = APIRouter()

# Cache for loaded files
_file_cache: dict[str, MzMLService] = {}


class FileInfo(BaseModel):
    id: str
    name: str
    size_mb: float


class FileStats(BaseModel):
    filename: str
    total_scans: int
    ms1_scans: int
    ms2_scans: int
    rt_min: float
    rt_max: float
    mz_min: float
    mz_max: float
    max_tic: float
    mean_tic: float
    polarity: str


def get_file_service(file_id: str) -> MzMLService:
    """Get or create file service."""
    if file_id not in _file_cache:
        data_dir = get_data_dir()
        filepath = data_dir / file_id
        if not filepath.exists():
            raise HTTPException(status_code=404, detail="File not found")
        _file_cache[file_id] = MzMLService(filepath)
    return _file_cache[file_id]


@router.get("", response_model=list[FileInfo])
def list_files():
    """List all mzML files."""
    data_dir = get_data_dir()
    if not data_dir.exists():
        return []

    files = []
    for f in sorted(data_dir.glob("*.mzML")):
        files.append(FileInfo(
            id=f.name,
            name=f.name,
            size_mb=round(f.stat().st_size / 1024 / 1024, 2),
        ))
    return files


@router.get("/{file_id}/stats", response_model=FileStats)
def get_file_stats(file_id: str):
    """Get file statistics."""
    service = get_file_service(file_id)
    stats = service.get_stats()
    return FileStats(**stats)


@router.get("/{file_id}/tic")
def get_tic(file_id: str):
    """Get TIC data."""
    service = get_file_service(file_id)
    times, intensities = service.get_tic()
    return {
        "times": times.tolist(),
        "intensities": intensities.tolist(),
    }


@router.get("/{file_id}/bpc")
def get_bpc(file_id: str):
    """Get BPC data."""
    service = get_file_service(file_id)
    times, intensities = service.get_bpc()
    return {
        "times": times.tolist(),
        "intensities": intensities.tolist(),
    }


@router.get("/{file_id}/xic")
def get_xic(file_id: str, mz: float, tolerance: float = 0.5):
    """Get XIC data."""
    service = get_file_service(file_id)
    times, intensities = service.get_xic(mz, tolerance)
    return {
        "times": times.tolist(),
        "intensities": intensities.tolist(),
        "target_mz": mz,
        "tolerance": tolerance,
    }


@router.get("/{file_id}/spectrum")
def get_spectrum(file_id: str, rt: float, ms_level: Optional[int] = None):
    """Get spectrum at retention time."""
    service = get_file_service(file_id)
    mz, intensity, metadata = service.get_spectrum_by_rt(rt, ms_level)
    # Strip internal numpy noise arrays (not JSON-serializable, not used by client)
    metadata = {
        k: v for k, v in metadata.items()
        if k not in ("noise_mz_array", "noise_intensity_array")
    }
    return {
        "mz": mz.tolist(),
        "intensity": intensity.tolist(),
        "metadata": metadata,
    }


@router.get("/{file_id}/heatmap")
def get_heatmap(
    file_id: str,
    rt_bins: int = 200,
    mz_bins: int = 200,
    ms_level: int = 1,
):
    """Get heatmap data (m/z vs RT)."""
    service = get_file_service(file_id)
    data = service.get_heatmap(rt_bins=rt_bins, mz_bins=mz_bins, ms_level=ms_level)
    return data


@router.get("/{file_id}/snr")
def get_snr(
    file_id: str,
    mz: float,
    rt: float,
    mz_window: float = 0.5,
    ms_level: int = 1,
):
    """Get Signal-to-Noise Ratio for m/z at RT."""
    service = get_file_service(file_id)
    return service.get_snr_at_mz(
        target_mz=mz,
        rt=rt,
        mz_window=mz_window,
        ms_level=ms_level,
    )


@router.get("/{file_id}/top-peaks")
def get_top_peaks(
    file_id: str,
    rt: float,
    count: int = 10,
    ms_level: int = 1,
    mz_min: Optional[float] = None,
    mz_max: Optional[float] = None,
):
    """Get top peaks by intensity with SNR calculations, optionally filtered by m/z range."""
    service = get_file_service(file_id)
    return service.get_top_peaks_with_snr(
        rt=rt,
        count=count,
        ms_level=ms_level,
        mz_min=mz_min,
        mz_max=mz_max,
    )


def _datapoint_window(
    center_rt: float,
    range_seconds: Optional[float],
    start: Optional[float],
    end: Optional[float],
) -> Optional[tuple[float, float]]:
    """Resolve the RT window (minutes) for the full-scan datapoint count.

    Absolute start/end (minutes) take priority; otherwise range_seconds is
    centered on center_rt (e.g. 30 s -> center_rt +/- 15 s).
    """
    if start is not None and end is not None:
        return (start, end)
    if range_seconds is not None and range_seconds > 0:
        half_min = (range_seconds / 60.0) / 2.0
        return (center_rt - half_min, center_rt + half_min)
    return None


@router.get("/{file_id}/precursor-snr")
def get_precursor_snr(
    file_id: str,
    mz: float,
    rt: float,
    ppm: float = 5.0,
    rt_window: Optional[float] = None,
    dp_range_seconds: Optional[float] = None,
    dp_start: Optional[float] = None,
    dp_end: Optional[float] = None,
):
    """
    Calculate Signal-to-Noise Ratio for a precursor from Orbitrap data.

    Workflow:
    1. Extract XIC using target m/z with ±ppm tolerance
    2. Detect the peak closest to the target RT
    3. Get the MS1 spectrum at the peak apex
    4. Calculate S/N for the precursor in that spectrum

    Args:
        file_id: mzML file identifier
        mz: Target m/z value of the precursor
        rt: Approximate retention time (minutes)
        ppm: Mass tolerance in ppm (default ±5 ppm, Orbitrap standard)
        rt_window: Optional RT window to search for peaks (minutes)

    Returns:
        Dictionary with snr, signal, noise, apex_rt, actual_mz, etc.
    """
    try:
        service = get_file_service(file_id)
        result = service.get_precursor_snr(
            target_mz=mz,
            target_rt=rt,
            ppm_tolerance=ppm,
            rt_window=rt_window,
        )

        # Clean up spectrum_metadata to remove numpy arrays (not JSON serializable)
        if result.get("spectrum_metadata"):
            metadata = result["spectrum_metadata"]
            # Keep only JSON-serializable fields
            result["spectrum_metadata"] = {
                k: v for k, v in metadata.items()
                if k not in ("noise_mz_array", "noise_intensity_array")
            }

        # Count full-scan (MS1) datapoints in the requested time window,
        # centered on the target RT for the range mode.
        window = _datapoint_window(rt, dp_range_seconds, dp_start, dp_end)
        if window is not None:
            result["datapoint_count"] = service.count_datapoints(window[0], window[1], ms_level=1)
            result["dp_rt_start"] = round(window[0], 4)
            result["dp_rt_end"] = round(window[1], 4)

        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"SNR calculation failed: {str(e)}")


class CompoundInput(BaseModel):
    """Input for a single compound in bulk analysis."""
    name: str
    mz: float
    rt: float


class CompoundResult(BaseModel):
    """Result for a single compound in bulk analysis."""
    name: str
    mz: float
    rt: float
    snr: float
    signal: float
    noise: float
    apex_rt: float
    actual_mz: float
    datapoint_count: Optional[int] = None
    dp_rt_start: Optional[float] = None
    dp_rt_end: Optional[float] = None


class BulkSNRRequest(BaseModel):
    """Request for bulk SNR calculation."""
    compounds: list[CompoundInput]
    ppm: float = 5.0
    rt_window: float = 2.0
    # Full-scan datapoint counting (optional): absolute start/end (minutes)
    # take priority, else range_seconds centered on each compound's RT.
    dp_range_seconds: Optional[float] = None
    dp_start: Optional[float] = None
    dp_end: Optional[float] = None


class BulkSNRResponse(BaseModel):
    """Response for bulk SNR calculation."""
    results: list[CompoundResult]
    file_id: str
    ppm: float
    rt_window: float


@router.post("/{file_id}/bulk-snr", response_model=BulkSNRResponse)
def calculate_bulk_snr(file_id: str, request: BulkSNRRequest):
    """
    Calculate Signal-to-Noise Ratio for multiple compounds in bulk.

    Input CSV format: name, mz, rt
    Output: name, mz, rt, snr, signal, noise, apex_rt, actual_mz

    Args:
        file_id: mzML file identifier
        request: List of compounds with name, mz, rt and analysis parameters

    Returns:
        List of results with SNR calculations for each compound
    """
    service = get_file_service(file_id)
    results = []

    for compound in request.compounds:
        # Full-scan datapoint count is independent of the SNR calc.
        window = _datapoint_window(
            compound.rt, request.dp_range_seconds, request.dp_start, request.dp_end
        )
        dp_count = None
        dp_start = dp_end = None
        if window is not None:
            dp_count = service.count_datapoints(window[0], window[1], ms_level=1)
            dp_start, dp_end = round(window[0], 4), round(window[1], 4)

        try:
            snr_result = service.get_precursor_snr(
                target_mz=compound.mz,
                target_rt=compound.rt,
                ppm_tolerance=request.ppm,
                rt_window=request.rt_window,
            )
            results.append(CompoundResult(
                name=compound.name,
                mz=compound.mz,
                rt=compound.rt,
                snr=snr_result["snr"],
                signal=snr_result["signal"],
                noise=snr_result["noise"],
                apex_rt=snr_result["apex_rt"],
                actual_mz=snr_result["actual_mz"],
                datapoint_count=dp_count,
                dp_rt_start=dp_start,
                dp_rt_end=dp_end,
            ))
        except Exception:
            # If calculation fails, return zeros (keep the datapoint count)
            results.append(CompoundResult(
                name=compound.name,
                mz=compound.mz,
                rt=compound.rt,
                snr=0.0,
                signal=0.0,
                noise=0.0,
                apex_rt=compound.rt,
                actual_mz=compound.mz,
                datapoint_count=dp_count,
                dp_rt_start=dp_start,
                dp_rt_end=dp_end,
            ))

    return BulkSNRResponse(
        results=results,
        file_id=file_id,
        ppm=request.ppm,
        rt_window=request.rt_window,
    )


@router.post("/{file_id}/bulk-snr/csv")
def export_bulk_snr_csv(file_id: str, request: BulkSNRRequest):
    """
    Calculate bulk SNR and return as downloadable CSV file.
    """
    service = get_file_service(file_id)
    results = []

    for compound in request.compounds:
        window = _datapoint_window(
            compound.rt, request.dp_range_seconds, request.dp_start, request.dp_end
        )
        dp = {"datapoint_count": None, "dp_rt_start": None, "dp_rt_end": None}
        if window is not None:
            dp = {
                "datapoint_count": service.count_datapoints(window[0], window[1], ms_level=1),
                "dp_rt_start": round(window[0], 4),
                "dp_rt_end": round(window[1], 4),
            }

        try:
            snr_result = service.get_precursor_snr(
                target_mz=compound.mz,
                target_rt=compound.rt,
                ppm_tolerance=request.ppm,
                rt_window=request.rt_window,
            )
            results.append({
                "name": compound.name,
                "mz": compound.mz,
                "rt": compound.rt,
                "snr": snr_result["snr"],
                "signal": snr_result["signal"],
                "noise": snr_result["noise"],
                "apex_rt": snr_result["apex_rt"],
                "actual_mz": snr_result["actual_mz"],
                **dp,
            })
        except Exception:
            results.append({
                "name": compound.name,
                "mz": compound.mz,
                "rt": compound.rt,
                "snr": 0.0,
                "signal": 0.0,
                "noise": 0.0,
                "apex_rt": compound.rt,
                "actual_mz": compound.mz,
                **dp,
            })

    # If the .raw is present, enrich each compound with Trailer Extra at the
    # apex (MS1) scan so everything lands in a single CSV.
    raw_path = trailer_svc.find_raw_for(file_id)
    trailer_data = None
    if raw_path is not None:
        try:
            trailer_data = trailer_svc.extract_trailer(raw_path)
        except trailer_svc.TrailerError:
            trailer_data = None

    # Build CSV content
    headers = ["name", "mz", "rt", "snr", "signal", "noise", "apex_rt", "actual_mz"]
    dp_requested = (
        (request.dp_start is not None and request.dp_end is not None)
        or (request.dp_range_seconds is not None and request.dp_range_seconds > 0)
    )
    if dp_requested:
        headers += ["full_scan_datapoints", "dp_rt_start_min", "dp_rt_end_min"]
    if trailer_data is not None:
        headers += [
            "ion_injection_time_ms",
            "multiple_injection",
            "multi_inject_it_ms",
            "multi_inject_windows_mz",
            "stitched_windows_mz",
        ]
    lines = [",".join(headers)]
    for r in results:
        row = [
            r["name"],
            f"{r['mz']:.4f}",
            f"{r['rt']:.2f}",
            f"{r['snr']:.1f}",
            f"{r['signal']:.2e}",
            f"{r['noise']:.1f}",
            f"{r['apex_rt']:.3f}",
            f"{r['actual_mz']:.4f}",
        ]
        if dp_requested:
            dc = r.get("datapoint_count")
            row += [
                "" if dc is None else str(dc),
                "" if r.get("dp_rt_start") is None else f"{r['dp_rt_start']}",
                "" if r.get("dp_rt_end") is None else f"{r['dp_rt_end']}",
            ]
        if trailer_data is not None:
            scan = trailer_svc.nearest_scan(trailer_data, r["apex_rt"], ms_level=1)
            if scan is not None:
                iit = scan["ion_injection_time_ms"]
                row += [
                    "" if iit is None else f"{iit}",
                    (scan["multiple_injection"] or "").replace(",", ";"),
                    trailer_svc.format_it_groups(scan["multi_inject_it_ms"]),
                    trailer_svc.format_window_groups(scan["multi_inject_windows_mz"]),
                    trailer_svc.format_window_groups(scan["stitched_windows_mz"]),
                ]
            else:
                row += ["", "", "", "", ""]
        lines.append(",".join(row))
    csv_content = "\n".join(lines)

    # Return as downloadable file
    filename = f"snr_results_{file_id.replace('.mzML', '')}.csv"
    return Response(
        content=csv_content,
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


class UploadResponse(BaseModel):
    id: str
    name: str
    size_mb: float
    converted_from: Optional[str] = None


def _cache_file(filepath: Path):
    """Parse and cache a file for fast access."""
    service = MzMLService(filepath)
    service._ensure_loaded()  # This will parse and create binary cache
    service.get_stats()
    service.get_tic()
    service.get_bpc()
    _file_cache[filepath.name] = service


@router.post("/upload", response_model=UploadResponse)
def upload_file(file: UploadFile = File(...)):
    """
    Upload a file (.raw or .mzML).

    .raw files are automatically converted to .mzML using ThermoRawFileParser.
    After upload, the file is parsed and cached for instant access.
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided")

    filename = file.filename
    suffix = Path(filename).suffix.lower()

    if suffix not in [".raw", ".mzml"]:
        raise HTTPException(
            status_code=400,
            detail="Only .raw and .mzML files are supported"
        )

    data_dir = get_data_dir()
    data_dir.mkdir(parents=True, exist_ok=True)

    # Save uploaded file
    upload_path = data_dir / filename

    try:
        with open(upload_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    finally:
        file.file.close()

    converted_from = None
    final_path = upload_path

    # Convert .raw to .mzML if needed
    if suffix == ".raw":
        try:
            final_path = convert_raw_to_mzml(upload_path, data_dir)
            converted_from = filename
            # Keep the original .raw alongside the .mzML: Thermo Trailer Extra
            # metadata (per-window injection times, multi-inject / stitched
            # windows) is not exported to mzML and must be read from the .raw.
        except ConversionError as e:
            # Clean up the uploaded file on conversion failure
            upload_path.unlink(missing_ok=True)
            raise HTTPException(status_code=500, detail=str(e))

    # Parse and cache the file so it's ready for instant access
    _cache_file(final_path)

    return UploadResponse(
        id=final_path.name,
        name=final_path.name,
        size_mb=round(final_path.stat().st_size / 1024 / 1024, 2),
        converted_from=converted_from,
    )
