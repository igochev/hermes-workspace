import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../server/auth-middleware'
import { evaluateProfileReadiness } from '../../server/profile-readiness'
import { getProject } from '../../server/projects-store'
import { listProfiles } from '../../server/profiles-browser'
import { getWorkItem } from '../../server/work-items-store'

export const Route = createFileRoute('/api/projects/$projectId/profile-readiness')({
  server: {
    handlers: {
      GET: ({ request, params }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }

        const project = getProject(params.projectId)
        if (!project) {
          return json({ ok: false, error: 'Project not found' }, { status: 404 })
        }

        const url = new URL(request.url)
        const workItemId = url.searchParams.get('workItemId')?.trim() || null
        const workItem = workItemId ? getWorkItem(workItemId) : null

        let availableProfiles: Array<string> | null = null
        let profileDiscoveryAvailable = true
        let profileDiscoveryError: string | undefined

        try {
          availableProfiles = listProfiles().map((profile) => profile.name)
        } catch (error) {
          profileDiscoveryAvailable = false
          profileDiscoveryError = error instanceof Error ? error.message : String(error)
        }

        const report = evaluateProfileReadiness({
          project,
          workItem: workItem?.projectId === project.id ? workItem : null,
          availableProfiles,
        })

        return json({
          ok: true,
          projectId: project.id,
          workItemId: workItem?.projectId === project.id ? workItem.id : undefined,
          profileDiscoveryAvailable,
          profileDiscoveryError,
          report,
        })
      },
    },
  },
})
