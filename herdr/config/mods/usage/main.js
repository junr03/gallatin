// Usage: Claude Code and Codex plan limits, shown as progress bars.
// Each figure is what Claude Code and Codex show for their plan windows, read with the
// login each one already keeps on this Mac (Claude: the Keychain item
// "Claude Code-credentials"; Codex: ~/.codex/auth.json). Tokens stay in this mod's memory.
// Each service is asked at most every five minutes. After a failure the wait doubles, up to an
// hour, and a Retry-After header from the server is honored. Every view shares one cache, so
// several panes do not multiply the requests.

import { View, div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { exec, home, readTextFile, theme } from "herdr";

const TICK_MS = 60_000; // how often the view checks whether a service is due
const REFRESH_MS = 5 * 60_000; // normal wait between requests to one service
const MAX_BACKOFF_MS = 60 * 60_000; // ceiling for the wait after repeated failures

// Module-level so every Usage view reads the same results and joins the same request.
const shared = {
  claude: { live: null, nextAt: 0, failures: 0 },
  codex: { live: null, nextAt: 0, failures: 0 },
  inFlight: null,
};

// Seconds from a Retry-After header, or null.
function retryAfterMs(r) {
  const s = Number(r.headers.get("retry-after"));
  return Number.isFinite(s) && s > 0 ? s * 1000 : null;
}

// "resets in 2h 10m" from an ISO time or a unix time in seconds.
function resetsIn(when) {
  if (when == null) return "";
  const ms = typeof when === "number" ? when * 1000 : Date.parse(when);
  if (Number.isNaN(ms)) return "";
  const mins = Math.round((ms - Date.now()) / 60000);
  if (mins <= 0) return "resets now";
  if (mins < 60) return `resets in ${mins}m`;
  if (mins < 60 * 48) return `resets in ${Math.floor(mins / 60)}h ${mins % 60}m`;
  return `resets in ${Math.round(mins / 1440)}d`;
}

const bar = (pct, width = 16) => {
  const p = Math.min(Math.max(pct ?? 0, 0), 100);
  const filled = Math.round((p / 100) * width);
  return "█".repeat(filled) + "░".repeat(width - filled);
};

// Claude Code's plan windows. The login is Claude Code's own; nothing here writes it.
async function claudeLive() {
  const raw = await exec("security", ["find-generic-password", "-s", "Claude Code-credentials", "-w"], { timeout: 15_000 });
  if (raw.code !== 0) return { error: "No Claude Code login in the Keychain" };
  let token;
  try {
    token = JSON.parse(raw.stdout).claudeAiOauth?.accessToken;
  } catch {
    return { error: "Claude Code login unreadable" };
  }
  if (!token) return { error: "No Claude Code login in the Keychain" };
  const r = await fetch("https://api.anthropic.com/api/oauth/usage", {
    headers: { Authorization: `Bearer ${token}`, "anthropic-beta": "oauth-2025-04-20" },
  });
  if (!r.ok) {
    return {
      error: r.status === 401 ? "Claude Code login expired: open Claude Code once"
        : r.status === 429 ? "Claude usage rate limited; retrying later"
        : `Claude usage HTTP ${r.status}`,
      rateLimited: r.status === 429,
      retryAfterMs: retryAfterMs(r),
    };
  }
  const d = await r.json();
  const windows = [
    { label: "5-hour", pct: d.five_hour?.utilization, resetsAt: d.five_hour?.resets_at },
    { label: "Weekly", pct: d.seven_day?.utilization, resetsAt: d.seven_day?.resets_at },
  ].filter((w) => w.pct != null);
  return { windows, error: null };
}

// Codex's plan windows, or its spend limit when the plan reports no windows.
async function codexLive() {
  const text = await readTextFile(`${home()}/.codex/auth.json`);
  if (!text) return { error: "No Codex login found" };
  let tokens;
  try {
    tokens = JSON.parse(text).tokens;
  } catch {
    return { error: "Codex login unreadable" };
  }
  if (!tokens?.access_token) return { error: "No Codex login found" };
  const r = await fetch("https://chatgpt.com/backend-api/wham/usage", {
    headers: { Authorization: `Bearer ${tokens.access_token}`, "ChatGPT-Account-Id": tokens.account_id ?? "" },
  });
  if (!r.ok) {
    return {
      error: r.status === 401 ? "Codex login expired: open Codex once"
        : r.status === 429 ? "Codex usage rate limited; retrying later"
        : `Codex usage HTTP ${r.status}`,
      rateLimited: r.status === 429,
      retryAfterMs: retryAfterMs(r),
    };
  }
  const d = await r.json();
  const rl = d.rate_limit ?? {};
  const windows = [
    { label: "Primary", w: rl.primary_window },
    { label: "Secondary", w: rl.secondary_window },
  ]
    .filter((x) => x.w)
    .map((x) => ({ label: x.label, pct: x.w.used_percent, resetsAt: x.w.reset_at }));
  const spend = d.spend_control?.individual_limit;
  if (!windows.length && spend) {
    windows.push({ label: "Spend limit", pct: spend.used_percent, resetsAt: spend.reset_at });
  }
  return { windows, error: null };
}

// Asks one service for usage if its wait has passed, then stores the result.
async function poll(state, fetchLive) {
  if (Date.now() < state.nextAt) return;
  let r;
  try {
    r = await fetchLive();
  } catch (e) {
    r = { error: String(e.message ?? e) };
  }
  const ok = !r.error;
  state.failures = ok ? 0 : state.failures + 1;
  const backoff = ok ? REFRESH_MS : Math.min(REFRESH_MS * 2 ** state.failures, MAX_BACKOFF_MS);
  state.nextAt = Date.now() + Math.max(backoff, r.retryAfterMs ?? 0);
  // A rate-limited reply keeps the last windows instead of replacing them with an error.
  if (r.rateLimited && state.live?.windows?.length) return;
  state.live = r;
}

// Runs at most one poll pass at a time; concurrent callers wait on the same pass.
function pollDue() {
  shared.inFlight ??= Promise.all([
    poll(shared.claude, claudeLive),
    poll(shared.codex, codexLive),
  ]).finally(() => {
    shared.inFlight = null;
  });
  return shared.inFlight;
}

export default class Usage extends View {
  init(_props, cx) {
    this.refresh(cx);
    cx.timer.every(TICK_MS, (cx) => this.refresh(cx));
  }

  // Every tick re-renders this view from the shared cache, so panes stay in step.
  refresh(cx) {
    cx.spawn(async (cx) => {
      await pollDue();
      cx.notify();
    });
  }

  limitRows(t, id, live) {
    if (!live) return div().text_size(11).text_color(t.dim).child("Checking limits…");
    if (live.error) return div().text_size(11).text_color(t.blocked).child(live.error);
    if (!live.windows?.length) return div().text_size(11).text_color(t.dim).child("No limit windows reported");
    return v_flex().id(id).gap(5).children(live.windows.map((w) =>
      v_flex().gap(1).child(
        h_flex().justify_between().text_size(12)
          .child(div().text_color(t.muted).child(w.label))
          .child(div().text_color(t.foreground).child(`${Math.round(w.pct)}%`))
      ).child(
        div().text_size(11).text_color(t.dim).child(`${bar(w.pct)}  ${resetsIn(w.resetsAt)}`)
      )
    ));
  }

  section(t, id, title, live) {
    return v_flex().id(id).gap(5).child(
      div().text_size(13).font_semibold().child(title)
    ).child(this.limitRows(t, `${id}-limits`, live));
  }

  render(cx) {
    const t = theme();
    return v_flex().size_full().p(10).gap(10).text_color(t.foreground).overflow_y_scrollbar()
      .child(div().px(4).text_size(12).font_semibold().text_color(t.muted).child("USAGE"))
      .child(this.section(t, "usage-claude", "Claude Code", shared.claude.live))
      .child(div().h(1).bg(t.border))
      .child(this.section(t, "usage-codex", "Codex", shared.codex.live));
  }
}
