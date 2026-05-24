import { useState } from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { FileInfo } from '@/lib/api'
import { Upload, Trash2, Check, Loader2 } from 'lucide-react'

interface FileSelectorProps {
  files: FileInfo[]
  selectedFile: string | null
  onSelect: (fileId: string) => void
  isLoading: boolean
  onUploadClick?: () => void
  onDelete?: (fileId: string) => void
  deletingId?: string | null
}

export function FileSelector({
  files,
  selectedFile,
  onSelect,
  isLoading,
  onUploadClick,
  onDelete,
  deletingId,
}: FileSelectorProps) {
  // Two-step inline confirm: first trash click arms, second confirms
  const [confirmId, setConfirmId] = useState<string | null>(null)

  if (isLoading) {
    return <div className="h-9 w-64 animate-pulse rounded-md bg-muted" />
  }

  if (files.length === 0) {
    return (
      <button
        onClick={onUploadClick}
        className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md border border-dashed border-border hover:bg-muted transition-colors"
      >
        <Upload className="h-4 w-4" />
        Upload a file
      </button>
    )
  }

  return (
    <Select value={selectedFile || undefined} onValueChange={onSelect}>
      <SelectTrigger className="w-64">
        <SelectValue placeholder="Select a file..." />
      </SelectTrigger>
      <SelectContent>
        {/* Scrollable file list so the upload button below stays reachable */}
        <div className="max-h-64 overflow-y-auto">
          {files.map((file) => (
            <div key={file.id} className="relative">
              <SelectItem value={file.id} className="pr-9">
                {file.name}
              </SelectItem>
              {onDelete && (
                <button
                  type="button"
                  title={confirmId === file.id ? 'Click again to confirm delete' : 'Delete file'}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 hover:bg-muted"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation()
                    e.preventDefault()
                    if (confirmId === file.id) {
                      onDelete(file.id)
                      setConfirmId(null)
                    } else {
                      setConfirmId(file.id)
                    }
                  }}
                >
                  {deletingId === file.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                  ) : confirmId === file.id ? (
                    <Check className="h-3.5 w-3.5 text-red-500" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-red-500" />
                  )}
                </button>
              )}
            </div>
          ))}
        </div>
        {onUploadClick && (
          <>
            <div className="my-1 h-px bg-border" />
            <button
              onClick={(e) => {
                e.stopPropagation()
                onUploadClick()
              }}
              className="flex w-full items-center gap-2 px-2 py-1.5 text-sm rounded-sm hover:bg-muted transition-colors"
            >
              <Upload className="h-4 w-4" />
              Upload new file
            </button>
          </>
        )}
      </SelectContent>
    </Select>
  )
}
