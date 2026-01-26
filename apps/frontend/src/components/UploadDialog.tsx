import { useState, useCallback, useRef } from 'react'
import { Upload, X, FileUp, Loader2, CheckCircle, AlertCircle } from 'lucide-react'
import { api, UploadResponse } from '@/lib/api'
import { cn } from '@/lib/utils'

interface UploadDialogProps {
  isOpen: boolean
  onClose: () => void
  onUploadComplete: (file: UploadResponse) => void
}

type UploadState = 'idle' | 'uploading' | 'converting' | 'success' | 'error'

export function UploadDialog({ isOpen, onClose, onUploadComplete }: UploadDialogProps) {
  const [dragActive, setDragActive] = useState(false)
  const [uploadState, setUploadState] = useState<UploadState>('idle')
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const resetState = useCallback(() => {
    setUploadState('idle')
    setProgress(0)
    setError(null)
    setSelectedFile(null)
  }, [])

  const handleClose = useCallback(() => {
    if (uploadState === 'uploading' || uploadState === 'converting') {
      return // Don't close while uploading
    }
    resetState()
    onClose()
  }, [uploadState, resetState, onClose])

  const handleUpload = useCallback(async (file: File) => {
    setSelectedFile(file)
    setUploadState('uploading')
    setProgress(0)
    setError(null)

    try {
      const response = await api.uploadFile(file, (p) => {
        setProgress(p)
        if (p === 100 && file.name.toLowerCase().endsWith('.raw')) {
          setUploadState('converting')
        }
      })

      setUploadState('success')

      // Wait a moment to show success state, then close
      setTimeout(() => {
        onUploadComplete(response)
        handleClose()
      }, 1000)
    } catch (err) {
      setUploadState('error')
      setError(err instanceof Error ? err.message : 'Upload failed')
    }
  }, [onUploadComplete, handleClose])

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)

    const files = e.dataTransfer.files
    if (files?.[0]) {
      const file = files[0]
      const suffix = file.name.toLowerCase().slice(file.name.lastIndexOf('.'))
      if (suffix === '.raw' || suffix === '.mzml') {
        handleUpload(file)
      } else {
        setError('Only .raw and .mzML files are supported')
        setUploadState('error')
      }
    }
  }, [handleUpload])

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files?.[0]) {
      const file = files[0]
      const suffix = file.name.toLowerCase().slice(file.name.lastIndexOf('.'))
      if (suffix === '.raw' || suffix === '.mzml') {
        handleUpload(file)
      } else {
        setError('Only .raw and .mzML files are supported')
        setUploadState('error')
      }
    }
  }, [handleUpload])

  const handleBrowseClick = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={handleClose}
      />

      {/* Dialog */}
      <div className="relative z-10 w-full max-w-md rounded-lg border border-border bg-background p-6 shadow-lg">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Upload File</h2>
          <button
            onClick={handleClose}
            className="rounded-md p-1 hover:bg-muted transition-colors"
            disabled={uploadState === 'uploading' || uploadState === 'converting'}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        {uploadState === 'idle' && (
          <div
            className={cn(
              'border-2 border-dashed rounded-lg p-8 text-center transition-colors',
              dragActive ? 'border-primary bg-primary/5' : 'border-border'
            )}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
          >
            <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-4" />
            <p className="text-sm text-foreground mb-2">
              Drag and drop your file here, or{' '}
              <button
                onClick={handleBrowseClick}
                className="text-primary hover:underline"
              >
                browse
              </button>
            </p>
            <p className="text-xs text-muted-foreground">
              Supports .raw and .mzML files
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".raw,.mzML,.mzml"
              onChange={handleFileSelect}
              className="hidden"
            />
          </div>
        )}

        {uploadState === 'uploading' && (
          <div className="py-8">
            <div className="flex items-center gap-3 mb-4">
              <FileUp className="h-8 w-8 text-primary" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{selectedFile?.name}</p>
                <p className="text-xs text-muted-foreground">Uploading...</p>
              </div>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground mt-2 text-right">{progress}%</p>
          </div>
        )}

        {uploadState === 'converting' && (
          <div className="py-8 text-center">
            <Loader2 className="h-10 w-10 mx-auto text-primary animate-spin mb-4" />
            <p className="text-sm font-medium">Converting .raw to .mzML</p>
            <p className="text-xs text-muted-foreground mt-1">
              This may take a few moments...
            </p>
          </div>
        )}

        {uploadState === 'success' && (
          <div className="py-8 text-center">
            <CheckCircle className="h-10 w-10 mx-auto text-green-500 mb-4" />
            <p className="text-sm font-medium">Upload complete!</p>
          </div>
        )}

        {uploadState === 'error' && (
          <div className="py-8">
            <div className="text-center mb-4">
              <AlertCircle className="h-10 w-10 mx-auto text-destructive mb-4" />
              <p className="text-sm font-medium">Upload failed</p>
              <p className="text-xs text-muted-foreground mt-1">{error}</p>
            </div>
            <button
              onClick={resetState}
              className="w-full py-2 px-4 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
            >
              Try again
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
