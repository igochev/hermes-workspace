import { createFileRoute } from '@tanstack/react-router'
import BackendUnavailableState from '@/components/backend-unavailable-state'
import { usePageTitle } from '@/hooks/use-page-title'
import { getUnavailableReason } from '@/lib/feature-gates'
import { useFeatureAvailable } from '@/hooks/use-feature-available'
import { JobsScreen } from '@/screens/jobs/jobs-screen'

export const Route = createFileRoute('/jobs')({
  ssr: false,
  component: function JobsRoute() {
    usePageTitle('Scheduled Jobs')
    if (!useFeatureAvailable('jobs')) {
      return (
        <BackendUnavailableState
          feature="Scheduled Jobs"
          description={getUnavailableReason('Scheduled Jobs')}
        />
      )
    }
    return <JobsScreen />
  },
})
