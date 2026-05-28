"""mzML data processing service."""
import hashlib
import os
import pickle
import sys
import time
from pathlib import Path
from typing import Optional

import numpy as np
from pyteomics import mzml


def is_frozen() -> bool:
    """Check if running as a PyInstaller bundle."""
    return getattr(sys, 'frozen', False)


def get_project_root() -> Path:
    """Find project root by looking for data/ directory."""
    # Start from this file's location and go up
    current = Path(__file__).resolve().parent
    for _ in range(10):  # Max 10 levels up
        data_candidate = current / "data"
        if data_candidate.exists() and data_candidate.is_dir():
            return current
        current = current.parent
    return Path.cwd()


def get_data_dir() -> Path:
    """Get data directory from env or auto-detect.

    In frozen (standalone) mode, uses ~/ThermoRaw/data/
    In development, uses DATA_DIR env var or auto-detected data/ folder.
    """
    # First check environment variable (works in both modes)
    if "DATA_DIR" in os.environ:
        return Path(os.environ["DATA_DIR"])

    # In frozen mode (standalone app), use user's home directory
    if is_frozen():
        data_dir = Path.home() / "ThermoRaw" / "data"
        data_dir.mkdir(parents=True, exist_ok=True)
        return data_dir

    # Auto-detect: look for data/ folder in project root
    project_root = get_project_root()
    data_dir = project_root / "data"
    if data_dir.exists():
        return data_dir

    # Fallback for Docker
    return Path("/data")


def get_cache_dir() -> Path:
    """Get cache directory for binary parsed files."""
    cache_dir = get_data_dir() / ".cache"
    cache_dir.mkdir(exist_ok=True)
    return cache_dir


def ppm_to_da(mz: float, ppm: float) -> float:
    """Convert ppm tolerance to Daltons for a given m/z."""
    return mz * ppm / 1e6


def interpolate_noise(target_mz: float, noise_mz: np.ndarray, noise_intensity: np.ndarray) -> float:
    """
    Interpolate noise value at target m/z from sampled Thermo noise data.

    Args:
        target_mz: m/z value to get noise for
        noise_mz: Array of sampled m/z values
        noise_intensity: Array of noise values at each sampled m/z

    Returns:
        Interpolated noise value
    """
    if len(noise_mz) == 0:
        return 0.0

    # If target is outside the sampled range, use nearest value
    if target_mz <= noise_mz[0]:
        return float(noise_intensity[0])
    if target_mz >= noise_mz[-1]:
        return float(noise_intensity[-1])

    # Linear interpolation
    return float(np.interp(target_mz, noise_mz, noise_intensity))


def _scan_number_from_id(spec_id: str) -> Optional[int]:
    """Parse the Thermo scan number from a spectrum id.

    e.g. 'controllerType=0 controllerNumber=1 scan=5681' -> 5681
    """
    if not spec_id:
        return None
    marker = "scan="
    idx = spec_id.rfind(marker)
    if idx == -1:
        return None
    tail = spec_id[idx + len(marker):].split()[0]
    try:
        return int(tail)
    except ValueError:
        return None


class MzMLService:
    """Service for processing mzML files."""

    def __init__(self, filepath: Path):
        self.filepath = filepath
        self._spectra: list = []
        self._loaded = False
        self._cache: dict = {}

    def _get_cache_path(self) -> Path:
        """Get path to binary cache file for this mzML."""
        # Use file size + mtime as cache key to detect changes
        stat = self.filepath.stat()
        key = f"{self.filepath.name}_{stat.st_size}_{int(stat.st_mtime)}"
        cache_hash = hashlib.md5(key.encode()).hexdigest()[:12]
        return get_cache_dir() / f"{self.filepath.stem}_{cache_hash}.pkl"

    def _ensure_loaded(self):
        """Load spectra from binary cache or parse mzML."""
        if self._loaded:
            return

        cache_path = self._get_cache_path()

        # Try loading from binary cache first
        if cache_path.exists():
            start = time.time()
            try:
                with open(cache_path, "rb") as f:
                    self._spectra = pickle.load(f)
                self._loaded = True
                print(f"[Cache] Loaded {self.filepath.name} from cache ({time.time()-start:.2f}s)", flush=True)
                return
            except Exception as e:
                print(f"[Cache] Failed to load cache for {self.filepath.name}: {e}", flush=True)

        # Parse mzML file
        start = time.time()
        self._spectra = []
        with mzml.read(str(self.filepath)) as reader:
            for spectrum in reader:
                self._spectra.append(spectrum)
        self._loaded = True
        parse_time = time.time() - start
        print(f"[Parse] {self.filepath.name}: {len(self._spectra)} spectra in {parse_time:.1f}s", flush=True)

        # Save to binary cache for next time
        try:
            with open(cache_path, "wb") as f:
                pickle.dump(self._spectra, f, protocol=pickle.HIGHEST_PROTOCOL)
            cache_size = cache_path.stat().st_size / 1024 / 1024
            print(f"[Cache] Saved {self.filepath.name} ({cache_size:.1f}MB)", flush=True)
        except Exception as e:
            print(f"[Cache] Failed to save cache for {self.filepath.name}: {e}", flush=True)

    def _get_rt(self, spectrum) -> Optional[float]:
        """Extract retention time from spectrum."""
        scan_list = spectrum.get("scanList", {})
        scans = scan_list.get("scan", [{}])
        if scans:
            return scans[0].get("scan start time", None)
        return None

    def get_stats(self) -> dict:
        """Get file statistics."""
        if "stats" in self._cache:
            return self._cache["stats"]

        self._ensure_loaded()

        rt_values = []
        mz_min, mz_max = float("inf"), float("-inf")
        ms1_count = 0
        ms2_count = 0
        polarities = set()
        tic_values = []

        for s in self._spectra:
            level = s.get("ms level", 1)
            if level == 1:
                ms1_count += 1
            elif level == 2:
                ms2_count += 1

            rt = self._get_rt(s)
            if rt is not None:
                rt_values.append(rt)

            mz_array = s.get("m/z array", np.array([]))
            if len(mz_array) > 0:
                mz_min = min(mz_min, mz_array.min())
                mz_max = max(mz_max, mz_array.max())

            intensity_array = s.get("intensity array", np.array([]))
            if len(intensity_array) > 0 and level == 1:
                tic_values.append(np.sum(intensity_array))

            if "positive scan" in s:
                polarities.add("positive")
            if "negative scan" in s:
                polarities.add("negative")

        tic_array = np.array(tic_values) if tic_values else np.array([0])

        result = {
            "filename": self.filepath.name,
            "total_scans": len(self._spectra),
            "ms1_scans": ms1_count,
            "ms2_scans": ms2_count,
            "rt_min": min(rt_values) if rt_values else 0,
            "rt_max": max(rt_values) if rt_values else 0,
            "mz_min": mz_min if mz_min != float("inf") else 0,
            "mz_max": mz_max if mz_max != float("-inf") else 0,
            "max_tic": float(tic_array.max()),
            "mean_tic": float(tic_array.mean()),
            "polarity": ", ".join(polarities) if polarities else "unknown",
        }
        self._cache["stats"] = result
        return result

    def get_tic(self) -> tuple[np.ndarray, np.ndarray]:
        """Get Total Ion Chromatogram."""
        if "tic" in self._cache:
            return self._cache["tic"]

        self._ensure_loaded()
        times, intensities = [], []
        for s in self._spectra:
            if s.get("ms level") == 1:
                rt = self._get_rt(s)
                if rt is not None:
                    times.append(rt)
                    intensities.append(np.sum(s.get("intensity array", [])))

        times = np.array(times)
        intensities = np.array(intensities)
        # Sort by retention time
        sort_idx = np.argsort(times)
        result = (times[sort_idx], intensities[sort_idx])
        self._cache["tic"] = result
        return result

    def get_bpc(self) -> tuple[np.ndarray, np.ndarray]:
        """Get Base Peak Chromatogram."""
        if "bpc" in self._cache:
            return self._cache["bpc"]

        self._ensure_loaded()
        times, intensities = [], []
        for s in self._spectra:
            if s.get("ms level") == 1:
                rt = self._get_rt(s)
                if rt is not None:
                    intensity_array = s.get("intensity array", np.array([]))
                    times.append(rt)
                    intensities.append(intensity_array.max() if len(intensity_array) > 0 else 0)

        times = np.array(times)
        intensities = np.array(intensities)
        # Sort by retention time
        sort_idx = np.argsort(times)
        result = (times[sort_idx], intensities[sort_idx])
        self._cache["bpc"] = result
        return result

    def get_xic(self, target_mz: float, tolerance: float = 0.5) -> tuple[np.ndarray, np.ndarray]:
        """Get Extracted Ion Chromatogram."""
        self._ensure_loaded()
        times, intensities = [], []
        for s in self._spectra:
            if s.get("ms level") == 1:
                rt = self._get_rt(s)
                if rt is not None:
                    mz_array = s.get("m/z array", np.array([]))
                    intensity_array = s.get("intensity array", np.array([]))
                    if len(mz_array) > 0:
                        mask = np.abs(mz_array - target_mz) <= tolerance
                        extracted = np.sum(intensity_array[mask])
                    else:
                        extracted = 0
                    times.append(rt)
                    intensities.append(extracted)

        times = np.array(times)
        intensities = np.array(intensities)
        # Sort by retention time
        sort_idx = np.argsort(times)
        return times[sort_idx], intensities[sort_idx]

    def count_datapoints(self, rt_start: float, rt_end: float, ms_level: int = 1) -> int:
        """Count scans of the given MS level acquired within an RT window.

        rt_start/rt_end are in minutes (inclusive). For a full scan use
        ms_level=1; this is the number of chromatographic data points across
        the window (e.g. points across a peak).
        """
        self._ensure_loaded()
        lo, hi = (rt_start, rt_end) if rt_start <= rt_end else (rt_end, rt_start)
        count = 0
        for s in self._spectra:
            if ms_level is not None and s.get("ms level") != ms_level:
                continue
            rt = self._get_rt(s)
            if rt is not None and lo <= rt <= hi:
                count += 1
        return count

    def extract_in_range(
        self, target_mz: float, ppm: float, rt_start: float, rt_end: float
    ) -> list[dict]:
        """Per-MS1-scan extracted intensity for target_mz +/- ppm in a time range.

        Returns one row per MS1 scan whose RT is inside [rt_start, rt_end] (minutes),
        with the summed intensity inside the m/z window and the most-intense
        actual m/z. No peak-finding / apex search.
        """
        self._ensure_loaded()
        lo, hi = (rt_start, rt_end) if rt_start <= rt_end else (rt_end, rt_start)
        tol_da = ppm_to_da(target_mz, ppm)
        rows: list[dict] = []
        for s in self._spectra:
            if s.get("ms level") != 1:
                continue
            rt = self._get_rt(s)
            if rt is None or rt < lo or rt > hi:
                continue
            scan_no = _scan_number_from_id(s.get("id", ""))
            mz_array = s.get("m/z array", np.array([]))
            intensity_array = s.get("intensity array", np.array([]))
            if len(mz_array) == 0:
                rows.append({
                    "scan": scan_no, "rt_min": float(rt), "intensity": 0.0,
                    "actual_mz": None, "n_peaks": 0,
                })
                continue
            mask = np.abs(mz_array - target_mz) <= tol_da
            n = int(np.sum(mask))
            if n == 0:
                rows.append({
                    "scan": scan_no, "rt_min": float(rt), "intensity": 0.0,
                    "actual_mz": None, "n_peaks": 0,
                })
            else:
                window_mz = mz_array[mask]
                window_int = intensity_array[mask]
                i_max = int(np.argmax(window_int))
                rows.append({
                    "scan": scan_no, "rt_min": float(rt),
                    "intensity": float(np.sum(window_int)),
                    "actual_mz": float(window_mz[i_max]),
                    "n_peaks": n,
                })
        return rows

    def get_ion_injection_times(self) -> dict[int, float]:
        """Map Thermo scan number -> ion injection time (ms) from the mzML.

        Reads cvParam MS:1000927, which ThermoRawFileParser writes for every
        scan. Platform-independent (no .NET), used to fill the value otherwise
        read from the proprietary .raw trailer.
        """
        self._ensure_loaded()
        result: dict[int, float] = {}
        for s in self._spectra:
            scan_no = _scan_number_from_id(s.get("id", ""))
            if scan_no is None:
                continue
            scan_list = s.get("scanList", {}).get("scan", [])
            if not scan_list:
                continue
            iit = scan_list[0].get("ion injection time")
            if iit is not None:
                result[scan_no] = float(iit)
        return result

    def get_spectrum_by_rt(self, target_rt: float, ms_level: Optional[int] = None) -> tuple[np.ndarray, np.ndarray, dict]:
        """Get spectrum closest to target RT.

        Returns:
            Tuple of (mz_array, intensity_array, metadata)
            metadata includes 'noise_array' if available from Thermo noise data
        """
        self._ensure_loaded()
        best_idx = 0
        best_diff = float("inf")

        for i, s in enumerate(self._spectra):
            if ms_level is not None and s.get("ms level") != ms_level:
                continue
            rt = self._get_rt(s)
            if rt is not None:
                diff = abs(rt - target_rt)
                if diff < best_diff:
                    best_diff = diff
                    best_idx = i

        s = self._spectra[best_idx]
        mz = s.get("m/z array", np.array([]))
        intensity = s.get("intensity array", np.array([]))

        # Check for sampled noise data (available if converted with -N flag)
        # Thermo stores noise as sampled arrays that need interpolation
        noise_mz = s.get("sampled noise m/z array", None)
        noise_intensity = s.get("sampled noise intensity array", None)
        has_noise_data = noise_mz is not None and noise_intensity is not None

        metadata = {
            "ms_level": s.get("ms level", 1),
            "rt": self._get_rt(s),
            "scan_index": best_idx,
            "num_peaks": len(mz),
            "has_noise_data": has_noise_data,
        }

        if has_noise_data:
            metadata["noise_mz_array"] = noise_mz
            metadata["noise_intensity_array"] = noise_intensity

        return mz, intensity, metadata

    def get_heatmap(self, rt_bins: int = 200, mz_bins: int = 200, ms_level: int = 1) -> dict:
        """Generate heatmap data (m/z vs RT) - vectorized for performance."""
        cache_key = f"heatmap_{rt_bins}_{mz_bins}_{ms_level}"
        if cache_key in self._cache:
            return self._cache[cache_key]

        self._ensure_loaded()

        # Get ranges from stats (cached)
        stats = self.get_stats()
        rt_min, rt_max = stats["rt_min"], stats["rt_max"]
        mz_min, mz_max = stats["mz_min"], stats["mz_max"]

        # Collect all data points for vectorized binning
        all_mz = []
        all_rt = []
        all_intensity = []

        for s in self._spectra:
            if s.get("ms level") != ms_level:
                continue

            rt = self._get_rt(s)
            if rt is None:
                continue

            mz_array = s.get("m/z array", np.array([]))
            intensity_array = s.get("intensity array", np.array([]))

            if len(mz_array) == 0:
                continue

            # Append all points from this spectrum
            all_mz.append(mz_array)
            all_rt.append(np.full(len(mz_array), rt))
            all_intensity.append(intensity_array)

        if not all_mz:
            # No data, return empty matrix
            result = {
                "intensity": np.zeros((mz_bins, rt_bins)).tolist(),
                "rt_min": rt_min,
                "rt_max": rt_max,
                "mz_min": mz_min,
                "mz_max": mz_max,
                "rt_bins": rt_bins,
                "mz_bins": mz_bins,
            }
            self._cache[cache_key] = result
            return result

        # Concatenate all arrays for vectorized processing
        all_mz = np.concatenate(all_mz)
        all_rt = np.concatenate(all_rt)
        all_intensity = np.concatenate(all_intensity)

        # Use numpy histogram2d with weights for fast binning
        intensity_matrix, _, _ = np.histogram2d(
            all_mz, all_rt,
            bins=[mz_bins, rt_bins],
            range=[[mz_min, mz_max], [rt_min, rt_max]],
            weights=all_intensity
        )

        result = {
            "intensity": intensity_matrix.tolist(),
            "rt_min": rt_min,
            "rt_max": rt_max,
            "mz_min": mz_min,
            "mz_max": mz_max,
            "rt_bins": rt_bins,
            "mz_bins": mz_bins,
        }

        self._cache[cache_key] = result
        return result

    def get_snr_at_mz(
        self,
        target_mz: float,
        rt: float,
        mz_window: float = 0.5,
        ms_level: int = 1,
    ) -> dict:
        """
        Calculate Signal-to-Noise Ratio for a specific m/z at given RT.

        Uses actual Thermo noise data if available (mzML converted with -N flag),
        otherwise falls back to estimated noise model.

        Args:
            target_mz: Target m/z value
            rt: Retention time
            mz_window: Window for signal extraction (±tolerance)
            ms_level: MS level to use

        Returns:
            Dictionary with signal, noise, snr, target_mz, actual_mz, rt, noise_source
        """
        mz_array, intensity_array, metadata = self.get_spectrum_by_rt(rt, ms_level)

        if len(mz_array) == 0:
            return {
                "signal": 0.0,
                "noise": 0.0,
                "snr": 0.0,
                "target_mz": target_mz,
                "actual_mz": target_mz,
                "rt": metadata.get("rt", rt),
                "noise_source": "none",
            }

        # Find signal: intensity at closest m/z within window
        mz_diffs = np.abs(mz_array - target_mz)
        closest_idx = np.argmin(mz_diffs)

        if mz_diffs[closest_idx] <= mz_window:
            signal = float(intensity_array[closest_idx])
            actual_mz = float(mz_array[closest_idx])
        else:
            signal = 0.0
            actual_mz = target_mz

        # Use Thermo noise data (interpolated from sampled data)
        # Requires mzML converted with -N flag
        if metadata.get("has_noise_data"):
            noise_mz = metadata.get("noise_mz_array")
            noise_intensity = metadata.get("noise_intensity_array")
            noise = interpolate_noise(actual_mz, noise_mz, noise_intensity)
        else:
            # No noise data available - file needs to be reconverted with -N flag
            noise = 0.0

        # Calculate SNR
        snr = signal / noise if noise > 0 else 0.0

        return {
            "signal": signal,
            "noise": noise,
            "snr": snr,
            "target_mz": target_mz,
            "actual_mz": actual_mz,
            "rt": metadata.get("rt", rt),
        }

    def get_top_peaks_with_snr(
        self,
        rt: float,
        count: int = 10,
        ms_level: int = 1,
        mz_min: float | None = None,
        mz_max: float | None = None,
    ) -> list[dict]:
        """
        Get top peaks by intensity with SNR calculations.

        Requires mzML file converted with -N flag for Thermo noise data.

        Args:
            rt: Retention time
            count: Number of top peaks to return
            ms_level: MS level to use
            mz_min: Optional minimum m/z to filter peaks
            mz_max: Optional maximum m/z to filter peaks

        Returns:
            List of dicts with mz, intensity, noise, snr for top peaks
        """
        mz_array, intensity_array, metadata = self.get_spectrum_by_rt(rt, ms_level)

        if len(mz_array) == 0:
            return []

        # Filter by m/z range if specified
        if mz_min is not None or mz_max is not None:
            mask = np.ones(len(mz_array), dtype=bool)
            if mz_min is not None:
                mask &= mz_array >= mz_min
            if mz_max is not None:
                mask &= mz_array <= mz_max
            mz_array = mz_array[mask]
            intensity_array = intensity_array[mask]

        if len(mz_array) == 0:
            return []

        # Check for Thermo noise data (sampled, needs interpolation)
        has_noise_data = metadata.get("has_noise_data", False)
        noise_mz = metadata.get("noise_mz_array", None)
        noise_intensity = metadata.get("noise_intensity_array", None)

        # Get indices of top peaks by intensity
        sorted_indices = np.argsort(intensity_array)[::-1][:count]

        peaks = []
        for idx in sorted_indices:
            mz = float(mz_array[idx])
            signal = float(intensity_array[idx])

            # Use Thermo noise (interpolated)
            if has_noise_data and noise_mz is not None and noise_intensity is not None:
                noise = interpolate_noise(mz, noise_mz, noise_intensity)
            else:
                noise = 0.0  # No noise data available

            snr = signal / noise if noise > 0 else 0.0

            peaks.append({
                "mz": mz,
                "intensity": signal,
                "noise": noise,
                "snr": snr,
            })

        return peaks

    def get_xic_ppm(
        self,
        target_mz: float,
        ppm_tolerance: float = 5.0,
    ) -> tuple[np.ndarray, np.ndarray]:
        """
        Get Extracted Ion Chromatogram using ppm tolerance.

        Args:
            target_mz: Target m/z value
            ppm_tolerance: Tolerance in ppm (default ±5 ppm)

        Returns:
            Tuple of (times, intensities) arrays
        """
        tolerance_da = ppm_to_da(target_mz, ppm_tolerance)
        return self.get_xic(target_mz, tolerance_da)

    def find_peak_apex(
        self,
        times: np.ndarray,
        intensities: np.ndarray,
        target_rt: float,
        rt_window: Optional[float] = None,
    ) -> dict:
        """
        Find the peak apex in XIC data closest to target RT.

        Args:
            times: Array of retention times
            intensities: Array of intensities
            target_rt: Approximate retention time to search near
            rt_window: Optional window around target_rt to search (minutes).
                       If None, searches the entire chromatogram.

        Returns:
            Dictionary with apex_rt, apex_intensity, apex_index
        """
        if len(times) == 0:
            return {
                "apex_rt": target_rt,
                "apex_intensity": 0.0,
                "apex_index": -1,
            }

        # If rt_window specified, limit search to that region
        if rt_window is not None:
            rt_min = target_rt - rt_window
            rt_max = target_rt + rt_window
            mask = (times >= rt_min) & (times <= rt_max)
            search_times = times[mask]
            search_intensities = intensities[mask]
            original_indices = np.where(mask)[0]
        else:
            search_times = times
            search_intensities = intensities
            original_indices = np.arange(len(times))

        if len(search_times) == 0:
            return {
                "apex_rt": target_rt,
                "apex_intensity": 0.0,
                "apex_index": -1,
            }

        # Find local maxima (peaks)
        peaks_indices = []
        for i in range(1, len(search_intensities) - 1):
            if (search_intensities[i] > search_intensities[i - 1] and
                search_intensities[i] > search_intensities[i + 1]):
                peaks_indices.append(i)

        # If no local maxima found, use the global maximum
        if not peaks_indices:
            max_idx = np.argmax(search_intensities)
            peaks_indices = [max_idx]

        # Find the peak closest to target_rt
        best_peak_idx = peaks_indices[0]
        best_rt_diff = abs(search_times[best_peak_idx] - target_rt)

        for peak_idx in peaks_indices[1:]:
            rt_diff = abs(search_times[peak_idx] - target_rt)
            if rt_diff < best_rt_diff:
                best_rt_diff = rt_diff
                best_peak_idx = peak_idx

        return {
            "apex_rt": float(search_times[best_peak_idx]),
            "apex_intensity": float(search_intensities[best_peak_idx]),
            "apex_index": int(original_indices[best_peak_idx]),
        }

    def get_precursor_snr(
        self,
        target_mz: float,
        target_rt: float,
        ppm_tolerance: float = 5.0,
        rt_window: Optional[float] = None,
    ) -> dict:
        """
        Calculate Signal-to-Noise Ratio for a precursor from Orbitrap data.

        This method implements the full workflow:
        1. Extract XIC using target m/z with ±ppm tolerance
        2. Detect the peak closest to the target RT
        3. Get the MS1 spectrum at the peak apex
        4. Calculate S/N for the precursor in that spectrum

        Args:
            target_mz: Target m/z value of the precursor
            target_rt: Approximate retention time (minutes)
            ppm_tolerance: Mass tolerance in ppm (default ±5 ppm)
            rt_window: Optional RT window to search for peaks (minutes).
                       If None, searches entire chromatogram.

        Returns:
            Dictionary containing:
            - snr: Signal-to-Noise Ratio
            - signal: Signal intensity at apex
            - noise: Estimated noise level
            - target_mz: Input target m/z
            - actual_mz: Actual m/z found in spectrum (within tolerance)
            - target_rt: Input target RT
            - apex_rt: Exact RT of peak apex
            - apex_intensity: XIC intensity at apex
            - mz_tolerance_da: Tolerance used in Daltons
            - ppm_tolerance: Tolerance used in ppm
            - spectrum_metadata: Metadata of the MS1 spectrum used
        """
        # Step 1: Extract XIC with ppm tolerance
        xic_times, xic_intensities = self.get_xic_ppm(target_mz, ppm_tolerance)

        if len(xic_times) == 0:
            return {
                "snr": 0.0,
                "signal": 0.0,
                "noise": 0.0,
                "target_mz": target_mz,
                "actual_mz": target_mz,
                "target_rt": target_rt,
                "apex_rt": target_rt,
                "apex_intensity": 0.0,
                "mz_tolerance_da": ppm_to_da(target_mz, ppm_tolerance),
                "ppm_tolerance": ppm_tolerance,
                "spectrum_metadata": None,
            }

        # Step 2: Find the peak apex closest to target RT
        apex_info = self.find_peak_apex(xic_times, xic_intensities, target_rt, rt_window)
        apex_rt = apex_info["apex_rt"]

        # Step 3: Get MS1 spectrum at apex
        mz_array, intensity_array, metadata = self.get_spectrum_by_rt(apex_rt, ms_level=1)

        if len(mz_array) == 0:
            return {
                "snr": 0.0,
                "signal": 0.0,
                "noise": 0.0,
                "target_mz": target_mz,
                "actual_mz": target_mz,
                "target_rt": target_rt,
                "apex_rt": apex_rt,
                "apex_intensity": apex_info["apex_intensity"],
                "mz_tolerance_da": ppm_to_da(target_mz, ppm_tolerance),
                "ppm_tolerance": ppm_tolerance,
                "spectrum_metadata": metadata,
            }

        # Step 4: Find signal at target m/z within tolerance
        tolerance_da = ppm_to_da(target_mz, ppm_tolerance)
        mz_diffs = np.abs(mz_array - target_mz)
        closest_idx = np.argmin(mz_diffs)

        if mz_diffs[closest_idx] <= tolerance_da:
            signal = float(intensity_array[closest_idx])
            actual_mz = float(mz_array[closest_idx])
        else:
            signal = 0.0
            actual_mz = target_mz

        # Step 5: Calculate SNR using Thermo noise data (interpolated)
        if metadata.get("has_noise_data"):
            noise_mz = metadata.get("noise_mz_array")
            noise_intensity = metadata.get("noise_intensity_array")
            noise = interpolate_noise(actual_mz, noise_mz, noise_intensity)
        else:
            # No noise data - file needs reconversion with -N flag
            noise = 0.0

        snr = signal / noise if noise > 0 else 0.0

        return {
            "snr": snr,
            "signal": signal,
            "noise": noise,
            "target_mz": target_mz,
            "actual_mz": actual_mz,
            "target_rt": target_rt,
            "apex_rt": apex_rt,
            "apex_intensity": apex_info["apex_intensity"],
            "mz_tolerance_da": tolerance_da,
            "ppm_tolerance": ppm_tolerance,
            "spectrum_metadata": metadata,
        }
