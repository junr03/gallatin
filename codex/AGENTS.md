# Codex configuration workspace

## Scope

This directory contains portable Codex configuration, agents, skills, rules,
and supporting scripts.

## Configuration principles

- Keep shared configuration declarative and portable across hosts.
- Put machine-specific paths, notifications, and runtime locations in host
  overrides.
- Treat authentication, histories, caches, sessions, SQLite state, memories,
  and plugin caches as runtime state; do not modify or manage them unless
  explicitly requested.
- Preserve existing user changes and inspect diffs before finalizing edits.

## Skills and agents

- Treat `skills/` and `agents/` as user-owned configuration.
- Do not modify `skills/.system` or plugin-managed files unless explicitly
  requested.
- Prefer extending existing agents or skills over duplicating their behavior.

## Default delivery for code changes

- When the user asks you to explore, investigate, prototype, fix, implement, or
  otherwise work toward a code change in any Git project, treat an opened pull
  request as the default outcome.
- Unless the user explicitly says not to open a pull request, carry the work
  through implementation, validation, branch creation, commit, push, and pull
  request creation. Follow the repository's pull request template and its
  normal draft or ready-for-review convention.
- Do not stop at analysis or a local diff while a safe, relevant path to a pull
  request remains.
- Keep purely read-only questions and reviews non-mutating when they do not ask
  for, or clearly lead to, a code change.
- If a pull request cannot be opened, leave the work ready to publish when
  possible and report the exact blocker.

## Validation

- Validate configuration syntax and relevant generated files after changes.
- Run Nix checks when Nix is available; otherwise clearly report that validation
  was not run.
- Report the exact files changed, commands run, and any remaining limitations.

## Safety

- Never expose secrets from `auth.json`, credentials, tokens, or runtime logs.
- Do not delete, reset, or overwrite broad directories or unrelated files.
- Ask before making changes outside this workspace or performing destructive
  operations.

## Writing style

For prose artifacts, invoke `$write-like-a-human` before drafting or revising:

- PR descriptions
- RFCs and PRDs
- Documentation and docstrings
- Emails and chat messages

Do not apply it to source code, commands, structured data, quoted text, or
content the user explicitly asks to preserve.
