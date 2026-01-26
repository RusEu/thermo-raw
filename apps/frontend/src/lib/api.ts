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

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`)
  if (!res.ok) {
    throw new Error(`API error: ${res.status}`)
  }
  return res.json()
}

export const api = {
  getFiles: () => fetchJson<FileInfo[]>('/api/files'),

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

  getPrecursorSnr: (fileId: string, mz: number, rt: number, ppm: number = 5, rtWindow?: number) => {
    const params = new URLSearchParams({
      mz: mz.toString(),
      rt: rt.toString(),
      ppm: ppm.toString(),
    })
    if (rtWindow !== undefined) params.set('rt_window', rtWindow.toString())
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
    }>(`/api/files/${fileId}/precursor-snr?${params}`)
  },

  calculateBulkSnr: async (
    fileId: string,
    compounds: Array<{ name: string; mz: number; rt: number }>,
    ppm: number = 5,
    rtWindow: number = 2
  ) => {
    const res = await fetch(`${API_URL}/api/files/${fileId}/bulk-snr`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ compounds, ppm, rt_window: rtWindow }),
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
      }>
      file_id: string
      ppm: number
      rt_window: number
    }>
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
