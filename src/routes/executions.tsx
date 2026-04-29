import { createFileRoute } from '@tanstack/react-router'

import { usePageTitle } from '@/hooks/use-page-title'
import { ExecutionsScreen } from '@/screens/executions/executions-screen'

export const Route = createFileRoute('/executions')({
  ssr: false,
  component: function ExecutionsRoute() {
    usePageTitle('Executions')
    return <ExecutionsScreen />
  },
})
