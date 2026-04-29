import { createFileRoute } from '@tanstack/react-router'

import { usePageTitle } from '@/hooks/use-page-title'
import { ExecutionDetailScreen } from '@/screens/executions/execution-detail-screen'

export const Route = createFileRoute('/executions/$executionId')({
  ssr: false,
  component: function ExecutionDetailRoute() {
    usePageTitle('Execution trace')
    return <ExecutionDetailScreen />
  },
})
