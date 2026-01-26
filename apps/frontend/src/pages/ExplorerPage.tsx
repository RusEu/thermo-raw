import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useTheme } from '@/lib/theme'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Slider } from '@/components/ui/slider'
import { BokehPlot } from '@/components/BokehPlot'
import { Loader, PlotLoader } from '@/components/Loader'
import { Button } from '@/components/ui/button'
import { useDebounce } from '@/hooks/useDebounce'

interface ExplorerPageProps {
  fileId: string
}

const PEAKS_PER_PAGE = 15

export function ExplorerPage({ fileId }: ExplorerPageProps) {
  const { theme } = useTheme()
  const [activeTab, setActiveTab] = useState<'spectrum' | 'heatmap'>('spectrum')
  const [rt, setRt] = useState<number | null>(null)
  const [chromType, setChromType] = useState<'tic' | 'bpc'>('tic')
  const [currentPage, setCurrentPage] = useState(0)

  // Visible m/z range from spectrum zoom
  const [mzRange, setMzRange] = useState<{ min: number; max: number } | null>(null)

  // Heatmap settings
  const [rtBins, setRtBins] = useState(200)
  const [mzBins, setMzBins] = useState(200)
  const debouncedRtBins = useDebounce(rtBins, 500)
  const debouncedMzBins = useDebounce(mzBins, 500)

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['stats', fileId],
    queryFn: () => api.getFileStats(fileId),
  })

  // Interactive chromatogram with selected RT indicator
  const { data: chromPlot, isLoading: chromLoading } = useQuery({
    queryKey: ['plot-chromatogram-interactive', fileId, chromType, rt, theme],
    queryFn: () => api.getPlotChromatogramInteractive(fileId, chromType, rt ?? undefined, theme),
    enabled: !!stats && activeTab === 'spectrum',
  })

  // Spectrum at selected RT
  const { data: spectrumPlot, isLoading: spectrumLoading, isFetching: spectrumFetching } = useQuery({
    queryKey: ['plot-spectrum', fileId, rt, theme],
    queryFn: () => api.getPlotSpectrum(fileId, rt!, theme),
    enabled: rt !== null && !!stats && activeTab === 'spectrum',
  })

  // Spectrum metadata
  const { data: spectrum } = useQuery({
    queryKey: ['spectrum', fileId, rt],
    queryFn: () => api.getSpectrum(fileId, rt!),
    enabled: rt !== null && !!stats && activeTab === 'spectrum',
  })

  // Top peaks with SNR (filtered by visible m/z range if set)
  const { data: topPeaks, isLoading: peaksLoading, isFetching: peaksFetching } = useQuery({
    queryKey: ['top-peaks', fileId, rt, mzRange?.min, mzRange?.max],
    queryFn: () => api.getTopPeaks(fileId, rt!, 500, mzRange?.min, mzRange?.max),
    enabled: rt !== null && !!stats && activeTab === 'spectrum',
  })

  // Heatmap
  const { data: heatmapPlot, isLoading: heatmapLoading } = useQuery({
    queryKey: ['plot-heatmap', fileId, debouncedRtBins, debouncedMzBins, theme],
    queryFn: () => api.getPlotHeatmap(fileId, debouncedRtBins, debouncedMzBins, theme),
    enabled: !!stats && activeTab === 'heatmap',
  })

  // Set initial RT
  useEffect(() => {
    if (stats && rt === null) {
      setRt(stats.rt_min)
    }
  }, [stats, rt])

  // Listen for chromatogram clicks and spectrum range changes
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'chromatogram-click') {
        setRt(event.data.rt)
        setCurrentPage(0)
        setMzRange(null) // Reset m/z range when changing RT
      } else if (event.data?.type === 'spectrum-range') {
        setMzRange({ min: event.data.mz_min, max: event.data.mz_max })
        setCurrentPage(0)
      }
    }
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [])

  if (statsLoading || !stats) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader text="Loading file..." size="lg" />
      </div>
    )
  }

  // Paginate peaks (already filtered by m/z range from backend)
  const paginatedPeaks = topPeaks?.slice(
    currentPage * PEAKS_PER_PAGE,
    (currentPage + 1) * PEAKS_PER_PAGE
  ) ?? []
  const totalPages = Math.ceil((topPeaks?.length ?? 0) / PEAKS_PER_PAGE)

  // Spectrum filters
  const spectrumFilters = (
    <Card className="px-4 py-3">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Type:</span>
          <div className="flex gap-1">
            <Button
              variant={chromType === 'tic' ? 'default' : 'outline'}
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => setChromType('tic')}
            >
              TIC
            </Button>
            <Button
              variant={chromType === 'bpc' ? 'default' : 'outline'}
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => setChromType('bpc')}
            >
              BPC
            </Button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">RT:</span>
          <span className="text-sm font-bold text-blue-500">{rt?.toFixed(2) ?? '-'} min</span>
        </div>
        {spectrum && (
          <>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Scan:</span>
              <span className="text-xs font-mono">{spectrum.metadata.scan_index}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Level:</span>
              <span className="text-xs font-mono text-pink-500">MS{spectrum.metadata.ms_level}</span>
            </div>
          </>
        )}
      </div>
    </Card>
  )

  // Heatmap filters
  const heatmapFilters = (
    <Card className="px-4 py-3">
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">RT Bins:</span>
          <div className="w-24">
            <Slider
              value={[rtBins]}
              min={50}
              max={500}
              step={50}
              onValueChange={([v]) => setRtBins(v)}
            />
          </div>
          <span className="text-xs font-mono w-8">{rtBins}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">m/z Bins:</span>
          <div className="w-24">
            <Slider
              value={[mzBins]}
              min={50}
              max={500}
              step={50}
              onValueChange={([v]) => setMzBins(v)}
            />
          </div>
          <span className="text-xs font-mono w-8">{mzBins}</span>
        </div>
        <div className="text-xs text-muted-foreground">
          RT: {stats.rt_min.toFixed(1)}-{stats.rt_max.toFixed(1)} | m/z: {stats.mz_min.toFixed(0)}-{stats.mz_max.toFixed(0)}
        </div>
      </div>
    </Card>
  )

  return (
    <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'spectrum' | 'heatmap')}>
      <TabsList className="w-full justify-start mb-4">
        <TabsTrigger value="spectrum">Spectrum</TabsTrigger>
        <TabsTrigger value="heatmap">Heatmap</TabsTrigger>
      </TabsList>

      {/* Filters bar */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">
          {activeTab === 'spectrum' ? 'Spectrum Explorer' : 'Heatmap View'}
        </h2>
        {activeTab === 'spectrum' ? spectrumFilters : heatmapFilters}
      </div>

      <TabsContent value="spectrum" className="mt-0">
        <div className="space-y-4">
          {/* Chromatogram - Top */}
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-base">
                {chromType === 'tic' ? 'Total Ion Chromatogram' : 'Base Peak Chromatogram'}
                <span className="text-xs font-normal text-muted-foreground ml-2">
                  (click to select RT)
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {chromLoading ? (
                <PlotLoader className="h-48" text="Loading chromatogram..." />
              ) : chromPlot ? (
                <BokehPlot plotData={chromPlot} />
              ) : null}
            </CardContent>
          </Card>

          {/* Spectrum - Middle */}
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-base flex items-center gap-2">
                Mass Spectrum
                {rt !== null && (
                  <span className="text-sm font-normal text-blue-500">
                    @ RT {rt.toFixed(2)} min
                  </span>
                )}
                {spectrumFetching && !spectrumLoading && (
                  <span className="text-xs font-normal text-muted-foreground">(loading...)</span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {rt === null ? (
                <div className="h-64 flex items-center justify-center text-muted-foreground">
                  Click on chromatogram to view spectrum
                </div>
              ) : spectrumLoading ? (
                <PlotLoader className="h-64" text="Loading spectrum..." />
              ) : spectrumPlot ? (
                <BokehPlot plotData={spectrumPlot} />
              ) : null}
            </CardContent>
          </Card>

          {/* Peaks Table - Bottom */}
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-base flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span>Top Peaks</span>
                  {mzRange && (
                    <span className="text-xs font-normal text-blue-500">
                      (m/z {mzRange.min.toFixed(1)} - {mzRange.max.toFixed(1)})
                    </span>
                  )}
                  {peaksFetching && !peaksLoading && (
                    <span className="text-xs font-normal text-muted-foreground">(updating...)</span>
                  )}
                </div>
                {topPeaks && (
                  <span className="text-xs font-normal text-muted-foreground">
                    {topPeaks.length} peaks
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {peaksLoading ? (
                <div className="h-32 flex items-center justify-center">
                  <Loader size="sm" text="Loading peaks..." />
                </div>
              ) : topPeaks && topPeaks.length > 0 ? (
                <div className="space-y-3">
                  <div className="space-y-1">
                    <div className="grid grid-cols-5 text-xs text-muted-foreground uppercase tracking-wide pb-2 border-b border-border">
                      <span>#</span>
                      <span>m/z</span>
                      <span>Intensity</span>
                      <span>Noise</span>
                      <span>SNR</span>
                    </div>
                    {paginatedPeaks.map((peak, i) => {
                      const globalIndex = currentPage * PEAKS_PER_PAGE + i + 1
                      return (
                        <div key={i} className="grid grid-cols-5 text-sm py-0.5">
                          <span className="text-muted-foreground">{globalIndex}</span>
                          <span className="font-mono">{peak.mz.toFixed(4)}</span>
                          <span className="font-mono">{peak.intensity.toExponential(2)}</span>
                          <span className="font-mono">{peak.noise.toFixed(1)}</span>
                          <span className="font-mono text-green-500">{peak.snr.toFixed(1)}</span>
                        </div>
                      )
                    })}
                  </div>

                  {/* Pagination */}
                  {totalPages > 1 && (
                    <div className="flex items-center justify-between pt-2 border-t border-border">
                      <span className="text-xs text-muted-foreground">
                        Page {currentPage + 1} of {totalPages}
                      </span>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
                          disabled={currentPage === 0}
                        >
                          Prev
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCurrentPage(p => Math.min(totalPages - 1, p + 1))}
                          disabled={currentPage >= totalPages - 1}
                        >
                          Next
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-sm text-muted-foreground py-4 text-center">
                  {rt === null ? 'Select a retention time first' :
                   mzRange ? 'No peaks in visible range (zoom out or reset)' : 'No peaks found'}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </TabsContent>

      <TabsContent value="heatmap" className="mt-0">
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-base">
              m/z vs Retention Time Heatmap
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {heatmapLoading ? (
              <PlotLoader className="h-[500px]" text="Loading heatmap..." />
            ) : heatmapPlot ? (
              <BokehPlot plotData={heatmapPlot} />
            ) : null}
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  )
}
