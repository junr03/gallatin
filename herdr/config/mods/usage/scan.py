#!/usr/bin/env python3
"""Reads local Claude Code and Codex transcripts and prints token usage as JSON.

Claude: ~/.claude/projects/**/*.jsonl, one usage block per assistant message.
Codex:  ~/.codex/sessions/**/rollout-*.jsonl, cumulative token_count events,
        turned into per-event deltas so they land on the day they happened.
Nothing is sent anywhere; this only reads files under the home folder.
"""
import json
import os
import re
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

HOME = Path.home()
NOW = datetime.now().astimezone()
TODAY = NOW.date()
WEEK_START = TODAY - timedelta(days=6)


def parse_ts(value):
    if not isinstance(value, str):
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone()
    except ValueError:
        return None


def empty():
    return {"input": 0, "cached": 0, "output": 0, "total": 0}


def add(bucket, usage):
    bucket["input"] += usage["input"]
    bucket["cached"] += usage["cached"]
    bucket["output"] += usage["output"]
    bucket["total"] += usage["input"] + usage["output"]


class Window:
    """Totals for today, the last 7 days, and everything seen."""

    def __init__(self):
        self.today = empty()
        self.week = empty()
        self.all = empty()

    def put(self, day, usage):
        if day is None:
            return
        add(self.all, usage)
        if day >= WEEK_START:
            add(self.week, usage)
        if day == TODAY:
            add(self.today, usage)

    def dump(self):
        return {"today": self.today, "week": self.week, "all": self.all}


def scan_claude():
    root = HOME / ".claude" / "projects"
    win = Window()
    sessions = []
    if not root.is_dir():
        return {**win.dump(), "recent": sessions}
    for path in root.glob("**/*.jsonl"):
        messages = {}  # message id -> (time, usage); later lines carry the final count
        cwd = None
        updated = None
        try:
            with path.open(encoding="utf-8", errors="ignore") as fh:
                for line in fh:
                    if '"usage"' not in line and '"cwd"' not in line:
                        continue
                    try:
                        rec = json.loads(line)
                    except ValueError:
                        continue
                    cwd = cwd or rec.get("cwd")
                    when = parse_ts(rec.get("timestamp"))
                    if when:
                        updated = max(updated, when) if updated else when
                    msg = rec.get("message") or {}
                    usage = msg.get("usage")
                    if rec.get("type") != "assistant" or not isinstance(usage, dict):
                        continue
                    key = msg.get("id") or rec.get("uuid") or id(rec)
                    messages[key] = (when, {
                        "input": int(usage.get("input_tokens") or 0)
                        + int(usage.get("cache_creation_input_tokens") or 0),
                        "cached": int(usage.get("cache_read_input_tokens") or 0),
                        "output": int(usage.get("output_tokens") or 0),
                    })
        except OSError:
            continue
        if not messages:
            continue
        session_total = empty()
        for when, usage in messages.values():
            win.put(when.date() if when else None, usage)
            add(session_total, usage)
        name = Path(cwd).name if cwd else path.parent.name
        sessions.append({
            "name": name,
            "id": path.stem[:8],
            "total": session_total["total"],
            "updated": updated.isoformat() if updated else None,
        })
    sessions.sort(key=lambda s: s["updated"] or "", reverse=True)
    return {**win.dump(), "recent": sessions[:4]}


def load_codex_names():
    names = {}
    index = HOME / ".codex" / "session_index.jsonl"
    if not index.is_file():
        return names
    for line in index.read_text(encoding="utf-8", errors="ignore").splitlines():
        try:
            rec = json.loads(line)
        except ValueError:
            continue
        if rec.get("id") and rec.get("thread_name"):
            names[rec["id"]] = rec["thread_name"]
    return names


UUID = re.compile(r"([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl$")


def scan_codex():
    root = HOME / ".codex" / "sessions"
    win = Window()
    sessions = []
    plan = None
    credits = None
    limits = []
    latest_limit_time = None
    if not root.is_dir():
        return {**win.dump(), "recent": sessions, "plan": None, "credits": None, "limits": []}
    names = load_codex_names()
    for path in root.glob("**/rollout-*.jsonl"):
        match = UUID.search(path.name)
        sid = match.group(1) if match else path.stem
        prev = None
        session_total = empty()
        updated = None
        try:
            with path.open(encoding="utf-8", errors="ignore") as fh:
                for line in fh:
                    if '"token_count"' not in line:
                        continue
                    try:
                        rec = json.loads(line)
                    except ValueError:
                        continue
                    when = parse_ts(rec.get("timestamp"))
                    if when:
                        updated = max(updated, when) if updated else when
                    payload = rec.get("payload") or {}
                    if payload.get("type") != "token_count":
                        continue
                    info = payload.get("info") or {}
                    total = info.get("total_token_usage")
                    if isinstance(total, dict):
                        # Codex's input_tokens includes the cached part; split it out
                        # so "input" means fresh tokens in both agents.
                        cached = int(total.get("cached_input_tokens") or 0)
                        cur = {
                            "input": int(total.get("input_tokens") or 0) - cached,
                            "cached": cached,
                            "output": int(total.get("output_tokens") or 0),
                        }
                        if prev is None:
                            delta = cur
                        else:
                            delta = {k: max(cur[k] - prev[k], 0) for k in cur}
                        prev = cur
                        win.put(when.date() if when else None, delta)
                        add(session_total, delta)
                    rl = payload.get("rate_limits")
                    if isinstance(rl, dict) and when and (latest_limit_time is None or when > latest_limit_time):
                        latest_limit_time = when
                        plan = rl.get("plan_type") or plan
                        credits = rl.get("credits") or credits
                        limits = [
                            {"name": label, "percentUsed": w.get("used_percent"),
                             "resetsAt": w.get("resets_at")}
                            for label, w in (("primary", rl.get("primary")), ("secondary", rl.get("secondary")))
                            if isinstance(w, dict)
                        ]
        except OSError:
            continue
        if session_total["total"] == 0:
            continue
        sessions.append({
            "name": names.get(sid) or sid[:8],
            "id": sid[:8],
            "total": session_total["total"],
            "updated": updated.isoformat() if updated else None,
        })
    sessions.sort(key=lambda s: s["updated"] or "", reverse=True)
    return {**win.dump(), "recent": sessions[:4], "plan": plan, "credits": credits, "limits": limits}


def main():
    out = {
        "generatedAt": NOW.isoformat(),
        "claude": scan_claude(),
        "codex": scan_codex(),
    }
    json.dump(out, sys.stdout)


if __name__ == "__main__":
    main()
