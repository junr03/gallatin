---
name: break-into-small-prs
description: Create a read-only plan for splitting a large PR, branch, or diff into small reviewable PRs or a stacked PR sequence. Use when asked how to break up a large review, design a PR stack, or evaluate whether a proposed split is reviewable; this skill only proposes a plan and never implements the split.
---

# Break Into Small PRs

## Purpose

Create a read-only plan for breaking a large PR, branch, or diff into small reviewable PRs. The output is a proposed stack only: do not edit files, create branches, push, submit PRs, run formatters, or run mutating code generation.

Use these source principles:

- Google Small CLs: a good change is self-contained, includes related tests, keeps the system working after merge, and should not add unused APIs without a same-CL usage. Source: https://google.github.io/eng-practices/review/developer/small-cls.html
- Graphite stacked PRs: each stacked PR should be understandable as an independent atomic change, reviewed from the bottom of the stack upward. Source: https://graphite.com/docs/best-practices-for-reviewing-stacks
- Mergify trunk-based guidance: long-lived branches should be split into short-lived PRs that can ship behind flags, hidden UI, or abstraction until the full feature is ready. Source: https://mergify.com/learn/trunk-based-development/vs-feature-branch/

## Guardrails

- Stay read-only. Planning commands may inspect PRs, branches, diffs, docs, and tests; do not mutate repo-tracked files or remote state.
- Do not execute the split. Do not create, rebase, restack, submit, close, merge, or push branches.
- Do not propose generated-only PRs unless generated artifacts are paired with the source contract change that produces them.
- Do not propose testless behavior PRs. Each behavior slice should include its relevant tests or explicitly call out a test gap.
- Do not split into pure layers by default. API-only then frontend-only is usually a bad split when the reviewer cannot see how the API is used.
- Keep existing behavior working after every PR. Incomplete new functionality may be hidden behind a flag, hidden option, unreachable route, or final activation PR.

## Inspection Workflow

1. Read every applicable repo instruction file before inspecting project files.
2. Inspect the actual change, not just the current PR description:
   - PR metadata, title/body, base/head, changed file list, additions/deletions.
   - Commit list and commit subjects.
   - Diff stats and directory stats.
   - Relevant source files, tests, schemas, generated-contract files, migrations, docs, and rollout notes.
3. Identify the real capabilities in the diff. Group by user-visible or operational behavior, not by implementation layer.
4. Map each capability across contracts, persistence, backend/API, frontend, generated artifacts, tests, and rollout/activation.
5. Identify dependency order and compatibility constraints:
   - schema or contract expansion before callers that require it,
   - hidden support before activation,
   - refactors before behavior only when the refactor meaningfully simplifies review,
   - cleanup after activation only when old paths are no longer needed.
6. Propose the fewest PRs that keep each PR independently understandable and small enough to review.

## Split Heuristics

Prefer vertical feature slices:

- A PR should represent one reviewable capability or compatibility step.
- Include the API/backend/frontend/test pieces together when they explain one behavior.
- If a lower-layer change must land before usage, add the smallest safe usage, keep it hidden, or explain why it is independently reviewable.
- Put large behavior-preserving refactors in their own PR before the feature slice that benefits from them.
- Put final exposure, option enablement, config flip, or feature-flag enablement in a small activation PR after hidden support is complete.

Reject or revise a proposed slice when:

- the PR adds a public API, type, field, or endpoint with no usage or validation context;
- the PR only updates frontend code for an API that does not exist downstack;
- the PR leaves current production behavior broken between merges;
- the PR mixes an unrelated refactor with product behavior;
- the PR is mostly generated artifacts without the source change;
- the reviewer must understand several future PRs before the current PR makes sense.

## Output

Return a plan only. Do not offer to implement it unless the user separately asks after the plan is complete.

Use this structure unless the user asks for another format:

```markdown
# Proposed PR Stack

## Summary
<Short explanation of the split principle and total PR count.>

## Stack
1. **PR title**
   - Intent:
   - Include:
   - Exclude:
   - Post-merge state:
   - Validation:
   - Why reviewable:

## Compatibility and Rollout
- <How current functionality stays working and how incomplete behavior stays hidden.>

## Assumptions
- <Important defaults or unresolved product decisions.>
```

## Calibration Example

For a large carrier feature like Freight Forwarder shipment support, prefer vertical slices such as package quantity, label-less shipment tolerance, hidden basic carrier create, attachments/notification, carrier-specific UX/validation, and final carrier activation. Do not split it as "backend API first" and "frontend later" unless each PR still has an immediate usage, hidden path, or independently reviewable contract reason.
