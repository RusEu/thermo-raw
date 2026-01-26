import { useState, useRef, useEffect } from 'react'
import { Settings, Sun, Moon } from 'lucide-react'
import { useTheme } from '@/lib/theme'

export function SettingsDropdown() {
  const [open, setOpen] = useState(false)
  const { theme, setTheme } = useTheme()
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setOpen(!open)}
        className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card hover:bg-accent transition-colors"
        aria-label="Settings"
      >
        <Settings className="h-4 w-4 text-muted-foreground" />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-48 rounded-lg border border-border bg-card shadow-lg z-50">
          <div className="p-2">
            <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Theme
            </div>
            <button
              onClick={() => {
                setTheme('light')
                setOpen(false)
              }}
              className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors ${
                theme === 'light'
                  ? 'bg-primary/10 text-primary'
                  : 'text-foreground hover:bg-accent'
              }`}
            >
              <Sun className="h-4 w-4" />
              Light
            </button>
            <button
              onClick={() => {
                setTheme('dark')
                setOpen(false)
              }}
              className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors ${
                theme === 'dark'
                  ? 'bg-primary/10 text-primary'
                  : 'text-foreground hover:bg-accent'
              }`}
            >
              <Moon className="h-4 w-4" />
              Dark
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
