---
name: babysit-stack
description: Babysit a git-spice branch stack in Zipline cloud from root parent to leaf without sitting on running CI: restack branches that need it, resolve conflicts with merge-conflicts, run Zipline PR babysit only until actionable work is done or CI is waiting, format and push with git-spice, then continue through the stack until every branch PR has passing latest-head required CI. Use when the user asks to babysit, restack, or drive an entire stacked git-spice PR chain rather than a single PR.
---

# Babysit Stack

## Overview

Drive a `git-spice` stack one branch at a time from the root parent branch to the leaf child branch. Each branch pass should do all currently actionable local or PR work, start CI if needed, and then move on instead of sitting on running checks.

This skill composes two required skills rather than replacing them:

- `$merge-conflicts`, provided by the host configuration
- `$zipline-pr-babysit`, provided by the host configuration

Read and apply both skills before executing this workflow. Also obey every applicable `AGENTS.md` for the `cloud` worktree you are operating in.

## Preflight

1. Confirm you are in a Zipline `cloud` worktree with a clean status, or record existing user changes and avoid overwriting them.
2. Run `git worktree list` and `git-spice ll -a` to identify the stack and which worktree, if any, owns each branch.
3. Determine the exact stack order from `git-spice`, root parent branch first and leaf child branch last. Do not infer stack order from commit overlap alone.
4. Resolve the open PR for each branch explicitly from that branch, following `$zipline-pr-babysit` PR-resolution rules.
5. Build a stack ledger with one row per branch: branch name, worktree path, PR number/URL, restack state, pushed head SHA, CI state, review state, and next action.

## Root-To-Leaf Branch Pass

Process branches root-to-leaf. When the leaf is complete, return to the root and start another pass. Stop only when every branch ledger row is `green` on the latest pushed head, or when the only remaining blockers across the stack are explicit human-only actions.

For each branch, perform this exact sequence:

1. Switch into that branch's own worktree. If it is checked out elsewhere, operate from that worktree rather than forcing a checkout in the current one.
2. Check whether `git-spice` reports the branch needs restacked. Prefer `git-spice ll -a` or `git-spice log long -a`, and use the exact status text shown by the installed version.
3. If the branch needs restacked, run `git-spice branch restack` from that branch. Do not push yet.
4. If restack stops on conflicts, invoke `$merge-conflicts` and follow it until the restack/rebase completes. Do not push from the merge-conflicts workflow.
5. Run `$zipline-pr-babysit` for the branch to address actionable CI failures, mergeability issues, and unresolved review feedback.
6. If `$zipline-pr-babysit` creates commits or reaches a point where CI has started, CI is running, or the only current branch work is waiting for check results, stop the single-PR waiting loop and return to this stack workflow. Commit and push any branch changes using `git-spice`, not plain `git push`.
7. Run the formatter with `BUILD_ON_HOST=1 bin/format` after the babysit step.
8. If formatting creates changes, inspect them, commit them with the required Codex co-author trailer, and push/update the branch with `git-spice`, not plain `git push`.
9. Record the new head SHA and CI/check state in the stack ledger.
10. Move to the next branch immediately.

## Non-Waiting CI Rule

Do not let the single-PR `$zipline-pr-babysit` routine sleep, poll, or suspend on running CI while there is another branch in the stack to process. Inside `$babysit-stack`, running or pending latest-head required CI means the current branch is temporarily `pending_ci`; advance to formatter handling and then the next branch.

Do not use this rule to skip actionable work. Before moving on, verify there are no unresolved non-outdated review threads that can be replied to or resolved by Codex, no failing checks with actionable logs, no draft/readiness action requested by the user, and no mergeability/restack problem for that branch.

## Formatting And Push Rules

- Use `BUILD_ON_HOST=1 bin/format` after each branch babysit step, even if the babysit step already ran a formatter earlier.
- If the formatter produces changes, create a new commit rather than amending.
- Every commit must include `Co-authored-by: Codex <codex@openai.com>`.
- Push/update branch PRs with `git-spice`. Use the local git-spice command that updates an existing branch PR, usually `git-spice branch submit` with non-interactive/no-web flags supported by the installed version. If the installed CLI exposes a more specific update/push command, use that.
- Never use plain `git push` for stack updates in this workflow.

## Stack Pass Completion

At the end of each root-to-leaf pass:

1. Re-read the stack ledger and refresh current PR state for every branch whose status may have changed.
2. If any lower branch was restacked or pushed, re-check children for `needs restack` before trusting their CI state.
3. If any branch has new actionable CI failure, review feedback, formatter change, or restack need, start another root-to-leaf pass.
4. If any branch only has running or pending CI, start another pass from the root and use elapsed time to check branches whose CI may have finished while other branches were processed.
5. If all branches have latest-head required CI green, no active change-request reviews, no unresolved non-outdated review threads, and clean mergeability, stop and report the stack is ready for human merge/queue action.
6. If the only remaining blockers are human-only review, approval, merge, or queue actions and no pending/gated CI can still change without that human action, stop and report those blockers.

## Guardrails

- Never merge PRs, enable auto-merge, add PRs to merge queue, or add reviewers.
- Never push before completing the restack/conflict-resolution step for the current branch.
- Never push from inside `$merge-conflicts`; only push after returning to this workflow and confirming the branch state.
- Do not run `bin/localdev`, `git fetch origin`, `kill`, or Docker stop/delete commands.
- Preserve user changes in dirty worktrees. Stop and ask if unrelated dirty files block switching, restacking, formatting, or pushing safely.
- Treat generated artifacts according to the owning repo rules and `$zipline-pr-babysit`; regenerate rather than hand-edit generated files.

## Reporting

Keep a concise ledger in updates and final reports:

- `branch`: branch name
- `pr`: PR number or URL
- `head`: latest pushed SHA when available
- `state`: `green`, `pending_ci`, `needs_restack`, `fixed_and_pushed`, `formatted_and_pushed`, `human_blocked`, or `blocked`
- `notes`: failures fixed, conflicts resolved, formatter changes, running CI, or human-only blocker

When stopping, state exactly why the loop is complete: all branches green, merged/closed, or only human-only blockers remain.
