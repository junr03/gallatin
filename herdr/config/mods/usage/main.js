// Usage: Claude Code and Codex plan limits, shown as progress bars.
// Each figure is what Claude Code and Codex show for their plan windows, read with the
// login each one already keeps on this Mac (Claude: the Keychain item
// "Claude Code-credentials"; Codex: ~/.codex/auth.json). Tokens stay in this mod's memory.
// Refreshes every minute.

import { View, div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { exec, home, readTextFile, theme } from "herdr";

const REFRESH_MS = 60_000;

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
  if (!r.ok) return { error: r.status === 401 ? "Claude Code login expired: open Claude Code once" : `Claude usage HTTP ${r.status}` };
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
  if (!r.ok) return { error: r.status === 401 ? "Codex login expired: open Codex once" : `Codex usage HTTP ${r.status}` };
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

export default class Usage extends View {
  init(_props, cx) {
    this.live = { claude: null, codex: null };
    this.refresh(cx);
    cx.timer.every(REFRESH_MS, (cx) => this.refresh(cx));
  }

  refresh(cx) {
    cx.spawn(async (cx) => {
      const [claude, codex] = await Promise.all([
        claudeLive().catch((e) => ({ error: String(e.message ?? e) })),
        codexLive().catch((e) => ({ error: String(e.message ?? e) })),
      ]);
      this.live = { claude, codex };
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
      .child(this.section(t, "usage-claude", "Claude Code", this.live.claude))
      .child(div().h(1).bg(t.border))
      .child(this.section(t, "usage-codex", "Codex", this.live.codex));
  }
}
