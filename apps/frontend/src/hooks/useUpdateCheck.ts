import { useState, useEffect, useCallback } from 'react'
import { api, UpdateInfo } from '@/lib/api'

const DISMISSED_KEY = 'thermo-raw-update-dismissed'

function getDismissedVersion(): string | null {
  try {
    return localStorage.getItem(DISMISSED_KEY)
  } catch {
    return null
  }
}

function setDismissedVersion(version: string): void {
  try {
    localStorage.setItem(DISMISSED_KEY, version)
  } catch {
    // Ignore localStorage errors
  }
}

export function useUpdateCheck() {
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isDismissed, setIsDismissed] = useState(false)

  useEffect(() => {
    // Only check for updates in standalone mode (pywebview)
    // In development/browser mode, we skip the check
    const isStandalone = 'pywebview' in window

    // Skip check if not in standalone mode
    if (!isStandalone && import.meta.env.DEV) {
      setIsLoading(false)
      return
    }

    const checkForUpdates = async () => {
      try {
        const info = await api.checkForUpdates()
        setUpdateInfo(info)

        // Check if this version was dismissed
        const dismissedVersion = getDismissedVersion()
        if (dismissedVersion === info.latest_version) {
          setIsDismissed(true)
        }
      } catch (error) {
        // Silently fail - update check is non-critical
        console.debug('Update check failed:', error)
      } finally {
        setIsLoading(false)
      }
    }

    checkForUpdates()
  }, [])

  const dismiss = useCallback(() => {
    if (updateInfo?.latest_version) {
      setDismissedVersion(updateInfo.latest_version)
      setIsDismissed(true)
    }
  }, [updateInfo])

  return {
    updateInfo,
    isLoading,
    isDismissed,
    dismiss,
  }
}
