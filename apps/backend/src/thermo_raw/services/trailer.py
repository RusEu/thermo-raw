"""Thermo Trailer Extra extraction from .raw files via fisher_py.

ThermoRawFileParser does not export the proprietary Thermo "Trailer Extra"
metadata to mzML, so the fields the client needs -- per-window injection
times, multi-inject / stitched window definitions and the overall ion
injection time -- are read directly from the .raw using fisher_py
(pythonnet on the Mono runtime). Results are cached to disk per .raw so the
(relatively slow) scan-by-scan read happens only once.
"""
import hashlib
import json
import os
import re
import sys
import time
from pathlib import Path
from typing import Optional

from .mzml import get_cache_dir, get_data_dir

# Exact Trailer Extra labels (instrument/firmware dependent, verified against
# the client's Orbitrap msx/BoxCar acquisition).
LBL_MULTIPLE_INJECTION = "Multiple Injection:"
LBL_MULTI_INJECT_INFO = "Multi Inject Info:"
LBL_MULTI_INJECT_WINDOWS = "Multi Inject Windows (m/z):"
LBL_STITCHED_WINDOWS = "Stitched Windows (m/z):"
LBL_ION_INJECTION_TIME = "Ion Injection Time (ms):"


class TrailerError(Exception):
    """Raised when Trailer Extra extraction fails."""
    pass


def find_raw_for(file_id: str) -> Optional[Path]:
    """Return the .raw matching an mzML file_id (same stem), if it exists."""
    data_dir = get_data_dir()
    stem = Path(file_id).stem
    candidate = data_dir / f"{stem}.raw"
    if candidate.exists():
        return candidate
    # Case-insensitive extension fallback (.RAW)
    for p in data_dir.glob("*.[rR][aA][wW]"):
        if p.stem == stem:
            return p
    return None


def _parse_float(s: str) -> Optional[float]:
    try:
        return float(s.strip())
    except (ValueError, AttributeError):
        return None


def parse_multi_inject_it(value: str) -> list[list[float]]:
    """Parse 'Multi Inject Info' into groups of per-window injection times.

    Examples:
        'IT=4.3;4.3;4.3'                 -> [[4.3, 4.3, 4.3]]
        'IT=17;17;...;11;IT=16;...;16'   -> [[17,17,...,11], [16,16,...,16]]
    """
    value = (value or "").strip()
    if not value:
        return []
    groups = []
    for chunk in value.split("IT="):
        chunk = chunk.strip().strip(";")
        if not chunk:
            continue
        nums = [_parse_float(x) for x in chunk.split(";") if x.strip() != ""]
        nums = [n for n in nums if n is not None]
        if nums:
            groups.append(nums)
    return groups


def parse_windows(value: str) -> list[list[list[float]]]:
    """Parse window definitions like '(low-high;low-high;...)' into ranges.

    Returns a list of groups; each group is a list of [low, high] m/z pairs.
    Handles one or several parenthesised groups.
    """
    value = (value or "").strip()
    if not value:
        return []
    groups = re.findall(r"\(([^)]*)\)", value)
    if not groups:
        groups = [value]
    result = []
    for g in groups:
        ranges = []
        for part in g.split(";"):
            part = part.strip()
            if not part:
                continue
            m = re.match(r"^([\d.]+)\s*-\s*([\d.]+)$", part)
            if m:
                ranges.append([float(m.group(1)), float(m.group(2))])
        if ranges:
            result.append(ranges)
    return result


def _ms_level_from_filter(filter_str: str) -> int:
    """Infer MS level from a Thermo filter string."""
    m = re.search(r"\bms(\d+)\b", filter_str.lower())
    if m:
        return int(m.group(1))
    return 1  # 'Full ms' / 'Full msx ms' is MS1


def _cache_path(raw_path: Path) -> Path:
    stat = raw_path.stat()
    key = f"{raw_path.name}_{stat.st_size}_{int(stat.st_mtime)}"
    h = hashlib.md5(key.encode()).hexdigest()[:12]
    # v2: ion injection time now backfilled from the mzML (busts old caches)
    return get_cache_dir() / f"{raw_path.stem}_trailer_v2_{h}.json"


def extract_trailer(raw_path: Path) -> dict:
    """Read the Trailer Extra fields of interest for every scan in a .raw.

    Returns a dict with 'scans' (one row per scan) and a 'summary'.
    Caches the result to disk keyed by file size + mtime.
    """
    cache = _cache_path(raw_path)
    if cache.exists():
        try:
            with open(cache, "r") as f:
                return json.load(f)
        except Exception:
            pass  # fall through and re-extract

    # fisher_py loads pythonnet on import, which needs a .NET runtime: the
    # bundled Mono on Linux/macOS, .NET Framework on Windows. Pick it before
    # importing fisher_py (env must be set before pythonnet.load() runs).
    if "PYTHONNET_RUNTIME" not in os.environ:
        os.environ["PYTHONNET_RUNTIME"] = "netfx" if sys.platform == "win32" else "mono"

    # Import lazily so the module loads without the CLR/.NET runtime present.
    try:
        from fisher_py.data.device import Device
        from fisher_py.raw_file_reader.raw_file_reader_adapter import (
            RawFileReaderAdapter,
        )
    except Exception as e:  # ImportError or CLR/runtime load failure
        raise TrailerError(
            "No se pudo cargar fisher_py / el runtime .NET para leer el "
            f"Trailer Extra del .raw ({type(e).__name__}: {e}). "
            "En la app de escritorio requiere .NET; en Windows usa .NET "
            "Framework."
        )

    raw = RawFileReaderAdapter.file_factory(str(raw_path))
    try:
        if raw.is_error:
            raise TrailerError(f"fisher_py could not open {raw_path.name}")
        raw.select_instrument(Device.MS, 1)
        hdr = raw.run_header_ex
        first, last = int(hdr.first_spectrum), int(hdr.last_spectrum)

        scans = []
        start = time.time()
        for scan in range(first, last + 1):
            tr = raw.get_trailer_extra_information(scan)
            d = {
                str(lab).strip(): str(val).strip()
                for lab, val in zip(list(tr.labels), list(tr.values))
            }
            filter_str = raw.get_scan_event_string_for_scan_number(scan)
            it_groups = parse_multi_inject_it(d.get(LBL_MULTI_INJECT_INFO, ""))
            inject_windows = parse_windows(d.get(LBL_MULTI_INJECT_WINDOWS, ""))
            stitched = parse_windows(d.get(LBL_STITCHED_WINDOWS, ""))
            scans.append({
                "scan": scan,
                "rt_min": round(float(raw.retention_time_from_scan_number(scan)), 5),
                "ms_level": _ms_level_from_filter(filter_str),
                "filter": filter_str,
                "ion_injection_time_ms": _parse_float(
                    d.get(LBL_ION_INJECTION_TIME, "")
                ),
                "multiple_injection": d.get(LBL_MULTIPLE_INJECTION, "") or None,
                "multi_inject_it_ms": it_groups,
                "multi_inject_windows_mz": inject_windows,
                "stitched_windows_mz": stitched,
            })
        elapsed = time.time() - start
        print(
            f"[Trailer] Extracted {len(scans)} scans from {raw_path.name} "
            f"({elapsed:.1f}s)",
            flush=True,
        )
    finally:
        raw.dispose()

    # Ion injection time is also exported to the mzML (MS:1000927) and read
    # there platform-independently; prefer it so the value is reliable even if
    # the .raw trailer read of that one field misbehaves (e.g. Windows .NET).
    mzml_path = raw_path.with_suffix(".mzML")
    if mzml_path.exists():
        try:
            from .mzml import MzMLService
            iit_map = MzMLService(mzml_path).get_ion_injection_times()
            filled = 0
            for sc in scans:
                mzml_iit = iit_map.get(sc["scan"])
                if mzml_iit is not None:
                    sc["ion_injection_time_ms"] = mzml_iit
                    filled += 1
            print(f"[Trailer] Ion injection time from mzML for {filled} scans", flush=True)
        except Exception as e:
            print(f"[Trailer] mzML ion-injection backfill failed: {e}", flush=True)

    result = {
        "file": raw_path.name,
        "num_scans": len(scans),
        "summary": _summarize(scans),
        "scans": scans,
    }
    try:
        with open(cache, "w") as f:
            json.dump(result, f)
    except Exception as e:
        print(f"[Trailer] Failed to cache: {e}", flush=True)
    return result


FLAT_COLUMNS = [
    "scan", "rt_min", "ms_level", "multiple_injection",
    "ion_injection_time_ms", "injection", "window", "window_it_ms",
    "window_mz_low", "window_mz_high", "stitched_mz_low", "stitched_mz_high",
]


def flatten_to_rows(result: dict, only_multi_inject: bool = True) -> list[dict]:
    """Flatten the per-scan structure to one row per (scan, injection, window).

    This long format preserves the per-window injection time and the m/z of
    each multi-inject / stitched window, which is what the client needs for
    spreadsheet analysis. Scans without multi-inject data are skipped unless
    only_multi_inject is False (then they emit a single row with the overall
    ion injection time).
    """
    rows: list[dict] = []
    for s in result["scans"]:
        it_groups = s["multi_inject_it_ms"]
        win_groups = s["multi_inject_windows_mz"]
        stitched_groups = s["stitched_windows_mz"]
        base = {
            "scan": s["scan"],
            "rt_min": s["rt_min"],
            "ms_level": s["ms_level"],
            "multiple_injection": s["multiple_injection"],
            "ion_injection_time_ms": s["ion_injection_time_ms"],
        }
        if not it_groups:
            if not only_multi_inject:
                rows.append({**base, "injection": None, "window": None,
                             "window_it_ms": None, "window_mz_low": None,
                             "window_mz_high": None, "stitched_mz_low": None,
                             "stitched_mz_high": None})
            continue
        for i, it_group in enumerate(it_groups):
            win_group = win_groups[i] if i < len(win_groups) else []
            st_group = stitched_groups[i] if i < len(stitched_groups) else []
            for j, it_val in enumerate(it_group):
                win = win_group[j] if j < len(win_group) else [None, None]
                st = st_group[j] if j < len(st_group) else [None, None]
                rows.append({
                    **base,
                    "injection": i + 1,
                    "window": j + 1,
                    "window_it_ms": it_val,
                    "window_mz_low": win[0],
                    "window_mz_high": win[1],
                    "stitched_mz_low": st[0],
                    "stitched_mz_high": st[1],
                })
    return rows


def _fmt_num(v) -> str:
    if v is None:
        return ""
    f = float(v)
    return str(int(f)) if f.is_integer() else str(f)


def format_it_groups(groups: list[list[float]]) -> str:
    """'0.76;19;19;19;19;19 | 16;16;16;16;16;16' (semicolons within a group,
    ' | ' between sub-injections). Comma-free so it is safe in a CSV cell."""
    return " | ".join(";".join(_fmt_num(v) for v in g) for g in groups)


def format_window_groups(groups: list[list[list[float]]]) -> str:
    """'781.6-901.0;581.6-701.0 | 881.6-1000.0;...' — comma-free for CSV."""
    return " | ".join(
        ";".join(f"{_fmt_num(lo)}-{_fmt_num(hi)}" for lo, hi in g) for g in groups
    )


def nearest_scan(result: dict, rt: float, ms_level: Optional[int] = None) -> Optional[dict]:
    """Return the scan whose retention time is closest to rt.

    If ms_level is given, only scans at that MS level are considered (used to
    map a precursor apex RT to its MS1 acquisition scan).
    """
    best = None
    best_d = None
    for s in result["scans"]:
        if ms_level is not None and s["ms_level"] != ms_level:
            continue
        d = abs(s["rt_min"] - rt)
        if best_d is None or d < best_d:
            best_d = d
            best = s
    return best


def _summarize(scans: list[dict]) -> dict:
    """Aggregate counts useful for the dashboard header."""
    multi = [s for s in scans if s["multi_inject_it_ms"]]
    with_windows = [s for s in scans if s["multi_inject_windows_mz"]]
    with_stitched = [s for s in scans if s["stitched_windows_mz"]]
    modes: dict[str, int] = {}
    for s in scans:
        mode = s["multiple_injection"]
        if mode:
            modes[mode] = modes.get(mode, 0) + 1
    return {
        "scans_with_multi_inject": len(multi),
        "scans_with_inject_windows": len(with_windows),
        "scans_with_stitched_windows": len(with_stitched),
        "injection_modes": modes,
    }
