"""API endpoints for Thermo Trailer Extra data read from the .raw file.

These expose the proprietary fields that ThermoRawFileParser does not write
to mzML: per-window injection times, multi-inject / stitched windows and the
overall ion injection time. Requires the original .raw to be present next to
the .mzML (same stem).
"""
import io
from pathlib import Path
from typing import Optional

import pandas as pd
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import Response
from pydantic import BaseModel

from ..services import trailer as trailer_svc

router = APIRouter()


class RtBatch(BaseModel):
    rts: list[float]
    ms_level: Optional[int] = None


@router.get("/{file_id}/available")
def trailer_available(file_id: str):
    """Whether a .raw with Trailer Extra exists for this mzML file."""
    raw_path = trailer_svc.find_raw_for(file_id)
    return {
        "available": raw_path is not None,
        "raw_name": raw_path.name if raw_path else None,
    }


def _get_extract(file_id: str) -> dict:
    raw_path = trailer_svc.find_raw_for(file_id)
    if raw_path is None:
        raise HTTPException(
            status_code=404,
            detail=(
                "No .raw file found for this dataset. Trailer Extra "
                "(multi-inject / stitched windows, per-window injection "
                "times) can only be read from the original .raw."
            ),
        )
    try:
        return trailer_svc.extract_trailer(raw_path)
    except trailer_svc.TrailerError as e:
        raise HTTPException(status_code=500, detail=str(e))


def _filter_scans(scans: list, only_windows: bool, only_multi_inject: bool) -> list:
    if only_windows:
        return [s for s in scans if s["multi_inject_windows_mz"]]
    if only_multi_inject:
        return [s for s in scans if s["multi_inject_it_ms"]]
    return scans


@router.get("/{file_id}")
def get_trailer(
    file_id: str,
    only_windows: bool = Query(False),
    only_multi_inject: bool = Query(True),
    offset: int = Query(0, ge=0),
    limit: int = Query(2000, ge=1, le=50000),
):
    """Per-scan Trailer Extra data plus a summary.

    Filtering (most restrictive first):
      - only_windows: only scans with multi-inject m/z windows (BoxCar/mpx).
      - only_multi_inject: only scans with per-window injection times.
    Set both false to include every scan. Results are paginated.
    """
    data = _get_extract(file_id)
    scans = _filter_scans(data["scans"], only_windows, only_multi_inject)
    total = len(scans)
    page = scans[offset:offset + limit]
    return {
        "file": data["file"],
        "num_scans": data["num_scans"],
        "summary": data["summary"],
        "total_filtered": total,
        "offset": offset,
        "limit": limit,
        "scans": page,
    }


@router.get("/{file_id}/at-rt")
def trailer_at_rt(
    file_id: str,
    rt: float,
    ms_level: Optional[int] = Query(None),
):
    """Trailer Extra for the scan whose RT is closest to `rt` (e.g. an apex)."""
    data = _get_extract(file_id)
    scan = trailer_svc.nearest_scan(data, rt, ms_level)
    if scan is None:
        raise HTTPException(status_code=404, detail="No scan found")
    return scan


@router.post("/{file_id}/at-rts")
def trailer_at_rts(file_id: str, body: RtBatch):
    """Batch version of /at-rt: one scan per input RT (aligned to input order)."""
    data = _get_extract(file_id)
    return {
        "scans": [
            trailer_svc.nearest_scan(data, rt, body.ms_level) for rt in body.rts
        ]
    }


@router.get("/{file_id}/export")
def export_trailer(
    file_id: str,
    format: str = Query("csv", pattern="^(csv|xlsx)$"),
    only_windows: bool = Query(False),
    only_multi_inject: bool = Query(True),
):
    """Download the Trailer Extra data in long format (one row per window)."""
    data = _get_extract(file_id)
    scans = _filter_scans(data["scans"], only_windows, only_multi_inject)
    rows = trailer_svc.flatten_to_rows({"scans": scans}, only_multi_inject=False)
    df = pd.DataFrame(rows, columns=trailer_svc.FLAT_COLUMNS)

    stem = Path(file_id).stem
    if format == "xlsx":
        buf = io.BytesIO()
        with pd.ExcelWriter(buf, engine="openpyxl") as writer:
            df.to_excel(writer, index=False, sheet_name="trailer")
        return Response(
            content=buf.getvalue(),
            media_type=(
                "application/vnd.openxmlformats-officedocument."
                "spreadsheetml.sheet"
            ),
            headers={
                "Content-Disposition": f"attachment; filename={stem}_trailer.xlsx"
            },
        )

    csv_content = df.to_csv(index=False)
    return Response(
        content=csv_content,
        media_type="text/csv",
        headers={
            "Content-Disposition": f"attachment; filename={stem}_trailer.csv"
        },
    )
