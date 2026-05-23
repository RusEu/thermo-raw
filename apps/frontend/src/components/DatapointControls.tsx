import { DatapointParams } from '@/lib/api'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

export interface DpConfig {
  mode: 'range' | 'startend'
  rangeSeconds: number
  start: string
  end: string
}

export const defaultDpConfig: DpConfig = {
  mode: 'range',
  rangeSeconds: 30,
  start: '',
  end: '',
}

/** Convert UI config to API params, or undefined if incomplete. */
export function dpToParams(dp: DpConfig): DatapointParams | undefined {
  if (dp.mode === 'startend') {
    const s = parseFloat(dp.start)
    const e = parseFloat(dp.end)
    if (!isNaN(s) && !isNaN(e)) return { dp_start: s, dp_end: e }
    return undefined
  }
  return dp.rangeSeconds > 0 ? { dp_range_seconds: dp.rangeSeconds } : undefined
}

export function DatapointControls({
  value,
  onChange,
}: {
  value: DpConfig
  onChange: (c: DpConfig) => void
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground">Datapoints full scan:</span>
      <div className="flex overflow-hidden rounded-md border border-input">
        <button
          type="button"
          onClick={() => onChange({ ...value, mode: 'range' })}
          className={cn(
            'px-2 py-1 text-xs transition-colors',
            value.mode === 'range'
              ? 'bg-primary/10 text-primary'
              : 'text-muted-foreground hover:bg-muted'
          )}
        >
          Rango (s)
        </button>
        <button
          type="button"
          onClick={() => onChange({ ...value, mode: 'startend' })}
          className={cn(
            'border-l border-input px-2 py-1 text-xs transition-colors',
            value.mode === 'startend'
              ? 'bg-primary/10 text-primary'
              : 'text-muted-foreground hover:bg-muted'
          )}
        >
          Inicio/Fin (min)
        </button>
      </div>
      {value.mode === 'range' ? (
        <>
          <Input
            type="number"
            value={value.rangeSeconds}
            onChange={(e) =>
              onChange({ ...value, rangeSeconds: parseFloat(e.target.value) || 0 })
            }
            step="1"
            min="0"
            className="h-7 w-16 text-xs"
          />
          <span className="text-[10px] text-muted-foreground">s</span>
        </>
      ) : (
        <>
          <Input
            type="number"
            placeholder="inicio"
            value={value.start}
            onChange={(e) => onChange({ ...value, start: e.target.value })}
            step="0.01"
            className="h-7 w-20 text-xs"
          />
          <span className="text-xs text-muted-foreground">–</span>
          <Input
            type="number"
            placeholder="fin"
            value={value.end}
            onChange={(e) => onChange({ ...value, end: e.target.value })}
            step="0.01"
            className="h-7 w-20 text-xs"
          />
          <span className="text-[10px] text-muted-foreground">min</span>
        </>
      )}
    </div>
  )
}
