import { createFileRoute, useLocation } from '@tanstack/react-router'

import { usePageTitle } from '@/hooks/use-page-title'
import { ExecutionDetailScreen } from '@/screens/executions/execution-detail-screen'
import { ExecutionsScreen } from '@/screens/executions/executions-screen'

export function getExecutionsRouteMode(pathname: string): 'list' | 'detail' {
  return /^\/executions\/[^/]+\/?$/.test(pathname) ? 'detail' : 'list'
}

export function getExecutionsRouteExecutionId(pathname: string): string | null {
  const match = pathname.match(/^\/executions\/([^/]+)\/?$/)
  return match?.[1] ? decodeURIComponent(match[1]) : null
}

export const Route = createFileRoute('/executions')({
  ssr: false,
  component: function ExecutionsRoute() {
    const location = useLocation()
    const executionId = getExecutionsRouteExecutionId(location.pathname)
    usePageTitle(executionId ? 'Execution trace' : 'Executions')
    if (executionId) return <ExecutionDetailScreen executionIdOverride={executionId} />
    return <ExecutionsScreen />
  },
})
