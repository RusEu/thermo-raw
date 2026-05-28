import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useTheme } from '@/lib/theme'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Slider } from '@/components/ui/slider'
import { BokehPlot } from '@/components/BokehPlot'
import { Loader, PlotLoader } from '@/components/Loader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Search, Zap, Upload, Download, FileSpreadsheet, Play, X, Loader2 } from 'lucide-react'
import { TrailerExtraCard, ItGroups, WindowGroups } from '@/components/TrailerExtra'
import { DatapointControls, DpConfig, defaultDpConfig, dpToParams } from '@/components/DatapointControls'
import { RangeExtractTab } from '@/pages/RangeExtractTab'

interface AnalysisPageProps {
  fileId: string
}

// Types for bulk analysis
interface CompoundInput {
  name: string
  mz: number
  rt: number
  // Optional per-compound datapoint window (overrides the global default)
  dp_range_seconds?: number
  dp_start?: number
  dp_end?: number
}

interface CompoundResult {
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
}

export function AnalysisPage({ fileId }: AnalysisPageProps) {
  const { theme } = useTheme()
  const [activeTab, setActiveTab] = useState<'precursor-snr' | 'bulk-snr' | 'range-extract'>('precursor-snr')

  // Precursor SNR state
  const [targetMz, setTargetMz] = useState('')
  const [targetRt, setTargetRt] = useState('')
  const [ppmTolerance, setPpmTolerance] = useState(5)
  const [rtWindow, setRtWindow] = useState(2)

  // Full-scan datapoint counting window (shared by both tabs)
  const [dp, setDp] = useState<DpConfig>(defaultDpConfig)

  // Bulk SNR state
  const [bulkCompounds, setBulkCompounds] = useState<CompoundInput[]>([])
  const [bulkResults, setBulkResults] = useState<CompoundResult[] | null>(null)
  const [bulkPpm, setBulkPpm] = useState(5)
  const [bulkRtWindow, setBulkRtWindow] = useState(2)
  const [pasteText, setPasteText] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['stats', fileId],
    queryFn: () => api.getFileStats(fileId),
  })

  // Mutation for calculating precursor SNR
  const snrMutation = useMutation({
    mutationFn: ({ mz, rt, ppm, rtWin }: { mz: number; rt: number; ppm: number; rtWin: number }) =>
      api.getPrecursorSnr(fileId, mz, rt, ppm, rtWin, dpToParams(dp)),
  })

  // Mutation for bulk SNR calculation
  const bulkSnrMutation = useMutation({
    mutationFn: () => api.calculateBulkSnr(fileId, bulkCompounds, bulkPpm, bulkRtWindow, dpToParams(dp)),
    onSuccess: (data) => {
      setBulkResults(data.results)
    },
  })

  // Trailer Extra (.raw) availability for this dataset
  const { data: trailerAvail } = useQuery({
    queryKey: ['trailer-available', fileId],
    queryFn: () => api.getTrailerAvailable(fileId),
  })

  // Per-compound Trailer Extra at each bulk result's apex (MS1) scan
  const bulkApexRts = bulkResults?.map((r) => r.apex_rt) ?? []
  const { data: bulkTrailer } = useQuery({
    queryKey: ['bulk-trailer', fileId, bulkApexRts],
    queryFn: () => api.getTrailerAtRts(fileId, bulkApexRts, 1),
    enabled:
      !!bulkResults && bulkResults.length > 0 && trailerAvail?.available === true,
  })

  const showDp = (bulkResults ?? []).some((r) => r.datapoint_count != null)

  // Query for XIC plot (only after calculation)
  const { data: xicData } = useQuery({
    queryKey: ['xic', fileId, snrMutation.data?.target_mz, ppmTolerance],
    queryFn: () => {
      const mz = snrMutation.data!.target_mz
      const toleranceDa = mz * ppmTolerance / 1e6
      return api.getXic(fileId, mz, toleranceDa)
    },
    enabled: !!snrMutation.data && activeTab === 'precursor-snr',
  })

  // Query for spectrum at apex
  const { data: spectrumPlot, isLoading: spectrumLoading } = useQuery({
    queryKey: ['plot-spectrum', fileId, snrMutation.data?.apex_rt, theme],
    queryFn: () => api.getPlotSpectrum(fileId, snrMutation.data!.apex_rt, theme),
    enabled: !!snrMutation.data && snrMutation.data.apex_rt > 0 && activeTab === 'precursor-snr',
  })

  // Initialize RT with middle value
  useEffect(() => {
    if (stats && !targetRt) {
      const midRt = ((stats.rt_min + stats.rt_max) / 2).toFixed(2)
      setTargetRt(midRt)
    }
  }, [stats, targetRt])

  const handleCalculate = () => {
    const mzValue = parseFloat(targetMz)
    const rtValue = parseFloat(targetRt)
    if (!isNaN(mzValue) && !isNaN(rtValue)) {
      snrMutation.mutate({ mz: mzValue, rt: rtValue, ppm: ppmTolerance, rtWin: rtWindow })
    }
  }

  // Parse CSV/TSV text into compounds. Header-aware: required name,mz,rt and
  // optional per-compound datapoint window columns (range_s, or start/end).
  const parseCsvText = (text: string): CompoundInput[] => {
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
    if (lines.length === 0) return []

    const split = (l: string) => l.split(/[,\t]/).map((p) => p.trim())
    const headerCols = split(lines[0]).map((c) => c.toLowerCase())
    const headerKeys = ['name', 'compound', 'mz', 'm/z', 'rt', 'range_s', 'range_seconds', 'range', 'start', 'end']
    const hasHeader = headerCols.some((c) => headerKeys.includes(c))

    const find = (...names: string[]) => headerCols.findIndex((c) => names.includes(c))
    const col = {
      name: hasHeader && find('name', 'compound') >= 0 ? find('name', 'compound') : 0,
      mz: hasHeader && find('mz', 'm/z') >= 0 ? find('mz', 'm/z') : 1,
      rt: hasHeader && find('rt', 'retention', 'rt_min') >= 0 ? find('rt', 'retention', 'rt_min') : 2,
      range: hasHeader ? find('range_s', 'range_seconds', 'range') : -1,
      start: hasHeader ? find('start', 'start_min') : -1,
      end: hasHeader ? find('end', 'end_min') : -1,
    }

    const num = (v: string | undefined) => (v !== undefined && v !== '' ? parseFloat(v) : NaN)
    const compounds: CompoundInput[] = []
    for (let i = hasHeader ? 1 : 0; i < lines.length; i++) {
      const parts = split(lines[i])
      const mz = num(parts[col.mz])
      const rt = num(parts[col.rt])
      if (isNaN(mz) || isNaN(rt)) continue
      const c: CompoundInput = { name: parts[col.name] ?? `Compound ${i}`, mz, rt }
      const s = num(parts[col.start])
      const e = num(parts[col.end])
      const r = num(parts[col.range])
      if (col.start >= 0 && col.end >= 0 && !isNaN(s) && !isNaN(e)) {
        c.dp_start = s
        c.dp_end = e
      } else if (col.range >= 0 && !isNaN(r)) {
        c.dp_range_seconds = r
      }
      compounds.push(c)
    }
    return compounds
  }

  // Bulk analysis handlers
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (event) => {
      const text = event.target?.result as string
      const compounds = parseCsvText(text)
      setBulkCompounds(compounds)
      setBulkResults(null)
      setPasteText('')
    }
    reader.readAsText(file)

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handlePasteCsv = () => {
    const compounds = parseCsvText(pasteText)
    if (compounds.length > 0) {
      setBulkCompounds(compounds)
      setBulkResults(null)
      setPasteText('')
    }
  }

  const [isExporting, setIsExporting] = useState(false)

  const handleExportCsv = async () => {
    if (!bulkCompounds.length) return

    setIsExporting(true)
    try {
      await api.exportBulkSnrCsv(fileId, bulkCompounds, bulkPpm, bulkRtWindow, dpToParams(dp))
    } catch (error) {
      console.error('Export failed:', error)
    } finally {
      setIsExporting(false)
    }
  }

  const handleClearCompounds = () => {
    setBulkCompounds([])
    setBulkResults(null)
  }

  const handleRunBulkAnalysis = () => {
    if (bulkCompounds.length > 0) {
      bulkSnrMutation.mutate()
    }
  }

  if (statsLoading || !stats) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader text="Loading file data..." size="lg" />
      </div>
    )
  }

  // Precursor S/N filters
  const precursorFilters = (
    <Card className="px-4 py-3">
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">m/z:</span>
          <Input
            type="number"
            placeholder="162.9689"
            value={targetMz}
            onChange={(e) => setTargetMz(e.target.value)}
            step="0.0001"
            className="h-7 w-28 text-xs"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">RT:</span>
          <Input
            type="number"
            placeholder="5.0"
            value={targetRt}
            onChange={(e) => setTargetRt(e.target.value)}
            step="0.01"
            className="h-7 w-20 text-xs"
          />
          <span className="text-[10px] text-muted-foreground">min</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Tol:</span>
          <div className="w-16">
            <Slider
              value={[ppmTolerance]}
              min={1}
              max={20}
              step={1}
              onValueChange={([value]) => setPpmTolerance(value)}
            />
          </div>
          <span className="text-xs font-mono w-12">{ppmTolerance} ppm</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">RT Win:</span>
          <div className="w-16">
            <Slider
              value={[rtWindow]}
              min={0.1}
              max={5}
              step={0.1}
              onValueChange={([value]) => setRtWindow(value)}
            />
          </div>
          <span className="text-xs font-mono w-12">±{rtWindow.toFixed(1)}</span>
        </div>
        <DatapointControls value={dp} onChange={setDp} />
        <Button
          size="sm"
          className="h-7"
          onClick={handleCalculate}
          disabled={!targetMz || !targetRt || snrMutation.isPending}
        >
          {snrMutation.isPending ? (
            <Search className="h-3 w-3 animate-spin" />
          ) : (
            <>
              <Zap className="h-3 w-3 mr-1" />
              Calculate
            </>
          )}
        </Button>
      </div>
    </Card>
  )

  return (
    <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'precursor-snr' | 'bulk-snr' | 'range-extract')}>
      <TabsList className="w-full justify-start mb-4">
        <TabsTrigger value="precursor-snr">Precursor S/N</TabsTrigger>
        <TabsTrigger value="bulk-snr">Bulk S/N</TabsTrigger>
        <TabsTrigger value="range-extract">Range Extract</TabsTrigger>
      </TabsList>

      {/* Filters bar */}
      {activeTab === 'precursor-snr' && (
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Precursor S/N Analysis</h2>
          {precursorFilters}
        </div>
      )}

      <TabsContent value="precursor-snr" className="mt-0">
        <div className="space-y-6">
          {/* Results Summary */}
          {snrMutation.data && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card className="border-green-500/50 bg-green-500/5">
                <CardContent className="pt-4">
                  <div className="text-xs text-muted-foreground uppercase tracking-wide">Signal/Noise</div>
                  <div className="text-3xl font-bold text-green-500">
                    {snrMutation.data.snr.toFixed(1)}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-4">
                  <div className="text-xs text-muted-foreground uppercase tracking-wide">Signal</div>
                  <div className="text-2xl font-semibold text-foreground">
                    {snrMutation.data.signal.toExponential(2)}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-4">
                  <div className="text-xs text-muted-foreground uppercase tracking-wide">Noise</div>
                  <div className="text-2xl font-semibold text-foreground">
                    {snrMutation.data.noise.toFixed(1)}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-4">
                  <div className="text-xs text-muted-foreground uppercase tracking-wide">Apex RT</div>
                  <div className="text-2xl font-semibold text-blue-500">
                    {snrMutation.data.apex_rt.toFixed(3)} min
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Detailed Results */}
          {snrMutation.data && (
            <Card>
              <CardHeader>
                <CardTitle>Precursor Details</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                  <div>
                    <div className="text-xs text-muted-foreground">Target m/z</div>
                    <div className="font-mono text-sm">{snrMutation.data.target_mz.toFixed(4)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Actual m/z</div>
                    <div className="font-mono text-sm">{snrMutation.data.actual_mz.toFixed(4)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">m/z Error</div>
                    <div className="font-mono text-sm">
                      {((snrMutation.data.actual_mz - snrMutation.data.target_mz) / snrMutation.data.target_mz * 1e6).toFixed(2)} ppm
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Tolerance Used</div>
                    <div className="font-mono text-sm">{snrMutation.data.mz_tolerance_da.toFixed(6)} Da</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Target RT</div>
                    <div className="font-mono text-sm">{snrMutation.data.target_rt.toFixed(2)} min</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Apex RT</div>
                    <div className="font-mono text-sm">{snrMutation.data.apex_rt.toFixed(3)} min</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">RT Shift</div>
                    <div className="font-mono text-sm">
                      {(snrMutation.data.apex_rt - snrMutation.data.target_rt).toFixed(3)} min
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Apex Intensity (XIC)</div>
                    <div className="font-mono text-sm">{snrMutation.data.apex_intensity.toExponential(2)}</div>
                  </div>
                  {snrMutation.data.datapoint_count !== undefined && (
                    <div>
                      <div className="text-xs text-muted-foreground">Datapoints full scan</div>
                      <div className="font-mono text-sm">
                        {snrMutation.data.datapoint_count}
                        <span className="ml-1 text-xs text-muted-foreground">
                          ({snrMutation.data.dp_rt_start}–{snrMutation.data.dp_rt_end} min)
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* XIC Visualization */}
          {xicData && snrMutation.data && (
            <Card>
              <CardHeader>
                <CardTitle>
                  Extracted Ion Chromatogram (XIC)
                  <span className="text-sm font-normal text-muted-foreground ml-2">
                    m/z {snrMutation.data.target_mz.toFixed(4)} ± {ppmTolerance} ppm
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64 relative">
                  <XICPlot
                    times={xicData.times}
                    intensities={xicData.intensities}
                    apexRt={snrMutation.data.apex_rt}
                    targetRt={snrMutation.data.target_rt}
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {/* Spectrum at Apex */}
          {snrMutation.data && snrMutation.data.apex_rt > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>
                  MS1 Spectrum at Apex
                  <span className="text-sm font-normal text-muted-foreground ml-2">
                    RT = {snrMutation.data.apex_rt.toFixed(3)} min
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {spectrumLoading ? (
                  <PlotLoader className="h-80" text="Loading spectrum..." />
                ) : spectrumPlot ? (
                  <BokehPlot plotData={spectrumPlot} />
                ) : null}
              </CardContent>
            </Card>
          )}

          {/* Trailer Extra at the apex scan (read from .raw) */}
          {snrMutation.data && snrMutation.data.apex_rt > 0 && (
            <TrailerExtraCard
              fileId={fileId}
              rt={snrMutation.data.apex_rt}
              msLevel={1}
            />
          )}

          {/* Initial state */}
          {!snrMutation.data && !snrMutation.isPending && (
            <Card>
              <CardContent className="py-20">
                <div className="text-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted mx-auto">
                    <Zap className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <h3 className="mt-4 text-lg font-medium text-foreground">Calculate Precursor S/N</h3>
                  <p className="mt-2 text-sm text-muted-foreground max-w-md mx-auto">
                    Enter the target m/z and approximate retention time to calculate the signal-to-noise ratio.
                    The algorithm will find the peak apex in the XIC and calculate S/N from the MS1 spectrum.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Error state */}
          {snrMutation.isError && (
            <Card className="border-red-500/50">
              <CardContent className="py-6">
                <div className="text-center text-red-500">
                  <p className="font-medium">Failed to calculate SNR</p>
                  <p className="text-sm mt-1 text-red-400">
                    {snrMutation.error instanceof Error ? snrMutation.error.message : 'Please check your parameters.'}
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </TabsContent>

      <TabsContent value="bulk-snr" className="mt-0">
        <div className="space-y-4">
          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={handleFileUpload}
            className="hidden"
          />

          {/* Input Area - Show when no compounds loaded */}
          {bulkCompounds.length === 0 && !bulkResults && (
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base">Bulk S/N Analysis</CardTitle>
                    <p className="text-xs text-muted-foreground mt-1">
                      Calculate Signal-to-Noise ratios for multiple compounds at once.
                      Paste your compound list below or upload a CSV file.
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    className="text-xs"
                  >
                    <Upload className="h-3 w-3 mr-1" />
                    Upload CSV
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="pt-2">
                <div className="space-y-3">
                  <textarea
                    value={pasteText}
                    onChange={(e) => setPasteText(e.target.value)}
                    placeholder="name, mz, rt, range_s&#10;Caffeine, 195.0877, 4.2, 30&#10;Glucose, 203.0532, 1.5, 20&#10;Aspirin, 179.0344, 6.8, 45&#10;&#10;# o con start/end por compuesto:&#10;name, mz, rt, start, end&#10;Caffeine, 195.0877, 4.2, 4.0, 4.4"
                    className="w-full h-48 p-3 rounded-lg border border-border bg-background font-mono text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                      {pasteText.split('\n').filter(l => l.trim()).length > 0
                        ? `${pasteText.split('\n').filter(l => l.trim()).length} líneas · separado por coma o tab`
                        : 'name, mz, rt — opcional por compuesto: range_s (segundos) o start,end (minutos). Requiere fila de cabecera.'}
                    </span>
                    <Button
                      onClick={handlePasteCsv}
                      disabled={!pasteText.trim()}
                    >
                      <Play className="h-4 w-4 mr-2" />
                      Load Compounds
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Controls - Show when compounds are loaded */}
          {bulkCompounds.length > 0 && (
            <Card>
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <span className="text-sm font-medium">
                      {bulkCompounds.length} compounds
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleClearCompounds}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-4 w-4 mr-1" />
                      Clear
                    </Button>
                  </div>

                  <div className="flex flex-wrap items-center gap-4">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">Tol:</span>
                      <div className="w-16">
                        <Slider
                          value={[bulkPpm]}
                          min={1}
                          max={20}
                          step={1}
                          onValueChange={([value]) => setBulkPpm(value)}
                        />
                      </div>
                      <span className="text-xs font-mono w-12">{bulkPpm} ppm</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">RT Win:</span>
                      <div className="w-16">
                        <Slider
                          value={[bulkRtWindow]}
                          min={0.1}
                          max={5}
                          step={0.1}
                          onValueChange={([value]) => setBulkRtWindow(value)}
                        />
                      </div>
                      <span className="text-xs font-mono w-12">±{bulkRtWindow.toFixed(1)}</span>
                    </div>
                    <DatapointControls value={dp} onChange={setDp} label="Datapoints (por defecto):" />
                    <Button
                      onClick={handleRunBulkAnalysis}
                      disabled={bulkCompounds.length === 0 || bulkSnrMutation.isPending}
                    >
                      {bulkSnrMutation.isPending ? (
                        <>
                          <Search className="h-4 w-4 mr-2 animate-spin" />
                          Processing...
                        </>
                      ) : (
                        <>
                          <Play className="h-4 w-4 mr-2" />
                          Run Analysis
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Results Table */}
          {bulkResults && bulkResults.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <FileSpreadsheet className="h-5 w-5" />
                    Results
                    <span className="text-sm font-normal text-muted-foreground">
                      ({bulkResults.length} compounds)
                    </span>
                  </CardTitle>
                  <Button variant="outline" size="sm" onClick={handleExportCsv} disabled={isExporting}>
                    {isExporting ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Download className="h-4 w-4 mr-2" />
                    )}
                    {isExporting ? 'Exporting...' : 'Export CSV'}
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="rounded-lg border border-border overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-muted/50">
                        <th className="text-left px-4 py-3 font-medium text-muted-foreground">Name</th>
                        <th className="text-right px-4 py-3 font-medium text-muted-foreground">m/z</th>
                        <th className="text-right px-4 py-3 font-medium text-muted-foreground">RT (min)</th>
                        <th className="text-right px-4 py-3 font-medium text-muted-foreground">S/N</th>
                        <th className="text-right px-4 py-3 font-medium text-muted-foreground">Signal</th>
                        <th className="text-right px-4 py-3 font-medium text-muted-foreground">Noise</th>
                        <th className="text-right px-4 py-3 font-medium text-muted-foreground">Apex RT</th>
                        {showDp && (
                          <th className="text-right px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">Datapoints full scan</th>
                        )}
                        {trailerAvail?.available && (
                          <>
                            <th className="text-right px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">Ion Inj. (ms)</th>
                            <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">IT/ventana (ms)</th>
                            <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">Ventanas m/z</th>
                            <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">Stitched m/z</th>
                          </>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {bulkResults.map((result, i) => (
                        <tr
                          key={i}
                          className={`border-t border-border hover:bg-muted/30 transition-colors ${
                            result.snr === 0 ? 'opacity-50' : ''
                          }`}
                        >
                          <td className="px-4 py-3 font-medium">{result.name}</td>
                          <td className="px-4 py-3 text-right font-mono">{result.mz.toFixed(4)}</td>
                          <td className="px-4 py-3 text-right font-mono">{result.rt.toFixed(2)}</td>
                          <td className="px-4 py-3 text-right">
                            <span className={`font-bold ${
                              result.snr >= 10 ? 'text-green-500' :
                              result.snr >= 3 ? 'text-yellow-500' :
                              'text-red-500'
                            }`}>
                              {result.snr.toFixed(1)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-muted-foreground">
                            {result.signal.toExponential(2)}
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-muted-foreground">
                            {result.noise.toFixed(0)}
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-muted-foreground">
                            {result.apex_rt.toFixed(2)}
                          </td>
                          {showDp && (
                            <td className="px-4 py-3 text-right font-mono">
                              {result.datapoint_count ?? '—'}
                              {result.dp_rt_start != null && result.dp_rt_end != null && (
                                <span className="ml-1 text-xs text-muted-foreground">
                                  ({result.dp_rt_start}–{result.dp_rt_end})
                                </span>
                              )}
                            </td>
                          )}
                          {trailerAvail?.available && (() => {
                            const t = bulkTrailer?.scans?.[i] ?? null
                            return (
                              <>
                                <td className="px-4 py-3 text-right font-mono text-muted-foreground">
                                  {t?.ion_injection_time_ms ?? '—'}
                                </td>
                                <td className="px-4 py-3">
                                  {t ? <ItGroups groups={t.multi_inject_it_ms} /> : '—'}
                                </td>
                                <td className="px-4 py-3">
                                  {t ? <WindowGroups groups={t.multi_inject_windows_mz} /> : '—'}
                                </td>
                                <td className="px-4 py-3">
                                  {t ? <WindowGroups groups={t.stitched_windows_mz} /> : '—'}
                                </td>
                              </>
                            )
                          })()}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Summary stats */}
                <div className="mt-4 flex gap-6 text-sm">
                  <div>
                    <span className="text-muted-foreground">Detected (S/N ≥ 3): </span>
                    <span className="font-medium text-green-500">
                      {bulkResults.filter(r => r.snr >= 3).length}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Not detected: </span>
                    <span className="font-medium text-red-500">
                      {bulkResults.filter(r => r.snr < 3).length}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Avg S/N: </span>
                    <span className="font-medium">
                      {(bulkResults.reduce((acc, r) => acc + r.snr, 0) / bulkResults.length).toFixed(1)}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Compounds loaded but not analyzed */}
          {bulkCompounds.length > 0 && !bulkResults && !bulkSnrMutation.isPending && (
            <Card>
              <CardHeader>
                <CardTitle>Compounds to Analyze</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="rounded-lg border border-border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-muted/50">
                        <th className="text-left px-4 py-2 font-medium text-muted-foreground">#</th>
                        <th className="text-left px-4 py-2 font-medium text-muted-foreground">Name</th>
                        <th className="text-right px-4 py-2 font-medium text-muted-foreground">m/z</th>
                        <th className="text-right px-4 py-2 font-medium text-muted-foreground">RT (min)</th>
                        <th className="text-right px-4 py-2 font-medium text-muted-foreground whitespace-nowrap">Ventana DP</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bulkCompounds.slice(0, 10).map((compound, i) => (
                        <tr key={i} className="border-t border-border">
                          <td className="px-4 py-2 text-muted-foreground">{i + 1}</td>
                          <td className="px-4 py-2 font-medium">{compound.name}</td>
                          <td className="px-4 py-2 text-right font-mono">{compound.mz.toFixed(4)}</td>
                          <td className="px-4 py-2 text-right font-mono">{compound.rt.toFixed(2)}</td>
                          <td className="px-4 py-2 text-right font-mono text-xs text-muted-foreground whitespace-nowrap">
                            {compound.dp_start != null && compound.dp_end != null
                              ? `${compound.dp_start}–${compound.dp_end} min`
                              : compound.dp_range_seconds != null
                                ? `±${compound.dp_range_seconds}s`
                                : 'por defecto'}
                          </td>
                        </tr>
                      ))}
                      {bulkCompounds.length > 10 && (
                        <tr className="border-t border-border">
                          <td colSpan={5} className="px-4 py-2 text-center text-muted-foreground">
                            ... and {bulkCompounds.length - 10} more
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Processing state */}
          {bulkSnrMutation.isPending && (
            <Card>
              <CardContent className="py-12">
                <div className="text-center">
                  <Loader size="lg" text={`Processing ${bulkCompounds.length} compounds...`} />
                </div>
              </CardContent>
            </Card>
          )}

          {/* Error state */}
          {bulkSnrMutation.isError && (
            <Card className="border-red-500/50">
              <CardContent className="py-6">
                <div className="text-center text-red-500">
                  Failed to process compounds. Please try again.
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </TabsContent>

      <TabsContent value="range-extract" className="mt-0">
        <RangeExtractTab fileId={fileId} />
      </TabsContent>
    </Tabs>
  )
}

// Simple XIC plot component
function XICPlot({
  times,
  intensities,
  apexRt,
  targetRt,
}: {
  times: number[]
  intensities: number[]
  apexRt: number
  targetRt: number
}) {
  const canvasId = 'xic-canvas'

  useEffect(() => {
    const canvas = document.getElementById(canvasId) as HTMLCanvasElement
    if (!canvas || times.length === 0) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width * 2
    canvas.height = rect.height * 2
    ctx.scale(2, 2)

    const width = rect.width
    const height = rect.height
    const padding = { top: 20, right: 20, bottom: 40, left: 60 }
    const plotWidth = width - padding.left - padding.right
    const plotHeight = height - padding.top - padding.bottom

    // Clear
    ctx.fillStyle = 'transparent'
    ctx.fillRect(0, 0, width, height)

    // Data ranges
    const minTime = Math.min(...times)
    const maxTime = Math.max(...times)
    const maxIntensity = Math.max(...intensities)

    // Scale functions
    const scaleX = (t: number) => padding.left + ((t - minTime) / (maxTime - minTime)) * plotWidth
    const scaleY = (i: number) => padding.top + plotHeight - (i / maxIntensity) * plotHeight

    // Draw grid
    ctx.strokeStyle = 'rgba(128, 128, 128, 0.2)'
    ctx.lineWidth = 1
    for (let i = 0; i <= 5; i++) {
      const y = padding.top + (plotHeight / 5) * i
      ctx.beginPath()
      ctx.moveTo(padding.left, y)
      ctx.lineTo(width - padding.right, y)
      ctx.stroke()
    }

    // Draw XIC line
    ctx.strokeStyle = '#3b82f6'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    times.forEach((t, i) => {
      const x = scaleX(t)
      const y = scaleY(intensities[i])
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    })
    ctx.stroke()

    // Fill under curve
    ctx.fillStyle = 'rgba(59, 130, 246, 0.1)'
    ctx.beginPath()
    ctx.moveTo(scaleX(times[0]), scaleY(0))
    times.forEach((t, i) => {
      ctx.lineTo(scaleX(t), scaleY(intensities[i]))
    })
    ctx.lineTo(scaleX(times[times.length - 1]), scaleY(0))
    ctx.closePath()
    ctx.fill()

    // Draw target RT line
    ctx.strokeStyle = 'rgba(234, 179, 8, 0.5)'
    ctx.lineWidth = 2
    ctx.setLineDash([5, 5])
    ctx.beginPath()
    ctx.moveTo(scaleX(targetRt), padding.top)
    ctx.lineTo(scaleX(targetRt), padding.top + plotHeight)
    ctx.stroke()
    ctx.setLineDash([])

    // Draw apex marker
    ctx.fillStyle = '#22c55e'
    ctx.beginPath()
    const apexX = scaleX(apexRt)
    // Find apex intensity
    let apexIntensity = 0
    for (let i = 0; i < times.length; i++) {
      if (Math.abs(times[i] - apexRt) < 0.01) {
        apexIntensity = intensities[i]
        break
      }
    }
    if (apexIntensity === 0) {
      // Interpolate
      for (let i = 1; i < times.length; i++) {
        if (times[i - 1] <= apexRt && times[i] >= apexRt) {
          const t = (apexRt - times[i - 1]) / (times[i] - times[i - 1])
          apexIntensity = intensities[i - 1] + t * (intensities[i] - intensities[i - 1])
          break
        }
      }
    }
    const apexY = scaleY(apexIntensity)
    ctx.arc(apexX, apexY, 6, 0, Math.PI * 2)
    ctx.fill()

    // Apex label
    ctx.fillStyle = '#22c55e'
    ctx.font = '11px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(`Apex: ${apexRt.toFixed(2)} min`, apexX, apexY - 12)

    // X axis label
    ctx.fillStyle = 'rgba(128, 128, 128, 0.8)'
    ctx.font = '11px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('Retention Time (min)', width / 2, height - 8)

    // Y axis label
    ctx.save()
    ctx.translate(12, height / 2)
    ctx.rotate(-Math.PI / 2)
    ctx.textAlign = 'center'
    ctx.fillText('Intensity', 0, 0)
    ctx.restore()

    // X axis ticks
    ctx.fillStyle = 'rgba(128, 128, 128, 0.6)'
    ctx.font = '10px sans-serif'
    ctx.textAlign = 'center'
    for (let i = 0; i <= 5; i++) {
      const t = minTime + ((maxTime - minTime) / 5) * i
      ctx.fillText(t.toFixed(1), scaleX(t), height - padding.bottom + 15)
    }

    // Y axis ticks
    ctx.textAlign = 'right'
    for (let i = 0; i <= 5; i++) {
      const intensity = (maxIntensity / 5) * (5 - i)
      const y = padding.top + (plotHeight / 5) * i
      ctx.fillText(intensity.toExponential(1), padding.left - 5, y + 4)
    }
  }, [times, intensities, apexRt, targetRt])

  return (
    <canvas
      id={canvasId}
      className="w-full h-full"
      style={{ width: '100%', height: '100%' }}
    />
  )
}
