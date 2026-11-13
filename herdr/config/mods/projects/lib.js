// Shared state and actions for the Projects mod. Project and thread names are
// display names kept in shared state; the project label (`project=<key>`) is
// the stable key on each agent's terminal.
import { exec, shared, setShared } from "herdr";

// Status words, most urgent first. `color` names a theme color.
export const STATUSES = [
  { id: "waiting", label: "Waiting", color: "blocked", icon: "●" },
  { id: "under_review", label: "Under review", color: "accent", icon: "◆" },
  { id: "running", label: "Running", color: "working", icon: "▲" },
  { id: "done", label: "Done", color: "done", icon: "✓" },
  { id: "idle", label: "Idle", color: "idle", icon: "○" },
];
export const RANK = Object.fromEntries(STATUSES.map((s, i) => [s.id, STATUSES.length - i]));
export const BY_ID = Object.fromEntries(STATUSES.map((s) => [s.id, s]));
// What an agent's live state means when no label or override says otherwise.
export const FROM_AGENT = { blocked: "waiting", done: "under_review", working: "running", idle: "idle" };

export const KEYS = {
  status: "projects.status", // address -> status word (manual override)
  names: "projects.names", // project key -> display name
  created: "projects.created", // project keys made in the UI, even with no threads yet
  threads: "threads.names", // address -> display name
  folders: "projects.folders", // project key -> folders new threads start with (local only)
};

export const slugify = (s) => (s ?? "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
export const clean = (s) => (s ?? "").replace(/^[^\p{L}\p{N}]+/u, "").trim();
export const machineOfAddr = (addr) => (addr.includes("/") ? addr.split("/")[0] : null);
export const bareAddr = (addr) => (addr.includes("/") ? addr.split("/").slice(1).join("/") : addr);
export const baseName = (p) => p.replace(/\/+$/, "").split("/").pop() || p;

// Folders a project's new threads inherit. Threads copy them and may change their own list.
export const foldersOf = (key) => (shared(KEYS.folders) ?? {})[key] ?? [];
export function setFolders(key, list) {
  const next = { ...(shared(KEYS.folders) ?? {}) };
  if (list.length) next[key] = list;
  else delete next[key];
  setShared(KEYS.folders, next);
}

// A rename or new name is saved as a map entry; an empty name removes the entry.
export function setName(key, map, name) {
  const next = { ...(shared(map) ?? {}) };
  if (name) next[key] = name;
  else delete next[key];
  setShared(map, next);
}

const json = (v) => JSON.stringify(v);

// Runs a `herdr-app do` command and returns what it made, or throws its error.
async function doCommand(name, args) {
  const r = await exec("herdr-app", ["do", name, json(args)]);
  let out = null;
  try { out = JSON.parse(r.stdout || "null"); } catch { /* not JSON */ }
  if (r.code !== 0 || !out || out.error) throw new Error(out?.error ?? (r.stderr || r.stdout || `${name} failed`).trim());
  return out;
}

// Starts an agent in a new thread of a project on `machine` (null: this computer).
// `spaceId` is a space of that project on that machine, when there is one: the thread
// becomes a tab there. Otherwise a new space is made for the project.
// Folders apply on this computer only. The first is the thread's folder (its working
// directory); the rest reach the agent as extra directories, which only Claude Code takes.
export async function createThread({ project, projectName, machine, spaceId, agent, name, folders = [] }) {
  const on = machine ?? null;
  const [first, ...extra] = on ? [] : folders;
  const argv = [...agent.run, ...(agent.key === "claude" ? extra.flatMap((f) => ["--add-dir", f]) : [])];
  const folder = first ? { folder: first } : {};
  const made = spaceId
    ? await doCommand("tab.new", { space: spaceId, argv, ...folder })
    : await doCommand("space.new", { name: projectName, machine: on ?? "", argv, ...folder });
  let addr = made.terminal;
  if (on && addr && !addr.includes("/")) addr = `${on}/${addr}`;
  // Label it so it lands in this project. Its status comes from the agent's live state.
  const labelled = await exec("hc", ["label", bareAddr(addr), `project=${project}`], { on });
  if (labelled.code !== 0) throw new Error(`label failed: ${(labelled.stderr || labelled.stdout).trim()}`);
  if (name) setName(addr, KEYS.threads, name);
  return addr;
}
