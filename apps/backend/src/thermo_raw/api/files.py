"""File management API."""
import shutil
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException, UploadFile, File
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel

from ..services.mzml import MzMLService, get_data_dir
from ..services.converter import convert_raw_to_mzml, ConversionError

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


@router.get("/{file_id}/precursor-snr")
def get_precursor_snr(
    file_id: str,
    mz: float,
    rt: float,
    ppm: float = 5.0,
    rt_window: Optional[float] = None,
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


class BulkSNRRequest(BaseModel):
    """Request for bulk SNR calculation."""
    compounds: list[CompoundInput]
    ppm: float = 5.0
    rt_window: float = 2.0


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
            ))
        except Exception as e:
            # If calculation fails, return zeros
            results.append(CompoundResult(
                name=compound.name,
                mz=compound.mz,
                rt=compound.rt,
                snr=0.0,
                signal=0.0,
                noise=0.0,
                apex_rt=compound.rt,
                actual_mz=compound.mz,
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
            })

    # Build CSV content
    headers = ["name", "mz", "rt", "snr", "signal", "noise", "apex_rt", "actual_mz"]
    lines = [",".join(headers)]
    for r in results:
        lines.append(",".join([
            r["name"],
            f"{r['mz']:.4f}",
            f"{r['rt']:.2f}",
            f"{r['snr']:.1f}",
            f"{r['signal']:.2e}",
            f"{r['noise']:.1f}",
            f"{r['apex_rt']:.3f}",
            f"{r['actual_mz']:.4f}",
        ]))
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
            # Remove the original .raw file after conversion
            upload_path.unlink()
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
