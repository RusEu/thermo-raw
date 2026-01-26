import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useTheme } from '@/lib/theme'
import { Layout } from '@/components/Layout'
import { FilterCard } from '@/components/FilterCard'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { StatCard } from '@/components/StatCard'
import { BokehPlot } from '@/components/BokehPlot'
import { Loader, PlotLoader } from '@/components/Loader'
import { formatScientific } from '@/lib/utils'

interface OverviewPageProps {
  fileId: string
}

export function OverviewPage({ fileId }: OverviewPageProps) {
  const { theme } = useTheme()

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['stats', fileId],
    queryFn: () => api.getFileStats(fileId),
  })

  const { data: ticPlot, isLoading: ticLoading } = useQuery({
    queryKey: ['plot-tic', fileId, theme],
    queryFn: () => api.getPlotTic(fileId, theme),
  })

  if (statsLoading || !stats) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader text="Loading file statistics..." size="lg" />
      </div>
    )
  }

  const sidebar = (
    <FilterCard title="File Info">
      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Filename</span>
          <span className="text-foreground font-medium truncate ml-2 max-w-32">{stats.filename}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Polarity</span>
          <span className="text-foreground">{stats.polarity || '—'}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Max TIC</span>
          <span className="text-foreground font-mono">{formatScientific(stats.max_tic)}</span>
        </div>
      </div>
    </FilterCard>
  )

  return (
    <Layout sidebar={sidebar}>
      <div className="space-y-6">
        <div className="grid grid-cols-4 gap-4">
          <StatCard label="Total Scans" value={stats.total_scans.toLocaleString()} />
          <StatCard label="MS1 Scans" value={stats.ms1_scans.toLocaleString()} />
          <StatCard label="MS2 Scans" value={stats.ms2_scans.toLocaleString()} />
          <StatCard label="Duration" value={`${(stats.rt_max - stats.rt_min).toFixed(1)} min`} />
        </div>

        <div className="grid grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Acquisition Range</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">RT Range</span>
                <span className="text-foreground">{stats.rt_min.toFixed(2)} – {stats.rt_max.toFixed(2)} min</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">m/z Range</span>
                <span className="text-foreground">{stats.mz_min.toFixed(1)} – {stats.mz_max.toFixed(1)}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Scan Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div>
                  <div className="mb-1 flex justify-between text-sm">
                    <span className="text-muted-foreground">MS1</span>
                    <span className="text-foreground">{((stats.ms1_scans / stats.total_scans) * 100).toFixed(1)}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-full"
                      style={{ width: `${(stats.ms1_scans / stats.total_scans) * 100}%` }}
                    />
                  </div>
                </div>
                <div>
                  <div className="mb-1 flex justify-between text-sm">
                    <span className="text-muted-foreground">MS2</span>
                    <span className="text-foreground">{((stats.ms2_scans / stats.total_scans) * 100).toFixed(1)}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full bg-pink-500 rounded-full"
                      style={{ width: `${(stats.ms2_scans / stats.total_scans) * 100}%` }}
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>TIC Preview</CardTitle>
          </CardHeader>
          <CardContent>
            {ticLoading ? (
              <PlotLoader text="Loading TIC..." />
            ) : ticPlot ? (
              <BokehPlot plotData={ticPlot} />
            ) : null}
          </CardContent>
        </Card>
      </div>
    </Layout>
  )
}
