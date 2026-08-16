/**
 * PinBoard — записки производства. Несколько исполнителей, оповещение на входе.
 */
(function (global) {
  let lastNotifyKey = "";

  function assigneeIds(note) {
    if (!note) return [];
    if (Array.isArray(note.assignee_ids) && note.assignee_ids.length) {
      return note.assignee_ids.filter(Boolean);
    }
    return note.assignee_id ? [note.assignee_id] : [];
  }

  function assignedOpen() {
    const me = State.data.employeeId;
    if (!me) return [];
    return (State.cache.notes || []).filter((n) => !n.completed && assigneeIds(n).includes(me));
  }

  function employeeName(id, employees) {
    const emp = (employees || []).find((e) => e.id === id);
    return emp ? emp.name : "—";
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
    },

    notifyIfAssigned() {
      this.paintBadge();
      const rows = assignedOpen();
      const pair = `${State.data.employeeId || ""}:${State.data.productionId || ""}`;
      const n = rows.length;
      if (pair !== lastNotifyKey) {
        lastNotifyKey = pair;
        this._lastCount = n;
        if (!n) return;
        UI.toast(n === 1 ? `Вам записка: ${String(rows[0].text || "").slice(0, 48)}` : `Вам назначено записок: ${n}`);
        return;
      }
      if (n > (this._lastCount || 0)) {
        UI.toast(n === 1 ? "Вам новая записка" : `Новая записка. Всего на вас: ${n}`);
      }
      this._lastCount = n;
    },

    render(root) {
      const notes = State.cache.notes || [];
      const employees = State.cache.employees || [];
      const me = State.data.employeeId;
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
        <h2 style="margin:8px 4px 12px;font-size:16px">Записки</h2>
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
            ? notes
                .map((n) => {
                  const author = employees.find((e) => e.id === n.author_id);
                  const ids = assigneeIds(n);
                  const names = ids.map((id) => employeeName(id, employees));
                  const mine = me && ids.includes(me) && !n.completed;
                  return `
                    <article class="note ${n.completed ? "is-done" : ""} ${mine ? "is-mine" : ""}" data-note="${n.id}">
                      <p>${UI.escapeHtml(n.text)}</p>
                      <div class="note-meta">
                        <span>${author ? UI.escapeHtml(author.name) : "—"}</span>
                        ${names.length ? `<span>→ ${UI.escapeHtml(names.join(", "))}</span>` : ""}
                        <span>${UI.formatDateTime(n.created_at)}</span>
                      </div>
                      <div class="row-actions">
                        <button type="button" class="btn" data-note-done="${n.id}">${n.completed ? "Вернуть" : "Готово"}</button>
                        <button type="button" class="btn btn-ghost" data-note-del="${n.id}">Удалить</button>
                      </div>
                    </article>`;
                })
                .join("")
            : '<p class="empty">Записок нет.</p>'
        }
      `;

      const form = UI.$("#noteForm", root);
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

      root.querySelectorAll("[data-note-done]").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const id = btn.getAttribute("data-note-done");
          const note = notes.find((n) => n.id === id);
          await DB.updateNote(State.token(), id, { completed: !note.completed });
          await this.load(State.data.productionId);
          this.render(root);
        });
      });

      root.querySelectorAll("[data-note-del]").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const id = btn.getAttribute("data-note-del");
          await DB.deleteNote(State.token(), id);
          await this.load(State.data.productionId);
          this.render(root);
        });
      });

      this.paintBadge();
    },
  };

  global.Notes = Notes;
})(window);
