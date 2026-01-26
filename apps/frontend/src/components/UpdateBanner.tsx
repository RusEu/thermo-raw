import { X, Download, ExternalLink, Info } from 'lucide-react'
import { useUpdateCheck } from '@/hooks/useUpdateCheck'
import { cn } from '@/lib/utils'

export function UpdateBanner() {
  const { updateInfo, isLoading, isDismissed, dismiss } = useUpdateCheck()

  // Don't show if loading, dismissed, or no update available
  if (isLoading || isDismissed || !updateInfo?.update_available) {
    return null
  }

  return (
    <div className="bg-primary/10 border-b border-primary/20">
      <div className="px-6 py-2.5">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 text-sm">
            <Info className="h-4 w-4 text-primary shrink-0" />
            <span className="text-foreground">
              New version <span className="font-semibold">{updateInfo.latest_version}</span> available
            </span>
          </div>
          <div className="flex items-center gap-2">
            {updateInfo.release_url && (
              <a
                href={updateInfo.release_url}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  'inline-flex items-center gap-1.5 px-3 py-1 text-sm font-medium rounded-md transition-colors',
                  'text-muted-foreground hover:text-foreground hover:bg-muted'
                )}
              >
                <ExternalLink className="h-3.5 w-3.5" />
                View changes
              </a>
            )}
            {updateInfo.download_url && (
              <a
                href={updateInfo.download_url}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  'inline-flex items-center gap-1.5 px-3 py-1 text-sm font-medium rounded-md transition-colors',
                  'bg-primary text-primary-foreground hover:bg-primary/90'
                )}
              >
                <Download className="h-3.5 w-3.5" />
                Download
              </a>
            )}
            <button
              onClick={dismiss}
              className={cn(
                'p-1.5 rounded-md transition-colors',
                'text-muted-foreground hover:text-foreground hover:bg-muted'
              )}
              aria-label="Dismiss update notification"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
