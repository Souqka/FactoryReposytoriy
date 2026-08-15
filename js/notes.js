/**
 * PinBoard — записки производства.
 */
(function (global) {
  const Notes = {
    async load(productionId) {
      const rows = await DB.getNotes(productionId);
      State.cache.notes = rows;
      Offline.saveCache();
      return rows;
    },

    render(root) {
      const notes = State.cache.notes || [];
      const employees = State.cache.employees || [];
      const options = employees
        .map((e) => `<option value="${e.id}">${UI.escapeHtml(e.name)}</option>`)
        .join("");

      root.innerHTML = `
        <h2 style="margin:8px 4px 12px;font-size:16px">Записки</h2>
        <form id="noteForm">
          <label class="field">
            <span>Текст</span>
            <textarea id="noteText" required placeholder="Что нужно сделать"></textarea>
          </label>
          <label class="field">
            <span>Назначить</span>
            <select id="noteAssignee">
              <option value="">Никому</option>
              ${options}
            </select>
          </label>
          <button class="btn btn-primary btn-block" type="submit">Добавить</button>
        </form>
        <div style="height:16px"></div>
        ${
          notes.length
            ? notes
                .map((n) => {
                  const author = employees.find((e) => e.id === n.author_id);
                  const assignee = employees.find((e) => e.id === n.assignee_id);
                  return `
                    <article class="note ${n.completed ? "is-done" : ""}" data-note="${n.id}">
                      <p>${UI.escapeHtml(n.text)}</p>
                      <div class="note-meta">
                        <span>${author ? UI.escapeHtml(author.name) : "—"}</span>
                        ${assignee ? `<span>→ ${UI.escapeHtml(assignee.name)}</span>` : ""}
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
        const assignee = UI.$("#noteAssignee", root).value || null;
        if (!text) return;
        try {
          await DB.createNote(State.token(), State.data.productionId, text, assignee);
          await this.load(State.data.productionId);
          this.render(root);
        } catch (err) {
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
    },
  };

  global.Notes = Notes;
})(window);
