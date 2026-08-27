---
name: qa-screenshot
description: Workflow for QA screenshot passes on a combined QA branch. Use when the user asks Codex to inspect branches merged into a local QA branch or worktree, capture localhost screenshots in Chrome for each PR's relevant app states, group screenshots by PR, and add those screenshots to the top of the GitHub PR descriptions rather than as comments. Also use when the user asks to do one app/auth context first, continue later with another app, or recover from Chrome file-upload permission issues while attaching screenshots.
---

# QA Screenshot

## Purpose

Capture manual-QA evidence for a temporary local QA branch by mapping merged branches to PRs, taking focused localhost screenshots in Chrome, and inserting the resulting GitHub-hosted images at the very top of each PR description.

## Guardrails

- Use Chrome for localhost screenshots when the user asks for `@chrome` or needs browser auth/session state.
- Do not run `bin/localdev`; the user runs localdev manually.
- Do not run formatters.
- Do not push the QA branch.
- Do not add PR comments for screenshot delivery. Update each PR description/body.
- Preserve existing PR body text, checklists, and attached files/images.
- When updating a cloud PR description, keep these boxes checked if present or required by repo policy:
  - `Database schema changes are backwards-compatible (if applicable)`
  - `Protobuf schema changes are backwards-compatible (if applicable)`
  - `Security checklist reviewed, no concerns`
  - `Security considerations documented below:`
- Before using authenticated app features, identify whether the current task needs a different logged-in user, account, role, tenant, or app context. Tell the user exactly which login/context is needed and wait when the current browser session cannot exercise the relevant features.

## Workflow

1. Identify the QA worktree, branch, and source branches:
   - Prefer the branch list the user provided.
   - Otherwise inspect merge commits with `git log --merges --oneline`, `git branch --contains`, and local branch names.
   - Use `gh pr view <branch> --json number,title,url,headRefName,body` or equivalent local metadata to map each branch to a PR.

2. Inspect each branch's change surface:
   - Compare each source branch against its base or against the QA branch merge parent.
   - Read changed files enough to understand user-visible behavior, app routes, page sections, and relevant states.
   - Group expected screenshots by PR. Skip backend-only or invisible changes only after saying why no screenshot is useful.

3. Confirm app/auth context before screenshots:
   - List the app(s), localhost URL(s), and login role(s) needed.
   - If multiple auth contexts are mutually exclusive, ask the user which one to do first.
   - If the user says to do one app first, capture only that app and finish by saying which app/context is ready next.
   - For any inaccessible feature, state the exact login, role, tenant, fixture, or localdev state needed.

4. Capture screenshots in Chrome:
   - Use the Chrome plugin workflow, not generic shell browser commands.
   - If the user says they are already logged in, inspect `browser.user.openTabs()` and claim the
     existing localhost app tab instead of opening a fresh tab. This preserves the authenticated
     Chrome profile state.
   - Navigate to localhost routes that exercise the changed behavior.
   - When the target page initially shows app bootstrap text such as `Loading user information...`,
     wait briefly and re-check the DOM before treating it as a login or localdev blocker.
   - Capture relevant page sections and relevant states, not random full-page proof.
   - Before capturing, identify the exact changed element, row, card, control, empty state, error message, or visual region the screenshot is meant to prove.
   - Frame the screenshot so the relevant element is fully visible with enough surrounding context to understand where it is. Do not crop off labels, table columns, popovers, dropdowns, side panels, or status text that are part of the behavior being shown.
   - If the first viewport or element screenshot focuses on the wrong area, scroll, resize, zoom out, collapse unrelated UI, or choose a tighter region and retake it. Prefer one well-framed targeted screenshot over a broad screenshot where the changed element is tiny or ambiguous.
   - Save screenshots under the QA worktree, for example:

```text
<qa-worktree>/qa-screenshots/<app-or-context>/pr-<number>-<short-branch>-<state>.png
```

### Chrome Screenshot Capture Notes

- In the Chrome extension runtime, read-only `evaluate(() => window.scrollTo(...))` may report stale
  viewport positions. Prefer real browser actions such as `tab.cua.keypress({ keys: ["Home"] })` and
  `tab.cua.scroll(...)`, then confirm the target text is visible before capturing.
- Chrome `tab.screenshot(...)` bytes may be JPEG even when the destination filename ends in `.png`.
  Check with `file`; convert to true PNG with `sips -s format png <input> --out <output>` when image
  inspection or upload expects PNG.
- If the Node-backed Chrome helper cannot write inside the worktree, write screenshot bytes to
  `/private/tmp` and copy them into `<qa-worktree>/qa-screenshots/...` from the shell.
- Do not trust the first crop. Open each saved image and retake any screenshot that shows the wrong
  section, such as a nearby similarly named field.

5. Review screenshots before attaching:
   - Open and inspect each saved image before attaching it.
   - Verify each image shows the changed UI state clearly and that the intended relevant element is fully included, legible, and visually central enough to be obvious.
   - Reject and retake any screenshot where the relevant element is cropped, hidden behind overlays, too small to inspect, below the fold, outside the captured region, or displaced by focus on an unrelated element.
   - If a screenshot depends on a fixture, route, record ID, or selected state, record that in the caption.
   - Group the final screenshot list by PR in the working notes and final response.

6. Upload screenshots and update PR bodies:
   - Upload each screenshot through GitHub so the PR body uses `https://github.com/user-attachments/assets/...` URLs.
   - Add a `## Manual QA Screenshots` section at the very top of each PR body.
   - Include concise captions and embedded images.
   - Use `gh pr edit <number> --body-file -` or an equivalent PR-body update mechanism after generating hosted image URLs.
   - Verify each PR body starts with `## Manual QA Screenshots`, contains the expected image URLs, and preserves required checklist boxes.

## GitHub Image Upload

Prefer GitHub's normal PR editor upload flow:

1. Open the PR in Chrome.
2. Edit the PR description, not a comment.
3. Use the editor's attachment control or paste an image into the description editor.
4. Wait for GitHub to insert a `github.com/user-attachments/assets/...` URL.
5. Extract that hosted URL and use it in a clean PR body update.

If file chooser upload fails with a permission error, tell the user:

`To enable file upload, go to chrome://extensions in Chrome, click Details under the Codex extension, and enable "Allow access to file URLs." See https://developers.openai.com/codex/app/chrome-extension#upload-files for details.`

When file upload is blocked, use the clipboard paste fallback:

1. Read the local PNG bytes.
2. Write the image bytes to Chrome's clipboard as `image/png`.
3. Focus the GitHub PR description textarea.
4. Paste the image.
5. Wait for GitHub to upload it and insert a hosted attachment URL.
6. Extract the URL.
7. Discard any messy draft placement and update the PR description cleanly with the screenshot section at the top.

Do not leave a screenshot in a comment box. If the upload path temporarily uses an editor draft only to create a hosted URL, do not submit that draft as a comment.

### Reliable GitHub Upload Pattern

If the PR description editor is hard to reach, it is acceptable to use the bottom draft comment
editor only as a temporary upload surface:

1. Scroll to the PR comment editor and click `Add files Paste, drop, or click to add files`.
2. Start `prTab.playwright.waitForEvent("filechooser")` before the click and call
   `chooser.setFiles([...absoluteScreenshotPaths])` in the same browser step.
3. Read `document.querySelector('textarea[name="comment[body]"]').value` to extract the inserted
   `https://github.com/user-attachments/assets/...` URLs; `textContent()` may be empty.
4. Do not submit the comment. Clear `textarea[name="comment[body]"]` after extracting the URLs.
5. Use `gh pr edit <number> --body-file <file>` to prepend the clean `Manual QA Screenshots`
   section to the real PR body, then verify with `gh pr view <number> --json body`.

## PR Body Shape

Use this section at the top of each PR description:

```markdown
## Manual QA Screenshots

<caption describing app, route, fixture/state, and behavior shown>

<img width="<width>" height="<height>" alt="<descriptive alt text>" src="<github-user-attachment-url>" />

## Reason for and Description of Change
...
```

If the original body has a different first section, still put `Manual QA Screenshots` first and keep the original content immediately after it. Preserve existing co-author trailers and all existing image links.

## Completion Report

Report:

- PRs updated, with links.
- Screenshot files saved locally, grouped by PR.
- Which app/auth context was completed.
- Which app/auth context remains, if any.
- Whether Chrome file upload was blocked and whether the clipboard fallback was used.
