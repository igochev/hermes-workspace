import { createFileRoute } from '@tanstack/react-router'

import { isAuthenticated } from '../../server/auth-middleware'
import { buildProjectAutopilotScoutPrompt } from '../../server/autopilot-scout-prompts'
import {
  createHermesJob,
  pauseHermesJob,
  resumeHermesJob,
  updateHermesJob,
} from '../../server/hermes-jobs'
import { getProject, updateProject } from '../../server/projects-store'

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function scheduleForPreset(preset: 'manual' | 'daily' | 'weekly'): string | null {
  if (preset === 'daily') return '0 9 * * *'
  if (preset === 'weekly') return '0 9 * * 1'
  return null
}

function jobNameForProject(projectName: string): string {
  return `Autopilot Scout — ${projectName}`
}

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

export const Route = createFileRoute('/api/projects/$projectId/autopilot-schedule')({
  server: {
    handlers: {
      GET: ({ request, params }) => {
        if (!isAuthenticated(request)) return jsonResponse({ error: 'Unauthorized' }, 401)

        const project = getProject(params.projectId)
        if (!project) return jsonResponse({ error: 'Project not found' }, 404)

        return jsonResponse({
          projectId: project.id,
          autopilotPolicy: project.autopilotPolicy,
        })
      },

      POST: async ({ request, params }) => {
        if (!isAuthenticated(request)) return jsonResponse({ error: 'Unauthorized' }, 401)

        const project = getProject(params.projectId)
        if (!project) return jsonResponse({ error: 'Project not found' }, 404)

        try {
          const body = toRecord(await request.json().catch(() => ({})))
          const draftPolicy = {
            ...project.autopilotPolicy,
            ...toRecord(body.autopilotPolicy),
          }

          const hydratedProject = updateProject(project.id, {
            autopilotPolicy: draftPolicy,
          })

          if (!hydratedProject) return jsonResponse({ error: 'Project not found' }, 404)

          const nextPolicy = hydratedProject.autopilotPolicy
          const schedule = scheduleForPreset(nextPolicy.schedulePreset)
          const prompt = buildProjectAutopilotScoutPrompt({
            project: {
              id: hydratedProject.id,
              name: hydratedProject.name,
              repoPath: hydratedProject.repoPath,
              defaultBranch: hydratedProject.defaultBranch,
            },
            policy: nextPolicy,
            suggestionsEndpoint: '/api/autopilot-suggestions',
          })

          let jobId = nextPolicy.jobId
          let jobName = nextPolicy.jobName || jobNameForProject(hydratedProject.name)

          if (schedule) {
            if (!jobId) {
              const created = toRecord(
                await createHermesJob({
                  name: jobName,
                  prompt,
                  schedule,
                }),
              )
              jobId = typeof created.id === 'string' ? created.id : undefined
              jobName = typeof created.name === 'string' ? created.name : jobName
            } else {
              await updateHermesJob(jobId, {
                name: jobName,
                prompt,
                schedule,
              })
              await resumeHermesJob(jobId)
            }
          } else if (jobId) {
            await pauseHermesJob(jobId)
          }

          const saved = updateProject(hydratedProject.id, {
            autopilotPolicy: {
              ...nextPolicy,
              enabled: nextPolicy.schedulePreset !== 'manual',
              jobId,
              jobName,
            },
          })

          if (!saved) return jsonResponse({ error: 'Project not found' }, 404)

          return jsonResponse({
            projectId: saved.id,
            autopilotPolicy: saved.autopilotPolicy,
            schedule,
          })
        } catch (error) {
          return jsonResponse(
            { error: error instanceof Error ? error.message : 'Failed to save autopilot schedule' },
            500,
          )
        }
      },

      DELETE: async ({ request, params }) => {
        if (!isAuthenticated(request)) return jsonResponse({ error: 'Unauthorized' }, 401)

        const project = getProject(params.projectId)
        if (!project) return jsonResponse({ error: 'Project not found' }, 404)

        try {
          if (project.autopilotPolicy.jobId) {
            await pauseHermesJob(project.autopilotPolicy.jobId)
          }

          const updated = updateProject(project.id, {
            autopilotPolicy: {
              ...project.autopilotPolicy,
              enabled: false,
              schedulePreset: 'manual',
            },
          })

          if (!updated) return jsonResponse({ error: 'Project not found' }, 404)
          return jsonResponse({
            projectId: updated.id,
            autopilotPolicy: updated.autopilotPolicy,
          })
        } catch (error) {
          return jsonResponse(
            { error: error instanceof Error ? error.message : 'Failed to disable autopilot schedule' },
            500,
          )
        }
      },
    },
  },
})
