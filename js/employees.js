/**
 * Выбор сотрудника.
 */
(function (global) {
  const Employees = {
    async load() {
      const list = await DB.getEmployees();
      State.cache.employees = list;
      Offline.saveCache();
      return list;
    },

    byId(id) {
      return (State.cache.employees || []).find((e) => e.id === id) || null;
    },

    name(id) {
      const e = this.byId(id);
      return e ? e.name : "—";
    },

    color(id) {
      const e = this.byId(id);
      return e && e.color ? e.color : "#64748b";
    },

    renderList(root) {
      if (!root) return;
      const people = State.cache.employees || [];
      if (!people.length) {
        root.innerHTML = '<p class="empty">Нет активных сотрудников. Добавьте их в админ-панели.</p>';
        return;
      }
      root.innerHTML = people
        .map(
          (e) => `
        <button type="button" class="person-btn" data-emp="${e.id}">
          <span class="dot" style="--c:${UI.escapeHtml(e.color)}"></span>
          ${UI.escapeHtml(e.name)}
        </button>`
        )
        .join("");
    },
  };

  global.Employees = Employees;
})(window);
