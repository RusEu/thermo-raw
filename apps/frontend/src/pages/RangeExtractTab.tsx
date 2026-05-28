import { useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Slider } from '@/components/ui/slider'
import { Loader } from '@/components/Loader'
import { Search, Upload, Play, X, Download, Loader2, FileSpreadsheet } from 'lucide-react'
import { api } from '@/lib/api'

interface RangeExtractTabProps {
  fileId: string
}

interface RangeCompound {
  name: string
  mz: number
  start?: number
  end?: number
}

const DISPLAY_CAP = 2000

/** Parse CSV/TSV text. Header-aware. Required: name, mz. Optional: start, end (min). */
function parseRangeCsv(text: string): RangeCompound[] {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
  if (lines.length === 0) return []
  const split = (l: string) => l.split(/[,\t]/).map((p) => p.trim())
  const headerCols = split(lines[0]).map((c) => c.toLowerCase())
  const hasHeader = ['name', 'compound', 'mz', 'm/z', 'start', 'end', 'start_min', 'end_min'].some(
    (h) => headerCols.includes(h)
  )
  const find = (...names: string[]) => headerCols.findIndex((c) => names.includes(c))
  const col = {
    name: hasHeader && find('name', 'compound') >= 0 ? find('name', 'compound') : 0,
    mz: hasHeader && find('mz', 'm/z') >= 0 ? find('mz', 'm/z') : 1,
    start: hasHeader ? find('start', 'start_min') : -1,
    end: hasHeader ? find('end', 'end_min') : -1,
  }
  const num = (v: string | undefined) => (v !== undefined && v !== '' ? parseFloat(v) : NaN)
  const out: RangeCompound[] = []
  for (let i = hasHeader ? 1 : 0; i < lines.length; i++) {
    const parts = split(lines[i])
    const mz = num(parts[col.mz])
    if (isNaN(mz)) continue
    const c: RangeCompound = { name: parts[col.name] ?? `Compound ${i}`, mz }
    const s = num(parts[col.start])
    const e = num(parts[col.end])
    if (col.start >= 0 && col.end >= 0 && !isNaN(s) && !isNaN(e)) {
      c.start = s
      c.end = e
    }
    out.push(c)
  }
  return out
}

export function RangeExtractTab({ fileId }: RangeExtractTabProps) {
  const [compounds, setCompounds] = useState<RangeCompound[]>([])
  const [pasteText, setPasteText] = useState('')
  const [ppm, setPpm] = useState(5)
  const [startMin, setStartMin] = useState('')
  const [endMin, setEndMin] = useState('')
  const [isExporting, setIsExporting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const runMutation = useMutation({
    mutationFn: () =>
      api.rangeExtract(
        fileId,
        compounds,
        ppm,
        parseFloat(startMin) || undefined,
        parseFloat(endMin) || undefined
      ),
  })

  const canRun =
    compounds.length > 0 &&
    (compounds.every((c) => c.start != null && c.end != null) ||
      (parseFloat(startMin) >= 0 && parseFloat(endMin) > parseFloat(startMin)))

  const handlePaste = () => {
    const parsed = parseRangeCsv(pasteText)
    if (parsed.length > 0) {
      setCompounds(parsed)
      setPasteText('')
      runMutation.reset()
    }
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (event) => {
      const text = event.target?.result as string
      const parsed = parseRangeCsv(text)
      setCompounds(parsed)
      setPasteText('')
      runMutation.reset()
    }
    reader.readAsText(file)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleClear = () => {
    setCompounds([])
    runMutation.reset()
  }

  const handleExport = async () => {
    setIsExporting(true)
    try {
      await api.downloadRangeExtractCsv(
        fileId,
        compounds,
        ppm,
        parseFloat(startMin) || undefined,
        parseFloat(endMin) || undefined
      )
    } catch (err) {
      console.error('Range export failed:', err)
    } finally {
      setIsExporting(false)
    }
  }

  const rows = runMutation.data?.rows ?? []
  const displayedRows = rows.slice(0, DISPLAY_CAP)

  return (
    <div className="space-y-4">
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv"
        onChange={handleFileUpload}
        className="hidden"
      />

      {/* Input area (when no compounds loaded yet) */}
      {compounds.length === 0 && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">Range Extract</CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">
                  Extrae intensidad por cada MS1 dentro de un rango de tiempo (sin buscar apex).
                  Una fila por cada data point.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                className="text-xs"
              >
                <Upload className="mr-1 h-3 w-3" />
                Upload CSV
              </Button>
            </div>
          </CardHeader>
          <CardContent className="pt-2">
            <div className="space-y-3">
              <textarea
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                placeholder="name, mz&#10;Caffeine, 195.0877&#10;Glucose, 203.0532&#10;&#10;# o con start/end por compuesto (minutos):&#10;name, mz, start, end&#10;Caffeine, 195.0877, 4.0, 4.4"
                className="h-40 w-full resize-none rounded-lg border border-border bg-background p-3 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  name, mz — opcional por compuesto: start, end (min). Si no, usa el rango global.
                </span>
                <Button onClick={handlePaste} disabled={!pasteText.trim()}>
                  <Play className="mr-2 h-4 w-4" />
                  Load Compounds
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Controls + run */}
      {compounds.length > 0 && (
        <Card>
          <CardContent className="py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-4">
                <span className="text-sm font-medium">{compounds.length} compounds</span>
                <Button variant="ghost" size="sm" onClick={handleClear} className="text-muted-foreground hover:text-foreground">
                  <X className="mr-1 h-4 w-4" />
                  Clear
                </Button>
              </div>
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Tol:</span>
                  <div className="w-16">
                    <Slider
                      value={[ppm]}
                      min={1}
                      max={20}
                      step={1}
                      onValueChange={([v]) => setPpm(v)}
                    />
                  </div>
                  <span className="w-12 font-mono text-xs">{ppm} ppm</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-xs text-muted-foreground">Rango (min):</span>
                  <Input
                    type="number"
                    placeholder="start"
                    value={startMin}
                    onChange={(e) => setStartMin(e.target.value)}
                    step="0.01"
                    className="h-7 w-20 text-xs"
                  />
                  <span className="text-xs text-muted-foreground">–</span>
                  <Input
                    type="number"
                    placeholder="end"
                    value={endMin}
                    onChange={(e) => setEndMin(e.target.value)}
                    step="0.01"
                    className="h-7 w-20 text-xs"
                  />
                </div>
                <Button onClick={() => runMutation.mutate()} disabled={!canRun || runMutation.isPending}>
                  {runMutation.isPending ? (
                    <>
                      <Search className="mr-2 h-4 w-4 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <Play className="mr-2 h-4 w-4" />
                      Run Extract
                    </>
                  )}
                </Button>
              </div>
            </div>
            {!canRun && (
              <p className="mt-2 text-xs text-muted-foreground">
                Define un rango global (start, end) o asegúrate de que cada compuesto trae los suyos.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Compounds preview */}
      {compounds.length > 0 && !runMutation.data && !runMutation.isPending && (
        <Card>
          <CardHeader>
            <CardTitle>Compounds to Extract</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50">
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">#</th>
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">Name</th>
                    <th className="px-4 py-2 text-right font-medium text-muted-foreground">m/z</th>
                    <th className="px-4 py-2 text-right font-medium text-muted-foreground whitespace-nowrap">Rango (min)</th>
                  </tr>
                </thead>
                <tbody>
                  {compounds.slice(0, 10).map((c, i) => (
                    <tr key={i} className="border-t border-border">
                      <td className="px-4 py-2 text-muted-foreground">{i + 1}</td>
                      <td className="px-4 py-2 font-medium">{c.name}</td>
                      <td className="px-4 py-2 text-right font-mono">{c.mz.toFixed(4)}</td>
                      <td className="px-4 py-2 text-right font-mono text-xs text-muted-foreground whitespace-nowrap">
                        {c.start != null && c.end != null
                          ? `${c.start}–${c.end}`
                          : 'global'}
                      </td>
                    </tr>
                  ))}
                  {compounds.length > 10 && (
                    <tr className="border-t border-border">
                      <td colSpan={4} className="px-4 py-2 text-center text-muted-foreground">
                        ... and {compounds.length - 10} more
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Processing */}
      {runMutation.isPending && (
        <Card>
          <CardContent className="py-12">
            <div className="text-center">
              <Loader size="lg" text={`Extrayendo ${compounds.length} compuestos...`} />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Error */}
      {runMutation.isError && (
        <Card className="border-red-500/50">
          <CardContent className="py-6">
            <div className="text-center text-red-500">
              <p className="font-medium">Range extract failed</p>
              <p className="mt-1 text-sm text-red-400">
                {runMutation.error instanceof Error ? runMutation.error.message : 'Please try again.'}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Results */}
      {runMutation.data && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5" />
                Results
                <span className="text-sm font-normal text-muted-foreground">
                  ({runMutation.data.total.toLocaleString()} rows
                  {rows.length > DISPLAY_CAP && `, showing first ${DISPLAY_CAP.toLocaleString()}`})
                </span>
              </CardTitle>
              <Button variant="outline" size="sm" onClick={handleExport} disabled={isExporting}>
                {isExporting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Download className="mr-2 h-4 w-4" />
                )}
                {isExporting ? 'Exporting...' : 'Export CSV'}
              </Button>
            </div>
            {runMutation.data.skipped.length > 0 && (
              <p className="mt-1 text-xs text-yellow-500">
                Sin rango definido (se omitieron): {runMutation.data.skipped.join(', ')}
              </p>
            )}
          </CardHeader>
          <CardContent>
            <div className="max-h-[70vh] overflow-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted/50">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">Compound</th>
                    <th className="px-4 py-2 text-right font-medium text-muted-foreground">m/z target</th>
                    <th className="px-4 py-2 text-right font-medium text-muted-foreground">Scan</th>
                    <th className="px-4 py-2 text-right font-medium text-muted-foreground">RT (min)</th>
                    <th className="px-4 py-2 text-right font-medium text-muted-foreground">Intensity</th>
                    <th className="px-4 py-2 text-right font-medium text-muted-foreground">Actual m/z</th>
                    <th className="px-4 py-2 text-right font-medium text-muted-foreground">n_peaks</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedRows.map((r, i) => (
                    <tr key={i} className="border-t border-border hover:bg-muted/30">
                      <td className="px-4 py-1.5 font-medium">{r.compound}</td>
                      <td className="px-4 py-1.5 text-right font-mono">{r.target_mz.toFixed(4)}</td>
                      <td className="px-4 py-1.5 text-right font-mono text-muted-foreground">{r.scan ?? '—'}</td>
                      <td className="px-4 py-1.5 text-right font-mono">{r.rt_min.toFixed(4)}</td>
                      <td className="px-4 py-1.5 text-right font-mono">
                        {r.intensity > 0 ? r.intensity.toExponential(2) : <span className="text-muted-foreground">0</span>}
                      </td>
                      <td className="px-4 py-1.5 text-right font-mono text-muted-foreground">
                        {r.actual_mz != null ? r.actual_mz.toFixed(4) : '—'}
                      </td>
                      <td className="px-4 py-1.5 text-right font-mono text-muted-foreground">{r.n_peaks}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
