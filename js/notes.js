/**
 * Записки / задачи производства.
 * «Мои задачи» — те же notes, отфильтрованные по session employee_id.
 */
(function (global) {
  let lastNotifyKey = "";
  let tab = "mine";
  let mineFilter = "active";

  function assigneeIds(note) {
    if (!note) return [];
    if (Array.isArray(note.assignee_ids) && note.assignee_ids.length) {
      return note.assignee_ids.filter(Boolean);
    }
    return note.assignee_id ? [note.assignee_id] : [];
  }

  function assignedTo(note, employeeId) {
    return !!(employeeId && assigneeIds(note).includes(employeeId));
  }

  function assignedOpen() {
    const me = State.data.employeeId;
    if (!me) return [];
    return (State.cache.notes || []).filter((n) => !n.completed && assignedTo(n, me));
  }

  function mineNotes() {
    const me = State.data.employeeId;
    return (State.cache.notes || []).filter((n) => assignedTo(n, me));
  }

  function noteCard(n, employees, opts) {
    const me = State.data.employeeId;
    const author = Employees.byId(n.author_id);
    const ids = assigneeIds(n);
    const names = ids.map((id) => Employees.name(id));
    const mine = assignedTo(n, me) && !n.completed;
    const compact = opts && opts.compact;
    return `
      <article class="note ${n.completed ? "is-done" : ""} ${mine ? "is-mine" : ""}" data-note="${n.id}">
        <p>${n.completed ? "✅ " : "📌 "}${UI.escapeHtml(n.text)}</p>
        <div class="note-meta">
          <span class="dot" style="--c:${UI.escapeHtml(Employees.color(n.author_id))}"></span>
          <span>${UI.escapeHtml(author ? author.name : "—")}</span>
          ${!compact && names.length ? `<span>→ ${UI.escapeHtml(names.join(", "))}</span>` : ""}
          <span>${n.completed ? "Выполнено" : UI.formatDayTime(n.created_at)}</span>
        </div>
        <div class="row-actions">
          <button type="button" class="btn" data-note-done="${n.id}">${n.completed ? "Вернуть" : "Выполнить"}</button>
          ${compact ? "" : `<button type="button" class="btn btn-ghost" data-note-del="${n.id}">Удалить</button>`}
        </div>
      </article>`;
  }

  function bindNoteActions(root, notes) {
    root.querySelectorAll("[data-note-done]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-note-done");
        const note = notes.find((n) => n.id === id);
        if (!note) return;
        try {
          await DB.updateNote(State.token(), id, { completed: !note.completed });
          await Notes.load(State.data.productionId);
          Notes.render(root);
        } catch {
          UI.toast("Не удалось обновить задачу", true);
        }
      });
    });
    root.querySelectorAll("[data-note-del]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-note-del");
        try {
          await DB.deleteNote(State.token(), id);
          await Notes.load(State.data.productionId);
          Notes.render(root);
        } catch {
          UI.toast("Не удалось удалить записку", true);
        }
      });
    });
  }

  const Notes = {
    assigneeIds,
    assignedOpen,

    async load(productionId) {
      const rows = await DB.getNotes(productionId);
      State.cache.notes = rows;
      Offline.saveCache();
      this.paintBadge();
      return rows;
    },

    paintBadge() {
      const n = assignedOpen().length;
      const badge = UI.$("#notesBadge");
      if (!badge) return;
      badge.textContent = String(n);
      badge.classList.toggle("hidden", n === 0);
      const mineTab = UI.$("#notesTabMine");
      if (mineTab) {
        mineTab.textContent = n ? `Мои (${n})` : "Мои";
      }
    },

    notifyIfAssigned() {
      this.paintBadge();
      const rows = assignedOpen();
      const pair = `${State.data.employeeId || ""}:${State.data.productionId || ""}`;
      const n = rows.length;
      if (pair !== lastNotifyKey) {
        lastNotifyKey = pair;
        this._lastCount = n;
      } else {
        this._lastCount = n;
      }
    },

    render(root) {
      const notes = State.cache.notes || [];
      const employees = State.cache.employees || [];
      const mine = mineNotes();
      const activeMine = mine.filter((n) => !n.completed);
      const doneMine = mine.filter((n) => n.completed);
      const mineShown =
        mineFilter === "active" ? activeMine : mineFilter === "done" ? doneMine : mine;
      const picks = employees
        .map(
          (e) => `
            <label class="chip-check">
              <input type="checkbox" value="${e.id}" />
              <span class="dot" style="--c:${UI.escapeHtml(e.color)}"></span>
              ${UI.escapeHtml(e.name)}
            </label>`
        )
        .join("");

      root.innerHTML = `
        <div class="seg" role="tablist">
          <button type="button" class="${tab === "mine" ? "is-active" : ""}" data-notes-tab="mine" id="notesTabMine">Мои${activeMine.length ? " (" + activeMine.length + ")" : ""}</button>
          <button type="button" class="${tab === "all" ? "is-active" : ""}" data-notes-tab="all">Все</button>
        </div>
        ${
          tab === "mine"
            ? `
        <h2 class="panel-title">Мои задачи</h2>
        <div class="seg seg-sub">
          <button type="button" class="${mineFilter === "active" ? "is-active" : ""}" data-mine-filter="active">Активные (${activeMine.length})</button>
          <button type="button" class="${mineFilter === "done" ? "is-active" : ""}" data-mine-filter="done">Выполненные (${doneMine.length})</button>
          <button type="button" class="${mineFilter === "all" ? "is-active" : ""}" data-mine-filter="all">Все</button>
        </div>
        ${
          mineShown.length
            ? mineShown.map((n) => noteCard(n, employees, { compact: true })).join("")
            : '<p class="empty">Нет задач на вас.</p>'
        }`
            : `
        <h2 class="panel-title">Задачи</h2>
        <form id="noteForm">
          <label class="field">
            <span>Текст</span>
            <textarea id="noteText" required placeholder="Что нужно сделать"></textarea>
          </label>
          <div class="field">
            <span>Назначить</span>
            <div class="assignee-picks" id="noteAssignees">${picks || '<p class="empty">Нет сотрудников</p>'}</div>
          </div>
          <button class="btn btn-primary btn-block" type="submit">Добавить</button>
        </form>
        <div style="height:16px"></div>
        ${
          notes.length
            ? notes.map((n) => noteCard(n, employees, { compact: false })).join("")
            : '<p class="empty">Задач нет.</p>'
        }`
        }
      `;

      root.querySelectorAll("[data-notes-tab]").forEach((btn) => {
        btn.addEventListener("click", () => {
          tab = btn.getAttribute("data-notes-tab");
          Notes.render(root);
        });
      });
      root.querySelectorAll("[data-mine-filter]").forEach((btn) => {
        btn.addEventListener("click", () => {
          mineFilter = btn.getAttribute("data-mine-filter");
          Notes.render(root);
        });
      });

      const form = UI.$("#noteForm", root);
      if (form) {
        form.addEventListener("submit", async (e) => {
          e.preventDefault();
          const text = UI.$("#noteText", root).value.trim();
          const ids = UI.$all("#noteAssignees input:checked", root).map((el) => el.value);
          if (!text) return;
          try {
            await DB.createNote(State.token(), State.data.productionId, text, ids);
            await this.load(State.data.productionId);
            this.render(root);
          } catch {
            UI.toast("Не удалось сохранить записку", true);
          }
        });
      }

      bindNoteActions(root, notes);
      this.paintBadge();
    },
  };

  global.Notes = Notes;
})(window);
