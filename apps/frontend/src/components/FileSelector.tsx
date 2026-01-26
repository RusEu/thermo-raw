import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { FileInfo } from '@/lib/api'
import { Upload } from 'lucide-react'

interface FileSelectorProps {
  files: FileInfo[]
  selectedFile: string | null
  onSelect: (fileId: string) => void
  isLoading: boolean
  onUploadClick?: () => void
}

export function FileSelector({ files, selectedFile, onSelect, isLoading, onUploadClick }: FileSelectorProps) {
  if (isLoading) {
    return (
      <div className="h-9 w-64 animate-pulse rounded-md bg-muted" />
    )
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
        {files.map((file) => (
          <SelectItem key={file.id} value={file.id}>
            {file.name}
          </SelectItem>
        ))}
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
