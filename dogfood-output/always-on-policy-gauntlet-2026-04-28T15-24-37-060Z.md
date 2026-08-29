# Always-On Policy Gauntlet Report

Verdict: ACCEPTED FOR SUPERVISED ALWAYS-ON POLICY ONLY
Gauntlet run id: always-on-policy-gauntlet-2026-04-28T15-24-37-060Z
Target repo: /home/d3ni3/.Hermes/workspace/projects/family_command_center-ABACUS
Target branch: test-hermes-workspace

## Project Policy Snapshot

Always-on enabled: no
Retry enabled: no
Retry max attempts per phase: 1
Retry cooldown minutes: 30
Notifications: enabled, digestOnly=true, notifyOn=blocked, retry_exhausted, unsafe_repo, pr_ready, cleanup_recommended
PR publishing: enabled=false, mode=manual, requireCleanRepo=true, requirePassingMergeTests=true
Cleanup: enabled=false, dryRun=true, retainMergedBranchDays=30, retainLaneStashes=true

## Guardrail Proofs

Retry disabled/default behavior: recommend_retry
Retry disabled shouldRetry: no
Retry disabled evidence: policy=disabled; retry=disabled; operator action required before automatic retry

Simulated stale job decision: schedule_retry
Simulated stale shouldRetry: yes
Simulated stale evidence: finding=mission_stale; retryCount=0/1; cooldownMinutes=30; repo=safe

Retry exhaustion decision: retry_exhausted
Retry exhaustion evidence: retryCount=1/1; max attempts exhausted; notify=retry_exhausted

Unsafe repo refusal: unsafe_repo
Unsafe repo evidence: repo=unsafe; dirty repo refused; no retry scheduled

PR preflight: manual_required
PR preflight evidence: branch=test-hermes-workspace; base=test-hermes-workspace; aheadBehind=ahead 15, behind 0; remote=origin; mode=manual; no publish executed
PR command: none

Cleanup dry-run: true
Cleanup dry-run planned actions:
- git branch -d mission/1a44d0b2-sequential-lane-gauntlet-2 (destructive=no)
- git branch -d mission/38c30749-sequential-lane-gauntlet-3 (destructive=no)
- git branch -d mission/ac6918e0-single-lane-e2e-code-delivery (destructive=no)
- git branch -d mission/b31ad72d-single-lane-e2e-code-delivery (destructive=no)
- git branch -d mission/c6c218a8-sequential-lane-gauntlet-1 (destructive=no)
- git stash drop stash@{0} (destructive=no)
- git stash drop stash@{1} (destructive=no)
- git stash drop stash@{2} (destructive=no)
- git stash drop stash@{3} (destructive=no)
- git stash drop stash@{4} (destructive=no)
Cleanup blockers:
- cleanup policy disabled

## Digest Text Excerpt

```text
Lane Escalations
retry disabled/default behavior: recommend_retry
retry scheduled: schedule_retry
retry exhausted: retry_exhausted
unsafe repo: unsafe_repo
PR ready/preflight: manual_required
cleanup_recommended: dry-run only
```

## Safety Proof

Manual phase mutation calls: []
Destructive cleanup executed: no
PR publish executed: no
Destructive cleanup env: HERMES_ALWAYS_ON_POLICY_ENABLE_DESTRUCTIVE_CLEANUP=false
PR publish env: HERMES_ALWAYS_ON_POLICY_ENABLE_PR_PUBLISH=false
