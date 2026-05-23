import { useQuery } from '@tanstack/react-query'
import { api, TrailerScan } from '@/lib/api'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Loader2 } from 'lucide-react'

/** Per-window injection times, one (wrapping) line per sub-injection. */
export function ItGroups({ groups }: { groups: number[][] }) {
  if (!groups.length) return <span className="text-muted-foreground">—</span>
  return (
    <div className="space-y-0.5">
      {groups.map((g, i) => (
        <div key={i} className="font-mono text-xs">
          {groups.length > 1 && (
            <span className="mr-1 text-muted-foreground">inj{i + 1}:</span>
          )}
          {g.join(', ')}
        </div>
      ))}
    </div>
  )
}

/** m/z window ranges; pairs stay intact but wrap to multiple lines. */
export function WindowGroups({ groups }: { groups: number[][][] }) {
  if (!groups.length) return <span className="text-muted-foreground">—</span>
  return (
    <div className="space-y-1">
      {groups.map((g, i) => (
        <div key={i} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
          {groups.length > 1 && (
            <span className="text-xs text-muted-foreground">inj{i + 1}:</span>
          )}
          {g.map(([lo, hi], k) => (
            <span key={k} className="whitespace-nowrap font-mono text-xs">
              {lo}–{hi}
            </span>
          ))}
        </div>
      ))}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-sm">{children}</div>
    </div>
  )
}

export function TrailerScanDetails({ scan }: { scan: TrailerScan }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-4">
        <Field label="Scan (apex)">
          <span className="font-mono">{scan.scan}</span>
          <span className="ml-2 text-xs text-muted-foreground">RT {scan.rt_min.toFixed(3)} min · MS{scan.ms_level}</span>
        </Field>
        <Field label="Ion Injection Time (ms)">
          <span className="font-mono">{scan.ion_injection_time_ms ?? '—'}</span>
        </Field>
        <Field label="Multiple Injection">
          <span className="text-xs">{scan.multiple_injection ?? '—'}</span>
        </Field>
        <Field label="IT por ventana (ms)">
          <ItGroups groups={scan.multi_inject_it_ms} />
        </Field>
      </div>
      <Field label="Multi Inject Windows (m/z)">
        <WindowGroups groups={scan.multi_inject_windows_mz} />
      </Field>
      <Field label="Stitched Windows (m/z)">
        <WindowGroups groups={scan.stitched_windows_mz} />
      </Field>
    </div>
  )
}

/**
 * Card showing Trailer Extra (per-window injection times, multi-inject /
 * stitched windows, ion injection time) for the scan at a precursor apex RT.
 * Renders nothing if there is no .raw for this dataset.
 */
export function TrailerExtraCard({
  fileId,
  rt,
  msLevel = 1,
}: {
  fileId: string
  rt: number
  msLevel?: number
}) {
  const { data: avail } = useQuery({
    queryKey: ['trailer-available', fileId],
    queryFn: () => api.getTrailerAvailable(fileId),
  })

  const { data: scan, isLoading, error } = useQuery({
    queryKey: ['trailer-at-rt', fileId, rt, msLevel],
    queryFn: () => api.getTrailerAtRt(fileId, rt, msLevel),
    enabled: avail?.available === true && rt > 0,
    retry: false,
  })

  // No .raw: this metadata simply doesn't exist for the dataset.
  if (avail && !avail.available) return null
  if (!avail) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          Trailer Extra
          <span className="ml-2 text-sm font-normal text-muted-foreground">
            metadatos propietarios leídos del .raw
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Leyendo Trailer Extra…
          </div>
        ) : error ? (
          <p className="text-sm text-destructive">
            {(error as Error).message}
          </p>
        ) : scan ? (
          <TrailerScanDetails scan={scan} />
        ) : (
          <p className="text-sm text-muted-foreground">
            No se encontró scan en el apex.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
