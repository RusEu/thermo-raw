import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface LoaderProps {
  className?: string
  text?: string
  size?: 'sm' | 'md' | 'lg'
}

export function Loader({ className, text, size = 'md' }: LoaderProps) {
  const sizeClasses = {
    sm: 'h-4 w-4',
    md: 'h-6 w-6',
    lg: 'h-8 w-8',
  }

  return (
    <div className={cn('flex flex-col items-center justify-center gap-3', className)}>
      <Loader2 className={cn('animate-spin text-primary', sizeClasses[size])} />
      {text && <span className="text-sm text-muted-foreground">{text}</span>}
    </div>
  )
}

interface PlotLoaderProps {
  className?: string
  text?: string
}

export function PlotLoader({ className, text = 'Loading chart...' }: PlotLoaderProps) {
  return (
    <div className={cn('h-64 rounded-lg border border-border bg-muted/30 flex items-center justify-center', className)}>
      <Loader text={text} />
    </div>
  )
}
