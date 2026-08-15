/**
 * История изменений количества.
 */
(function (global) {
  const History = {
    async load(productionId) {
      const rows = await DB.getHistory(productionId, 80);
      State.cache.history = rows;
      Offline.saveCache();
      return rows;
    },

    render(root) {
      const rows = State.cache.history || [];
      if (!rows.length) {
        root.innerHTML = '<p class="empty">Пока нет изменений.</p>';
        return;
      }
      const employees = State.cache.employees || [];
      root.innerHTML =
        "<h2 style=\"margin:8px 4px 12px;font-size:16px\">История</h2>" +
        rows
          .map((h) => {
            const emp = employees.find((e) => e.id === h.employee_id);
            const name = emp ? emp.name : "—";
            const color = emp ? emp.color : "#64748b";
            const sign = h.difference > 0 ? "+" : "";
            return `
              <article class="history-item">
                <span class="dot" style="--c:${UI.escapeHtml(color)};margin-top:4px"></span>
                <div>
                  <div class="who">${UI.escapeHtml(name)}</div>
                  <div class="what">${UI.escapeHtml(h.item_name || "Позиция")}</div>
                  <div class="delta">${h.old_value} → ${h.new_value} <span style="color:var(--muted);font-size:14px">(${sign}${h.difference})</span></div>
                  <div class="when">${UI.formatDateTime(h.created_at)}</div>
                </div>
              </article>`;
          })
          .join("");
    },
  };

  global.History = History;
})(window);
