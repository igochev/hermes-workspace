# Hermes Workspace — Profiles & Workflow Re-architecture (2026-04-25)

> **Scope:** Documents the profile architecture correction, new Planner profile, the two-phase Launch Build pipeline design, and the future auto-approval/Review roadmap.
>
> **Continuation:** After reading this, see the roadmap (2026-04-21) and continuation handoff (2026-04-22) for the existing Mission Control state. This doc captures the new architectural decisions and what was shipped on 2026-04-24/25.

## 1. Profile architecture correction (shipped 2026-04-25)

### Problem
The initial **Builder** profile was created as a shallow config overlay, not a true first-class Hermes profile. This caused:
- Conflicts with Hermes Gateway routing
- Inability to configure Builder's model/provider independently from Main
- No independent gateway, auth, or runtime state

### Fix
All profiles must now be created as **first-class Hermes profiles** with:
- `~/.hermes/profiles/<name>/config.yaml` — full independent config
- `~/.hermes/profiles/<name>/.env` — own API keys
- `~/.hermes/profiles/<name>/auth.json` — own auth credentials
- `~/.hermes/profiles/<name>/gateway_state.json` — own gateway runtime state
- Full directory structure: `bin/`, `cache/`, `checkpoints/`, `cron/`, `logs/`, `memories/`, `pastes/`, `platforms/`, `sandboxes/`, `sessions/`, `skills/`

**Lesson permanently saved to memory** — never repeat the original Builder mistake.

### Current profile inventory (live, 2026-04-25)

| Profile | Model | Provider | Gateway | Cost Tier | Role |
|---------|-------|----------|---------|-----------|------|
| `◆default` (Main) | `deepseek-v4-flash` | opencode-go | ✅ running | Mid | **CEO/Architect** — strategy, work items, oversight |
| `builder` | `gpt-5.3-codex` | openai-codex | ✅ running | 💰 **Flagship** | **Builder** — TDD implementation, code execution |
| `planner` | `gpt-5.4` | openai-codex | ✅ running | 💰 **Flagship** | **Planner** — plan author, acceptance criteria, slice breakdown |
| `researcher` | `openai/gpt-4.1` | openrouter | ✅ running | 🆓 Cheap | **Researcher** — web recon, comparisons, feasibility checks |

### Profile creation notes
- **Discord:** Only `default` (Main) and `builder` have Discord configured. `planner` and `researcher` are CLI-only / workspace-subagent profiles. To add Discord to any profile, it needs its own Discord bot token (separate app).
- **Auth:** `planner` shares `openai-codex` OAuth tokens with `builder` (same ChatGPT Plus account). Each profile gets its own `auth.json`.

## 2. Dashboard root fix (shipped 2026-04-24/25)

### Root cause
Hermes dashboard root (`http://127.0.0.1:9119/`) was returning HTTP 500 because the Vite frontend (`web/`) had never been built in the checkout — `hermes_cli/web_dist/index.html` was missing.

### Fix
```bash
cd ~/hermes-agent/web && npm install && npm run build
# Outputs to ../hermes_cli/web_dist/ (configured in vite.config.ts)
```
Then restart `hermes-dashboard.service`.

### Impact
- Dashboard root → **HTTP 200** with `window.__HERMES_SESSION_TOKEN__` injected
- Hermes Workspace auto-detected the fix: `dashboard.available: true`, `mode: zero-fork`
- Sessions, jobs, skills, config all restored to full availability

### Saved as skill
`devops/hermes-dashboard-ui-build` — for future rebuilds.

## 3a. Slice A — Phase routing update (shipped 2026-04-25)

### Changes made
The `research` phase routing default was changed from `researcher` → `planner` across the entire codebase:

**UI changes:**
- "Plan with Researcher" button label → "Plan with Planner" (`work-item-detail-screen.tsx`)
- Routing policy help text → "Research/planning phase routes to Planner profile by default" (`project-detail-screen.tsx`)
- Routing placeholder → `planner` (`project-detail-screen.tsx`)

**Test updates (30 tests passing):**
- `work-item-launch.test.ts` — updated phase profile defaults (6 tests ✅)
- `conductor-launch.test.ts` — updated routing instructions (3 tests ✅)
- `projects-store.test.ts` — updated project defaults (2 tests ✅)
- `conductor-phase-profiles.test.ts` — updated normalized expectations (4 tests ✅)
- `work-item-detail-screen.test.ts` — updated label expectation (8 tests ✅)
- `project-detail-screen.test.ts` — updated policy summaries (7 tests ✅)

**Build:** `pnpm build` — ✅ passed
**Restart:** `hermes-workspace.service` — ✅ active
**Live verification:** Dashboard `zero-fork` mode, all capabilities healthy

### Impact
- "Launch Build" → routes to **Planner** (gpt-5.4) for the research/planning phase
- **Researcher** is no longer the phase-mapped default for research — now ad-hoc research support
- Users can still override per-project in the Workflow Policy panel
- No data migration needed — per-project phaseProfiles can be updated via UI

## 3. New pipeline architecture: two-phase Launch Build

### Current workflow (pre-2026-04-25)
```
Inbox → [Send to Planning] → Active(Research) → [Plan with Researcher] → Ready
→ [Launch Build] → Active(Build) → [Request Review] → Approve → Deploy → Done
```
Two separate launches: first "Plan with Researcher", then "Launch Build".

### Target workflow (post-implementation)
```
Inbox → Main prepares → Ready → [Launch Build]
  │
  │  ONE click triggers AUTOMATIC two-phase pipeline:
  │
  ├── Phase 1: Planning (research phase)
  │   Profile: Planner (gpt-5.4 flagship)
  │   Output: docs/plans/*.md + acceptance criteria
  │
  ├── Phase 2: Build (build phase, auto-triggered)
  │   Profile: Builder (gpt-5.3-codex flagship)
  │   Input: the plan from Phase 1
  │   Output: implemented code, tests, PR
  │
  └── Result: Request Review
```

### Phase-to-profile routing (updated)
| Phase | Profile | Notes |
|-------|---------|-------|
| `research` → `planner` | **Planner** (was: Researcher) | Plans, writes docs/plans/*, defines acceptance criteria |
| `build` → `builder` | **Builder** (unchanged) | Implements per plan, TDD |
| `review` | *(manual approval)* | CEO reviews against plan's acceptance criteria |
| `deploy` | *(manual approval)* | Final governance gate before done |

### UI label changes
- `research` phase launch button: **"Plan with Planner"** (was: "Plan with Researcher")
- `build` phase launch button: **"Launch Build"** (unchanged)
- The "Launch Build" button for `ready` items triggers the **full two-phase pipeline**

### Researcher's new role
**Demoted from phase-mapped profile to ad-hoc research support.**
- No longer the default planning profile
- Used ad-hoc by Main (Architect) or Planner for:
  - Web reconnaissance ("What's the latest API for X?")
  - Technology comparisons ("Compare approach A vs B")
  - Best practices research
  - Feasibility checks
- **Stays on cheap gpt-4.1** — no flagship cost for research

## 4. Implementation plan

### Slice A — Update phase routing defaults
- Change project `phaseProfiles` default placeholder from `researcher` → `planner`
- Update UI label from "Plan with Researcher" → "Plan with Planner"
- Update test defaults

### Slice B — Two-phase launch orchestration (shipped 2026-04-25)
- Modified `launchWorkItemIntoConductor` in `src/server/work-item-launch.ts`:
  - `isTwoPhaseLaunchCandidate()` detects when a `ready` work item is launched for `build`
  - `buildTwoPhaseLaunchGoal()` generates a combined goal with Phase 1 (Plan by Planner) and Phase 2 (Build by Builder)
  - Launch as a single orchestrated mission with two sequential phases in the goal prompt
  - Both `planner` and `builder` profiles are resolved and included in phase profiles
- Added `planFilePath` to work item record (output from Planner, input to Builder)
- Builder's goal includes "Read and follow the plan from Phase 1 at: {planFilePath}"
- History records "Launched two-phase pipeline (Phase 1: planner plan → Phase 2: build)"
- 6 tests passing for two-phase launch (work-item-launch.test.ts), 101 total
- UI enhancements:
  - Operator guidance: "Planning is complete. Launch Build triggers the two-phase pipeline (Planner writes a plan, then Builder implements per the plan)."
  - Plan File Path surfaced in Mission Control Summary and Delivery Evidence panels
  - Launch toast shows "Launched two-phase pipeline (Planner → Builder). Plan path: ..." for two-phase launches

### Slice C — Risk level field for future auto-approval (shipped 2026-04-25)
- Added `riskLevel: 'low' | 'medium' | 'high'` to work item model
- Default: `medium`
- Low-risk items can be auto-approved by Main (Architect) after preparation
- UI: risk level select on create form, badge on detail header, tag on board cards
- API: POST and PATCH both accept `riskLevel`

### Slice D — Update docs/plans state (shipped 2026-04-25)
- Updated roadmap (2026-04-21) with Slice A/B/C completion snapshots
- Updated continuation handoff (2026-04-22) with Slice C completion + refreshed priority queue
- This document (2026-04-25) serves as the architecture record

### Slice E — riskLevel automation (shipped 2026-04-25)
- Wired `riskLevel` into board sorting — low-risk items sort lower within same attention + priority tier
- Wired `riskLevel` into review auto-approval — low-risk items auto-approve through review regardless of project policy
- Wired `riskLevel` into operator guidance — ready items mention auto-approval for low risk
- 2 new tests, 104 total passing

## 5. Future roadmap (conscious decisions)

### 5.1 Auto-approval for low-risk work items (shipped 2026-04-25)
- **When:** Shipped as part of Slice E
- **How:** Main (Architect/me) evaluates risk when preparing the work item. If `riskLevel=low`, the review is auto-approved regardless of project policy. Low-risk items also sort lower on the project board.
- **Why:** Reduces CEO overhead for trivial/bugfix/documentation changes.

### 5.2 Planner as Reviewer
- **When:** After the two-phase pipeline is stable.
- **How:** After Builder finishes, the system spawns Planner again with: "Review Builder's output against the plan you wrote at X. Approve or return for rework with comments."
- **Why:** Planner knows the plan best. No separate Reviewer profile needed. Keeps profile count manageable.
- **Design note:** Planner's review output becomes the approval decision that either advances to deploy or returns to build.

### 5.3 No dedicated Reviewer profile (for now)
- Decision: Keep review as **manual CEO approval** + **future Planner-as-Reviewer**
- A separate Reviewer profile would require another flagship model cost and more maintenance
- The Planner's acceptance criteria in the plan serve as the review checklist

### 5.4 Researcher stays on cheap model
- Researcher is explicitly **not** getting a flagship upgrade
- gpt-4.1 via OpenRouter is sufficient for web research, comparisons, and feasibility checks
- If Researcher needs to produce higher-quality analysis, it can delegate to Planner

## 6. Current live state (2026-04-25)

All four profiles running:
```
Profile          Model                        Gateway      Alias
───────────────────────────────────────────────────────────────
◆default         deepseek-v4-flash            running      —
 builder         gpt-5.3-codex                running      builder
 planner         gpt-5.4                      running      —
 researcher      openai/gpt-4.1               running      researcher
```

Dashboard healthy at `http://127.0.0.1:9119/` (HTTP 200 with session token).
Workspace healthy at `http://localhost:3456` (dashboard mode, `zero-fork`).
**Slice F shipped and verified:** lifecycle actions now include cancel/backward transitions, and cancel-without-reason returns HTTP 400 validation.
**Slice G shipped and verified:** acceptance criteria now support per-criterion check-off with `criteriaStatus`, live progress indicator, and PATCH partial-update hardening for safe criteria toggles.
**Current regression status:** 122/122 tests passing (`pnpm vitest run`). All slices A through G shipped.

## 7. Slice B implementation details

### Trigger condition
The two-phase pipeline is triggered when:
- Work item `status === 'ready'` AND launch `phase === 'build'`
- This happens when the operator clicks "Launch Build" on a ready item
- The UI sends `phase: workItem?.phase ?? 'build'` — after `mark_ready`, `phase` is `undefined`, so it defaults to `'build'`

### How the pipeline works
1. **Single mission, two-phase goal:** A single Conductor mission is launched with a combined goal prompt
2. **Phase 1 — Plan:** The orchestrator (running as Planner profile) explores the codebase, understands acceptance criteria, and writes a plan to `docs/plans/{slug}-{workItemId}-plan.md`
3. **Phase 2 — Build:** The orchestrator reads the plan, then spawns Builder profile workers for implementation using TDD
4. **Phase profiles:** Both `research → planner` and `build → builder` are passed in `phaseProfiles` so ACP subprocess routing delegates correctly

### Key files
- `src/server/work-item-launch.ts` — `isTwoPhaseLaunchCandidate()`, `buildTwoPhaseLaunchGoal()`, two-phase path in `launchWorkItemIntoConductor()`
- `src/server/work-items-store.ts` — `planFilePath` field on `WorkItemRecord`
- `src/screens/projects/work-item-detail-screen.tsx` — Plan File Path display, two-phase toast, updated operator guidance
- `src/server/work-item-launch.test.ts` — 6 tests including two-phase pipeline test
