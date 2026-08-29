# Hermes Workspace Production Dogfood Report

- Verdict: PASS
- Workspace base URL: http://localhost:3456
- Workspace cwd: /home/d3ni3/.Hermes/workspace/projects/hermes-workspace
- Target repo: /home/d3ni3/.Hermes/workspace/projects/family_command_center-ABACUS
- Target branch: test-hermes-workspace
- Target commit: 62ff902
- Dogfood project id: production-dogfood-family-command-center-abacus
- Screenshot: /home/d3ni3/.Hermes/workspace/projects/hermes-workspace/dogfood-output/production-dogfood-project-detail.png

## API calls
- GET /api/projects → 200
- GET /api/profiles/list → 200
- PATCH /api/projects/production-dogfood-family-command-center-abacus → 200
- GET /api/projects/production-dogfood-family-command-center-abacus → 200
- GET /api/projects/production-dogfood-family-command-center-abacus/profile-readiness → 200

## UI clicks
- Refresh
- Profile Readiness → Configure profile mappings
- Supervisor Profile → builder
- Autopilot Scout Profile → planner
- Save Profile & Workflow Policy
- Capture rough idea
- Create rough idea empty-title validation
- Create rough idea with title
- Open created work item detail
- Work item detail → Refresh
- Work item detail → Sync Execution
- Work item detail → Profile Preflight observed
- Work item detail → Open Conductor link verified
- Chat sidebar → session refresh status observed
- Chat sidebar → New chat button visible
- Dashboard → Projects summary card
- Dashboard → Attention work item card (no open attention data present)
- Open Project Autopilot
- Project Autopilot → Save Autopilot Schedule
- Project Autopilot → Disable schedule
- Projects list → Refresh
- Projects list → Approvals Inbox
- Approvals Inbox → Refresh
- Projects list → Autopilot Inbox
- Autopilot Suggestions → Refresh
- Autopilot Suggestions → Status filter New
- Autopilot Suggestions → Risk filter Low

## Console / network errors
None
