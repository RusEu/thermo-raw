import { useEffect, useRef, useId } from 'react'
import * as Bokeh from '@bokeh/bokehjs'

interface BokehPlotProps {
  plotData: unknown
  className?: string
}

export function BokehPlot({ plotData, className }: BokehPlotProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const id = useId().replace(/:/g, '-')

  useEffect(() => {
    if (!containerRef.current || !plotData) return

    const container = containerRef.current
    container.innerHTML = ''

    Bokeh.embed.embed_item(plotData as Bokeh.embed.JsonItem, container.id)

    return () => {
      container.innerHTML = ''
    }
  }, [plotData])

  return <div ref={containerRef} id={`bokeh-plot${id}`} className={className} />
}
