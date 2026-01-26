import { ReactNode } from 'react'

interface LayoutProps {
  children: ReactNode
  sidebar?: ReactNode
}

export function Layout({ children, sidebar }: LayoutProps) {
  return (
    <div className="flex gap-6">
      <main className="flex-1 min-w-0">
        {children}
      </main>
      {sidebar && (
        <aside className="w-72 shrink-0">
          <div className="sticky top-20 space-y-4">
            {sidebar}
          </div>
        </aside>
      )}
    </div>
  )
}
