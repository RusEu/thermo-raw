// Use relative URLs by default (works when frontend/backend served from same origin)
// Set VITE_API_URL for development with separate frontend/backend servers
const API_URL = import.meta.env.VITE_API_URL || ''

export interface FileInfo {
  id: string
  name: string
  size_mb: number
}

export interface UploadResponse {
  id: string
  name: string
  size_mb: number
  converted_from?: string
}

export interface FileStats {
  filename: string
  total_scans: number
  ms1_scans: number
  ms2_scans: number
  rt_min: number
  rt_max: number
  mz_min: number
  mz_max: number
  max_tic: number
  mean_tic: number
  polarity: string
}

export interface VersionInfo {
  version: string
  platform: string
  architecture: string
}

export interface UpdateInfo {
  current_version: string
  latest_version: string
  update_available: boolean
  download_url: string | null
  release_url: string | null
  release_notes: string | null
  platform: string
  architecture: string
}

export interface TrailerScan {
  scan: number
  rt_min: number
  ms_level: number
  filter: string
  ion_injection_time_ms: number | null
  multiple_injection: string | null
  // One group of per-window injection times (ms) per sub-injection
  multi_inject_it_ms: number[][]
  // Per sub-injection: list of [low, high] m/z windows
  multi_inject_windows_mz: number[][][]
  stitched_windows_mz: number[][][]
}

export interface TrailerSummary {
  scans_with_multi_inject: number
  scans_with_inject_windows: number
  scans_with_stitched_windows: number
  injection_modes: Record<string, number>
}

export interface TrailerData {
  file: string
  num_scans: number
  summary: TrailerSummary
  total_filtered: number
  offset: number
  limit: number
  scans: TrailerScan[]
}

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`)
  if (!res.ok) {
    // Try to extract error detail from response
    try {
      const error = await res.json()
      throw new Error(error.detail || `API error: ${res.status}`)
    } catch (e) {
      if (e instanceof Error && e.message !== `API error: ${res.status}`) {
        throw e
      }
      throw new Error(`API error: ${res.status}`)
    }
  }
  return res.json()
}

// Full-scan datapoint counting: absolute start/end (minutes) take priority,
// otherwise a range in seconds centered on the compound RT.
export interface DatapointParams {
  dp_range_seconds?: number
  dp_start?: number
  dp_end?: number
}

function appendDpParams(params: URLSearchParams, dp?: DatapointParams) {
  if (!dp) return
  if (dp.dp_start !== undefined && dp.dp_end !== undefined) {
    params.set('dp_start', String(dp.dp_start))
    params.set('dp_end', String(dp.dp_end))
  } else if (dp.dp_range_seconds !== undefined) {
    params.set('dp_range_seconds', String(dp.dp_range_seconds))
  }
}

export const api = {
  getFiles: () => fetchJson<FileInfo[]>('/api/files'),

  getTrailerAvailable: (fileId: string) =>
    fetchJson<{ available: boolean; raw_name: string | null }>(
      `/api/trailer/${fileId}/available`
    ),

  getTrailer: (
    fileId: string,
    opts: { onlyWindows?: boolean; onlyMultiInject?: boolean; limit?: number; offset?: number } = {}
  ) => {
    const p = new URLSearchParams({
      only_windows: String(opts.onlyWindows ?? false),
      only_multi_inject: String(opts.onlyMultiInject ?? true),
      limit: String(opts.limit ?? 5000),
      offset: String(opts.offset ?? 0),
    })
    return fetchJson<TrailerData>(`/api/trailer/${fileId}?${p}`)
  },

  // Trailer Extra for the scan nearest a retention time (e.g. a precursor apex)
  getTrailerAtRt: (fileId: string, rt: number, msLevel?: number) => {
    const p = new URLSearchParams({ rt: String(rt) })
    if (msLevel !== undefined) p.set('ms_level', String(msLevel))
    return fetchJson<TrailerScan>(`/api/trailer/${fileId}/at-rt?${p}`)
  },

  // Batch version for bulk analysis: one scan per RT, aligned to input order
  getTrailerAtRts: async (fileId: string, rts: number[], msLevel?: number) => {
    const res = await fetch(`${API_URL}/api/trailer/${encodeURIComponent(fileId)}/at-rts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rts, ms_level: msLevel ?? null }),
    })
    if (!res.ok) throw new Error(`API error: ${res.status}`)
    return res.json() as Promise<{ scans: (TrailerScan | null)[] }>
  },

  trailerExportUrl: (
    fileId: string,
    format: 'csv' | 'xlsx',
    opts: { onlyWindows?: boolean; onlyMultiInject?: boolean } = {}
  ) =>
    `${API_URL}/api/trailer/${encodeURIComponent(fileId)}/export?format=${format}` +
    `&only_windows=${opts.onlyWindows ?? false}` +
    `&only_multi_inject=${opts.onlyMultiInject ?? true}`,

  downloadTrailerExport: async (
    fileId: string,
    format: 'csv' | 'xlsx',
    opts: { onlyWindows?: boolean; onlyMultiInject?: boolean } = {}
  ) => {
    const url =
      `${API_URL}/api/trailer/${encodeURIComponent(fileId)}/export?format=${format}` +
      `&only_windows=${opts.onlyWindows ?? false}` +
      `&only_multi_inject=${opts.onlyMultiInject ?? true}`
    const res = await fetch(url)
    if (!res.ok) throw new Error(`API error: ${res.status}`)
    const blob = await res.blob()
    const filename = `${fileId.replace(/\.mzML$/i, '')}_trailer.${format}`
    const objUrl = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = objUrl
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    window.URL.revokeObjectURL(objUrl)
  },

  getVersion: () => fetchJson<VersionInfo>('/api/version'),

  checkForUpdates: () => fetchJson<UpdateInfo>('/api/updates/check'),

  getFileStats: (fileId: string) => fetchJson<FileStats>(`/api/files/${fileId}/stats`),

  getTic: (fileId: string) => fetchJson<{ times: number[]; intensities: number[] }>(`/api/files/${fileId}/tic`),

  getBpc: (fileId: string) => fetchJson<{ times: number[]; intensities: number[] }>(`/api/files/${fileId}/bpc`),

  getXic: (fileId: string, mz: number, tolerance: number) =>
    fetchJson<{ times: number[]; intensities: number[] }>(`/api/files/${fileId}/xic?mz=${mz}&tolerance=${tolerance}`),

  getSpectrum: (fileId: string, rt: number, msLevel?: number) => {
    const params = new URLSearchParams({ rt: rt.toString() })
    if (msLevel) params.set('ms_level', msLevel.toString())
    return fetchJson<{ mz: number[]; intensity: number[]; metadata: Record<string, unknown> }>(
      `/api/files/${fileId}/spectrum?${params}`
    )
  },

  getHeatmap: (fileId: string, rtBins = 200, mzBins = 200) =>
    fetchJson<{
      intensity: number[][]
      rt_min: number
      rt_max: number
      mz_min: number
      mz_max: number
    }>(`/api/files/${fileId}/heatmap?rt_bins=${rtBins}&mz_bins=${mzBins}`),

  getSnr: (fileId: string, mz: number, rt: number) =>
    fetchJson<{
      signal: number
      noise: number
      snr: number
      target_mz: number
      actual_mz: number
      rt: number
    }>(`/api/files/${fileId}/snr?mz=${mz}&rt=${rt}`),

  getTopPeaks: (fileId: string, rt: number, count: number = 10, mzMin?: number, mzMax?: number) => {
    const params = new URLSearchParams({
      rt: rt.toString(),
      count: count.toString(),
    })
    if (mzMin !== undefined) params.set('mz_min', mzMin.toString())
    if (mzMax !== undefined) params.set('mz_max', mzMax.toString())
    return fetchJson<Array<{
      mz: number
      intensity: number
      noise: number
      snr: number
    }>>(`/api/files/${fileId}/top-peaks?${params}`)
  },

  getPrecursorSnr: (
    fileId: string,
    mz: number,
    rt: number,
    ppm: number = 5,
    rtWindow?: number,
    dp?: DatapointParams
  ) => {
    const params = new URLSearchParams({
      mz: mz.toString(),
      rt: rt.toString(),
      ppm: ppm.toString(),
    })
    if (rtWindow !== undefined) params.set('rt_window', rtWindow.toString())
    appendDpParams(params, dp)
    return fetchJson<{
      snr: number
      signal: number
      noise: number
      target_mz: number
      actual_mz: number
      target_rt: number
      apex_rt: number
      apex_intensity: number
      mz_tolerance_da: number
      ppm_tolerance: number
      spectrum_metadata: Record<string, unknown> | null
      datapoint_count?: number
      dp_rt_start?: number
      dp_rt_end?: number
    }>(`/api/files/${fileId}/precursor-snr?${params}`)
  },

  calculateBulkSnr: async (
    fileId: string,
    compounds: Array<{ name: string; mz: number; rt: number } & Partial<DatapointParams>>,
    ppm: number = 5,
    rtWindow: number = 2,
    dp?: DatapointParams
  ) => {
    const res = await fetch(`${API_URL}/api/files/${fileId}/bulk-snr`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ compounds, ppm, rt_window: rtWindow, ...(dp ?? {}) }),
    })
    if (!res.ok) throw new Error(`API error: ${res.status}`)
    return res.json() as Promise<{
      results: Array<{
        name: string
        mz: number
        rt: number
        snr: number
        signal: number
        noise: number
        apex_rt: number
        actual_mz: number
        datapoint_count?: number | null
        dp_rt_start?: number | null
        dp_rt_end?: number | null
      }>
      file_id: string
      ppm: number
      rt_window: number
    }>
  },

  exportBulkSnrCsv: async (
    fileId: string,
    compounds: Array<{ name: string; mz: number; rt: number } & Partial<DatapointParams>>,
    ppm: number = 5,
    rtWindow: number = 2,
    dp?: DatapointParams
  ) => {
    const res = await fetch(`${API_URL}/api/files/${fileId}/bulk-snr/csv`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ compounds, ppm, rt_window: rtWindow, ...(dp ?? {}) }),
    })
    if (!res.ok) throw new Error(`API error: ${res.status}`)

    const filename = `snr_results_${fileId.replace('.mzML', '')}.csv`
    const csvContent = await res.text()

    // Check if running in pywebview (native app) with save_file API
    const pywebview = (window as unknown as { pywebview?: { api?: { save_file?: (content: string, filename: string) => Promise<{ success: boolean; error?: string }> } } }).pywebview
    if (pywebview?.api?.save_file) {
      // Use native Save As dialog
      const result = await pywebview.api.save_file(csvContent, filename)
      if (!result.success && result.error !== 'Save cancelled') {
        throw new Error(result.error || 'Failed to save file')
      }
    } else {
      // Fallback: browser blob download
      const blob = new Blob([csvContent], { type: 'text/csv' })
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)
    }
  },

  // Bokeh plot endpoints
  getPlotTic: (fileId: string, theme: 'light' | 'dark' = 'light') =>
    fetchJson(`/api/plots/${fileId}/tic?theme=${theme}`),
  getPlotBpc: (fileId: string, theme: 'light' | 'dark' = 'light') =>
    fetchJson(`/api/plots/${fileId}/bpc?theme=${theme}`),
  getPlotSpectrum: (fileId: string, rt: number, theme: 'light' | 'dark' = 'light') =>
    fetchJson(`/api/plots/${fileId}/spectrum?rt=${rt}&theme=${theme}`),
  getPlotHeatmap: (
    fileId: string,
    rtBins = 200,
    mzBins = 200,
    theme: 'light' | 'dark' = 'light',
    intensityMin?: number,
    intensityMax?: number
  ) => {
    const params = new URLSearchParams({
      rt_bins: rtBins.toString(),
      mz_bins: mzBins.toString(),
      theme,
    })
    if (intensityMin !== undefined) params.set('intensity_min', intensityMin.toString())
    if (intensityMax !== undefined) params.set('intensity_max', intensityMax.toString())
    return fetchJson(`/api/plots/${fileId}/heatmap?${params}`)
  },

  getPlotChromatogramInteractive: (
    fileId: string,
    chromType: 'tic' | 'bpc' = 'tic',
    selectedRt?: number,
    theme: 'light' | 'dark' = 'light'
  ) => {
    const params = new URLSearchParams({ chrom_type: chromType, theme })
    if (selectedRt !== undefined) params.set('selected_rt', selectedRt.toString())
    return fetchJson(`/api/plots/${fileId}/chromatogram-interactive?${params}`)
  },

  uploadFile: async (
    file: File,
    onProgress?: (progress: number) => void
  ): Promise<UploadResponse> => {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      const formData = new FormData()
      formData.append('file', file)

      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable && onProgress) {
          onProgress(Math.round((e.loaded / e.total) * 100))
        }
      })

      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(JSON.parse(xhr.responseText))
        } else {
          try {
            const error = JSON.parse(xhr.responseText)
            reject(new Error(error.detail || `Upload failed: ${xhr.status}`))
          } catch {
            reject(new Error(`Upload failed: ${xhr.status}`))
          }
        }
      })

      xhr.addEventListener('error', () => {
        reject(new Error('Network error during upload'))
      })

      xhr.open('POST', `${API_URL}/api/files/upload`)
      xhr.send(formData)
    })
  },
}
