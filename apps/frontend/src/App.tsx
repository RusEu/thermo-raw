import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, NavLink, Navigate, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { FileSelector } from '@/components/FileSelector'
import { SettingsDropdown } from '@/components/SettingsDropdown'
import { UploadDialog } from '@/components/UploadDialog'
import { UpdateBanner } from '@/components/UpdateBanner'
import { OverviewPage } from '@/pages/OverviewPage'
import { ExplorerPage } from '@/pages/ExplorerPage'
import { AnalysisPage } from '@/pages/AnalysisPage'
import { api, UploadResponse } from '@/lib/api'
import { cn } from '@/lib/utils'

const navItems = [
  { path: '/overview', label: 'Overview' },
  { path: '/explorer', label: 'Explorer' },
  { path: '/analysis', label: 'Analysis' },
]

function Navigation() {
  const [searchParams] = useSearchParams()
  const fileParam = searchParams.get('file')

  return (
    <nav className="flex items-center gap-1">
      {navItems.map((item) => (
        <NavLink
          key={item.path}
          to={`${item.path}${fileParam ? `?file=${fileParam}` : ''}`}
          className={({ isActive }) =>
            cn(
              'px-3 py-1.5 text-sm font-medium rounded-md transition-colors',
              isActive
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted'
            )
          }
        >
          {item.label}
        </NavLink>
      ))}
    </nav>
  )
}

function AppContent() {
  const [searchParams, setSearchParams] = useSearchParams()
  const fileFromUrl = searchParams.get('file')
  const [selectedFile, setSelectedFile] = useState<string | null>(fileFromUrl)
  const [isUploadOpen, setIsUploadOpen] = useState(false)
  const queryClient = useQueryClient()

  const { data: files, isLoading } = useQuery({
    queryKey: ['files'],
    queryFn: api.getFiles,
  })

  const handleUploadComplete = (uploadedFile: UploadResponse) => {
    // Refresh the file list
    queryClient.invalidateQueries({ queryKey: ['files'] })
    // Select the newly uploaded file
    setSelectedFile(uploadedFile.id)
    setSearchParams({ file: uploadedFile.id })
  }

  // Auto-select first file if none selected
  useEffect(() => {
    if (files && files.length > 0 && !selectedFile) {
      const firstFile = files[0].id
      setSelectedFile(firstFile)
      setSearchParams({ file: firstFile })
    }
  }, [files, selectedFile, setSearchParams])

  // Update URL when file changes
  const handleFileSelect = (fileId: string | null) => {
    setSelectedFile(fileId)
    if (fileId) {
      setSearchParams({ file: fileId })
    }
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Update Banner */}
      <UpdateBanner />

      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="px-6 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6">
              {/* Logo */}
              <div className="flex items-center gap-2.5">
                <img src="/logo-icon.svg" alt="ThermoRaw" className="h-8 w-8 rounded-lg" />
                <span className="font-semibold text-foreground">ThermoRaw</span>
              </div>
              {/* Navigation */}
              {selectedFile && <Navigation />}
            </div>
            <div className="flex items-center gap-3">
              <FileSelector
                files={files || []}
                selectedFile={selectedFile}
                onSelect={handleFileSelect}
                isLoading={isLoading}
                onUploadClick={() => setIsUploadOpen(true)}
              />
              <SettingsDropdown />
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="p-6">
        {!selectedFile ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
              <img src="/logo.svg" alt="" className="h-10 w-10 opacity-50" />
            </div>
            <h2 className="mt-4 text-lg font-medium text-foreground">No file selected</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {isLoading ? 'Loading files...' : 'Select an mzML file to get started'}
            </p>
          </div>
        ) : (
          <Routes>
            <Route path="/" element={<Navigate to="/overview" replace />} />
            <Route path="/overview" element={<OverviewPage fileId={selectedFile} />} />
            <Route path="/explorer" element={<ExplorerPage fileId={selectedFile} />} />
            <Route path="/analysis" element={<AnalysisPage fileId={selectedFile} />} />
          </Routes>
        )}
      </main>

      {/* Upload Dialog */}
      <UploadDialog
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        onUploadComplete={handleUploadComplete}
      />
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  )
}
