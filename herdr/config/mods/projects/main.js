// Projects: agent threads grouped by project, tagged with agent, machine and status.
// Project key comes from the terminal label `project=<key>` (else the space's name).
// Status comes from the label `status=<word>`, else the agent's live state. A status
// picked here is a manual override in shared state until cleared (Auto).
// The same mod draws the dialogs (props().form): rename, new project, new thread.

import { View, div, image, svg } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { agents, terminals, spaces, machines, knownAgents, pickFolder, run, theme, shared, setShared, openOverlay, closeOverlay, props, notify } from "herdr";
import { STATUSES, RANK, BY_ID, FROM_AGENT, KEYS, slugify, clean, baseName, machineOfAddr, setName, setFlag, foldersOf, setFolders, createThread } from "./lib.js";

const stop = (_e, cx) => cx.stop_propagation();

// Live state is the truth for running and waiting, so a stale label can't leave an
// idle thread showing "running". A label only adds states live state can't express.
const LABEL_ONLY = ["under_review", "done", "idle"];
function statusOf(a, labels, overrides) {
  const manual = overrides[a.address];
  if (manual && BY_ID[manual]) return { id: manual, manual: true };
  if (a.status === "working" || a.status === "blocked") return { id: FROM_AGENT[a.status], manual: false };
  const label = labels?.status;
  if (label && LABEL_ONLY.includes(label)) return { id: label, manual: false };
  return { id: FROM_AGENT[a.status] ?? "idle", manual: false };
}

function icon(p, size, color) {
  if (!p?.icon) return null;
  return p.tint ? svg(p.icon).size(size).flex_none().text_color(color) : image(p.icon).w(size).h(size).flex_none();
}

function tag(t, text, color) {
  return div().flex_none().px(5).h(16).rounded(4).border(1).border_color(color ?? t.border)
    .text_size(10.5).text_color(color ?? t.muted).flex().items_center().child(text);
}

// Everything the sidebar and the dialogs need, from live data and shared names.
function collect() {
  const spaceList = spaces();
  const labelsOf = new Map(terminals().map((x) => [x.address, x.labels ?? {}]));
  const overrides = shared(KEYS.status) ?? {};
  const names = shared(KEYS.names) ?? {};
  const threadNames = shared(KEYS.threads) ?? {};
  const created = shared(KEYS.created) ?? [];
  const archivedThreads = shared(KEYS.archivedThreads) ?? {};
  const archivedProjects = shared(KEYS.archivedProjects) ?? {};

  const threads = agents().map((a) => {
    const labels = labelsOf.get(a.address) ?? {};
    const space = spaceList.find((s) => s.id === a.space);
    const key = labels.project || (space ? `space:${space.name}` : "unassigned");
    return {
      a,
      key,
      machine: space?.machine ?? machineOfAddr(a.address),
      spaceId: a.space,
      status: statusOf(a, labels, overrides),
      title: threadNames[a.address] ?? (clean(a.tab_name) || a.program?.name || a.address),
      fallbackName: space?.name ?? key,
      archived: Boolean(archivedThreads[a.address]),
    };
  });

  const groups = new Map();
  const ensure = (key, fallbackName) => {
    if (!groups.has(key)) groups.set(key, { key, name: names[key] ?? fallbackName ?? key, list: [] });
    return groups.get(key);
  };
  for (const k of created) ensure(k, k);
  for (const th of threads) ensure(th.key, th.fallbackName).list.push(th);
  for (const g of groups.values()) {
    g.list.sort((x, y) => RANK[y.status.id] - RANK[x.status.id] || y.a.seq - x.a.seq);
    g.archived = Boolean(archivedProjects[g.key]);
    g.urgency = Math.max(0, ...g.list.filter((th) => !th.archived).map((th) => RANK[th.status.id]));
  }
  const ordered = [...groups.values()].sort((x, y) => y.urgency - x.urgency || x.name.localeCompare(y.name));
  return { threads, groups: ordered, count: threads.length };
}

export default class Projects extends View {
  init(_props, cx) {
    const form = props()?.form;
    if (form) return this.initForm(form, cx);
    if (props()?.statusMenu) return;
    cx.timer.every(30000, (cx) => cx.notify());
  }

  // ---------- Dialogs ----------

  initForm(form, cx) {
    this.form = form;
    this.busy = false;
    this.error = null;
    this.machine = form.machine ?? null;
    this.projectKey = form.key ?? null;
    this.folders = this.projectKey ? [...foldersOf(this.projectKey)] : [];
    this.agent = null;
    this.agents = [];
    this.agentsLoading = false;
    const initial = form.name ?? "";
    this.input = InputState.new({ value: initial });
    if (initial) this.input.set_selected_range({ start: 0, end: initial.length });
    this.input.on("change", (_e, cx) => { this.error = null; cx.notify(); });
    this.input.on("submit", (_e, cx) => this.submit(cx));
    this.handle = cx.focus_handle();
    cx.timer.after(300, () => this.input.focus());
    if (form.kind === "new-thread") this.loadAgents(cx);
  }

  loadAgents(cx) {
    cx.spawn(async (cx) => {
      this.agentsLoading = true;
      this.agentError = null;
      cx.notify();
      try {
        const list = await knownAgents({ on: this.machine });
        this.agents = list.filter((a) => a.installed);
        this.agent = this.agents.find((a) => this.agent && a.key === this.agent.key) ?? this.agents[0] ?? null;
      } catch (e) {
        this.agents = [];
        this.agentError = String(e?.message ?? e);
      }
      this.agentsLoading = false;
      cx.notify();
    });
  }

  close() {
    closeOverlay(props().overlay);
  }

  // Adds a folder picked on this computer. Folders are local only for now.
  addFolder(cx) {
    cx.spawn(async (cx) => {
      try {
        const picked = await pickFolder({ prompt: "Attach" });
        if (picked && !this.folders.includes(picked)) this.folders = [...this.folders, picked];
        this.error = null;
      } catch (e) {
        this.error = `Could not pick a folder: ${String(e?.message ?? e)}`;
      }
      cx.notify();
    });
  }

  fail(message, cx) {
    this.error = message;
    this.busy = false;
    cx.notify();
  }

  submit(cx) {
    if (this.busy) return;
    const f = this.form;
    const text = this.input.value().trim();
    if (f.kind === "rename-project") {
      setName(f.key, KEYS.names, text);
      setFolders(f.key, this.folders);
      return this.close();
    }
    if (f.kind === "rename-thread") {
      setName(f.address, KEYS.threads, text);
      return this.close();
    }
    if (f.kind === "new-project") {
      const key = slugify(text);
      if (!key) return this.fail("Give the project a name.", cx);
      const taken = collect().groups.some((g) => g.key === key);
      if (taken) return this.fail(`A project called "${text}" already exists.`, cx);
      setShared(KEYS.created, [...(shared(KEYS.created) ?? []), key]);
      setName(key, KEYS.names, text);
      setFolders(key, this.folders);
      return this.close();
    }
    if (f.kind === "new-thread") {
      if (!this.projectKey) return this.fail("Pick a project.", cx);
      if (!this.agent) return this.fail("Pick an agent (installed on that machine).", cx);
      const data = collect();
      const group = data.groups.find((g) => g.key === this.projectKey);
      const sameMachine = group?.list.find((th) => (th.machine ?? null) === (this.machine ?? null));
      this.busy = true;
      cx.notify();
      cx.spawn(async (cx) => {
        try {
          await createThread({
            project: this.projectKey,
            projectName: group?.name ?? this.projectKey,
            machine: this.machine,
            spaceId: sameMachine?.spaceId ?? null,
            agent: this.agent,
            name: text,
            folders: this.folders,
          });
          this.close();
        } catch (e) {
          notify({ title: "Could not start the thread", body: String(e?.message ?? e), level: "error" });
          this.fail(String(e?.message ?? e), cx);
        }
      });
    }
  }

  chip(t, id, label, on, action, extra) {
    return h_flex().id(id).h(28).px(10).gap(6).rounded(8).items_center().border(1)
      .border_color(on ? t.accent : t.input).bg(on ? t.accent + "1f" : t.raised)
      .text_size(12.3).text_color(extra?.disabled ? t.dim : t.foreground)
      .when(!extra?.disabled, (el) => el.cursor_pointer().hover((s) => s.bg(t.hover)).on_click(action))
      .child(label);
  }

  formButton(t, id, text, primary, action, disabled) {
    return h_flex().id(id).h(32).px(14).items_center().rounded(8).border_1()
      .border_color(primary ? t.solid : t.input).bg(primary ? t.solid : t.raised)
      .text_color(primary ? t.solid_foreground : t.foreground).text_size(12.5).font_medium()
      .when(!disabled, (el) => el.cursor_pointer().hover((s) => s.opacity(0.88)).on_click(action))
      .when(disabled, (el) => el.opacity(0.5))
      .child(text);
  }

  // Folder list with add and remove. Shown for a project (rename) and for a new thread on this computer.
  folderSection(t, cx) {
    const remove = (p) => (_e, cx) => { this.folders = this.folders.filter((x) => x !== p); this.error = null; cx.notify(); };
    const folderChip = (p) => h_flex().id(`fd-${p}`).h(28).pl(10).pr(4).gap(4).rounded(8).items_center().border(1)
      .border_color(t.input).bg(t.raised).text_size(12.3).text_color(t.foreground)
      .child(div().truncate().child(baseName(p)))
      .child(div().id(`fdx-${p}`).px(4).text_color(t.dim).cursor_pointer().hover((s) => s.text_color(t.foreground)).on_click(remove(p)).child("×"));
    const agentNote = this.folders.length > 1 && this.agent && this.agent.key !== "claude";
    return v_flex().gap(6)
      .child(div().pt(14).pb(0).text_size(11.5).text_color(t.dim).child("Folders"))
      .child(h_flex().gap(6).flex_wrap().children(this.folders.map(folderChip))
        .child(this.chip(t, "fd-add", "+ Folder", false, (_e, cx) => this.addFolder(cx))))
      .when(!this.folders.length, (el) => el.child(div().text_size(11.5).text_color(t.dim).child("No folders. New threads start in the home folder.")))
      .when(agentNote, (el) => el.child(div().text_size(11.5).text_color(t.dim).child("Only Claude Code gets the extra folders. Other agents start in the first.")));
  }

  renderForm(t, cx) {
    const f = this.form;
    const titles = {
      "rename-project": "Rename project",
      "rename-thread": "Rename thread",
      "new-project": "New project",
      "new-thread": "New thread",
    };
    const saveLabel = { "rename-project": "Save", "rename-thread": "Save", "new-project": "Create project", "new-thread": "Start thread" };
    const label = (text) => div().pt(14).pb(6).text_size(11.5).text_color(t.dim).child(text);
    const data = f.kind === "new-thread" ? collect() : null;
    const machineNames = [null, ...machines().filter((m) => m.name).map((m) => m.name)];
    const machineLabel = (m) => (m ?? "This computer");
    const nameLabel = f.kind === "new-thread" ? "Name (optional)" : "Name";

    return v_flex().id("projects-form").track_focus(this.handle)
      .on_key_down((e, cx) => { if (e.key === "escape") { this.close(); cx.stop_propagation(); } })
      .w_full().p(18).gap(2).bg(t.popover).text_color(t.foreground)
      .child(h_flex().items_center().child(div().flex_1().text_size(15).font_semibold().child(titles[f.kind] ?? "")).child(div().text_size(11).text_color(t.dim).child("Esc")))
      .when(f.kind === "new-thread", (el) => el
        .child(label("Project"))
        .child(h_flex().gap(6).flex_wrap().children(data.groups.filter((g) => !g.archived).map((g) =>
          this.chip(t, `pj-${g.key}`, g.name, this.projectKey === g.key, (_e, cx) => {
            this.projectKey = g.key;
            this.folders = [...foldersOf(g.key)];
            this.error = null;
            cx.notify();
          })))))
      .when(f.kind === "new-thread", (el) => el
        .child(label("Machine"))
        .child(h_flex().gap(6).flex_wrap().children(machineNames.map((m) => this.chip(t, `mc-${m ?? "local"}`, machineLabel(m), (this.machine ?? null) === m, (_e, cx) => {
          this.machine = m;
          this.agent = null;
          this.error = null;
          this.loadAgents(cx);
        })))))
      .when(f.kind === "new-thread", (el) => el
        .child(label("Agent"))
        .child(this.agentsLoading
          ? div().text_size(12).text_color(t.dim).child("Looking for installed agents…")
          : this.agentError
            ? div().text_size(12).text_color(t.blocked).child(`Could not check agents: ${this.agentError}`)
            : this.agents.length
              ? h_flex().gap(6).flex_wrap().children(this.agents.map((a) => this.chip(t, `ag-${a.key}`, a.name, this.agent?.key === a.key, (_e, cx) => { this.agent = a; this.error = null; cx.notify(); })))
              : div().text_size(12).text_color(t.dim).child("No agents installed on this machine.")))
      .when(f.kind === "rename-project" || f.kind === "rename-thread" || f.kind === "new-project" || f.kind === "new-thread", (el) => el
        .child(label(nameLabel))
        .child(Input.new(this.input).h(36).px(10).rounded(9).border_1().border_color(t.input).bg(t.background).text_size(12.8).text_color(t.foreground)))
      .when(f.kind === "rename-project" || f.kind === "new-project" || (f.kind === "new-thread" && !this.machine), (el) => el.child(this.folderSection(t, cx)))
      .when(Boolean(this.error), (el) => el.child(div().pt(8).text_size(11.8).text_color(t.blocked).child(this.error)))
      .child(h_flex().pt(18).gap(8).justify_end()
        .child(this.formButton(t, "pf-cancel", "Cancel", false, () => this.close(), false))
        .child(this.formButton(t, "pf-save", this.busy ? "Starting…" : saveLabel[f.kind], true, (_e, cx) => this.submit(cx), this.busy)));
  }

  // ---------- Status menu ----------

  statusMenu(t) {
    const addr = props().statusMenu;
    const current = (shared(KEYS.status) ?? {})[addr];
    const pick = (id) => {
      const next = { ...(shared(KEYS.status) ?? {}) };
      if (id) next[addr] = id;
      else delete next[addr];
      setShared(KEYS.status, next);
      this.close();
    };
    const row = (id, label, color, glyph) =>
      h_flex().id(`st-${id ?? "auto"}`).h(30).px(8).gap(8).rounded(7).items_center()
        .text_color(t.foreground).text_size(12.8).hover((el) => el.bg(t.hover)).on_click(() => pick(id))
        .child(div().w(14).flex_none().text_color(color ?? t.muted).child(glyph))
        .child(div().flex_1().child(label))
        .when((id ?? null) === (current ?? null), (el) => el.child(div().text_color(t.muted).text_size(11).child("✓")));
    return v_flex().w_full().p(5).bg(t.popover)
      .child(div().px(8).pt(4).pb(6).text_size(11).text_color(t.dim).child("Set status"))
      .children(STATUSES.map((s) => row(s.id, s.label, t[s.color], s.icon)))
      .child(div().h(1).my(4).bg(t.border))
      .child(row(null, "Auto (from agent)", t.dim, "↺"));
  }

  // ---------- Sidebar ----------

  dialog(kind, extra, width, height) {
    openOverlay({ mod: "projects", kind: "dialog", modal: true, width, height, props: { form: { kind, ...extra } } });
  }

  renderSidebar(t, cx) {
    const data = collect();
    const headerBtn = (id, text, action) => div().id(id).px(6).h(20).rounded(5).flex().items_center()
      .text_size(11.5).text_color(t.muted).cursor_pointer().hover((s) => s.bg(t.hover).text_color(t.foreground))
      .on_mouse_down("left", stop).on_click(action).child(text);
    // An icon-only button from workspace-chrome's icon set.
    const iconBtn = (id, file, action) => div().id(id).w(18).h(18).rounded(5).flex().items_center().justify_center()
      .cursor_pointer().hover((s) => s.bg(t.hover)).on_mouse_down("left", stop).on_click(() => action())
      .child(svg(`mods/workspace-chrome/${file}.svg`).size(13).flex_none().text_color(t.dim));
    const active = data.groups.filter((g) => !g.archived);
    const visible = (g) => g.list.filter((th) => !th.archived);
    const archivedCount = data.groups.filter((g) => g.archived).length
      + active.reduce((n, g) => n + g.list.filter((th) => th.archived).length, 0);
    const threadRow = (th) => {
      const st = BY_ID[th.status.id];
      const color = t[st.color];
      return h_flex().id(`th-${th.a.address}`).pl(14).pr(4).h(30).gap(6).rounded(7).items_center().text_size(12.5)
        .hover((el) => el.bg(t.hover))
        .on_click(() => run("pane.focus", { terminal: th.a.address }))
        .child(th.a.program ? icon(th.a.program, 13, t.muted) : null)
        .child(div().flex_1().truncate().text_color(t.foreground).child(th.title))
        .child(div().id(`rn-${th.a.address}`).px(4).text_color(t.dim).cursor_pointer().hover((s) => s.text_color(t.foreground))
          .on_mouse_down("left", stop)
          .on_click(() => this.dialog("rename-thread", { address: th.a.address, name: th.title }, 380, 200))
          .child("✎"))
        .child(iconBtn(`ar-${th.a.address}`, "archive", () => setFlag(KEYS.archivedThreads, th.a.address, true)))
        .child(tag(t, th.machine ?? "this computer"))
        .child(h_flex().id(`st-btn-${th.a.address}`).flex_none().px(6).h(18).gap(4).rounded(5).bg(color + "26").items_center()
          .text_size(10.5).font_semibold().text_color(color).cursor_pointer()
          .on_mouse_down("left", stop)
          .on_click(() => openOverlay({ mod: "projects", kind: "popup", width: 190, height: 220, props: { statusMenu: th.a.address } }))
          .child(`${st.icon} ${st.label}`)
          .when(th.status.manual, (el) => el.child(div().opacity(0.7).child("·"))));
    };
    return v_flex().size_full().p(10).gap(8).text_color(t.foreground)
      .child(h_flex().px(4).justify_between().items_center()
        .child(div().text_size(12).font_semibold().text_color(t.muted).child("PROJECTS"))
        .child(h_flex().gap(4)
          .child(headerBtn("new-project", "+ Project", () => this.dialog("new-project", {}, 380, 300)))
          .child(headerBtn("new-thread", "+ Thread", () => this.dialog("new-thread", {}, 440, 560)))))
      .child(v_flex().id("projects-list").flex_1().gap(10).overflow_y_scrollbar()
        .children(active.length
          ? active.map((g) => v_flex().gap(2)
            .child(h_flex().px(4).h(24).gap(6).items_center()
              .child(div().text_size(13).font_semibold().truncate().child(g.name))
              .child(div().text_size(11).text_color(t.dim).child(`${visible(g).length}`))
              .child(div().flex_1())
              .child(div().id(`pr-${g.key}`).px(4).text_color(t.dim).cursor_pointer().hover((s) => s.text_color(t.foreground))
                .on_mouse_down("left", stop).on_click(() => this.dialog("rename-project", { key: g.key, name: g.name }, 380, 300)).child("✎"))
              .child(headerBtn(`pt-${g.key}`, "+", () => this.dialog("new-thread", { key: g.key }, 440, 560)))
              .child(iconBtn(`pa-${g.key}`, "archive", () => setFlag(KEYS.archivedProjects, g.key, true))))
            .children(visible(g).map(threadRow)))
          : [div().px(4).text_size(12).text_color(t.dim).child(data.groups.length ? "All projects are archived." : "No projects yet. Use + Project.")]))
      .when(archivedCount > 0, (el) => el.child(this.archivedBox(t, data, active, archivedCount)));
  }

  // Archived projects and threads, collapsed by default. Archiving a project hides its threads;
  // restoring the project brings them back unless they were archived on their own.
  archivedBox(t, data, active, count) {
    const restoreRow = (id, title, sub, action) => h_flex().id(id).h(26).px(6).gap(6).rounded(6).items_center().text_size(12)
      .hover((s) => s.bg(t.hover))
      .child(div().flex_1().truncate().text_color(t.muted).child(title))
      .child(div().flex_none().text_size(11).text_color(t.dim).child(sub))
      .child(div().id(`${id}-restore`).flex_none().px(4).text_size(11.5).text_color(t.foreground).cursor_pointer()
        .hover((s) => s.text_color(t.accent)).on_mouse_down("left", stop).on_click(() => action()).child("Restore"));
    const archivedProjects = data.groups.filter((g) => g.archived);
    const archivedThreads = active.flatMap((g) => g.list.filter((th) => th.archived).map((th) => ({ th, g })));
    return v_flex().gap(4).pt(4)
      .child(div().h(1).bg(t.border))
      .child(h_flex().px(4).h(22).items_center().cursor_pointer().text_size(11.5).text_color(t.muted)
        .hover((s) => s.text_color(t.foreground))
        .on_click((_e, cx) => { this.showArchived = !this.showArchived; cx.notify(); })
        .child(`${this.showArchived ? "▾" : "▸"} Archived (${count})`))
      .when(this.showArchived, (el) => el.child(v_flex().gap(2).pl(8).overflow_y_scrollbar()
        .children(archivedProjects.map((g) => restoreRow(`ap-${g.key}`, g.name, `project · ${g.list.length}`,
          () => setFlag(KEYS.archivedProjects, g.key, false))))
        .children(archivedThreads.map(({ th, g }) => restoreRow(`at-${th.a.address}`, th.title, g.name,
          () => setFlag(KEYS.archivedThreads, th.a.address, false))))));
  }

  render(cx) {
    const t = theme();
    if (props()?.form) return this.renderForm(t, cx);
    if (props()?.statusMenu) return this.statusMenu(t);
    return this.renderSidebar(t, cx);
  }
}
