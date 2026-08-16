/**
 * История изменений количества: период и производство текущей сессии.
 * Данные только через app_get_history / локальный адаптер.
 */
(function (global) {
  const PAGE = 80;
  const MAX = 300;

  const filters = {
    period: "today",
  };

  let limit = PAGE;

  function findInTree(itemId) {
    const tree = State.cache.tree || [];
    for (const dept of tree) {
      for (const group of dept.groups || []) {
        const item = (group.items || []).find((i) => i.id === itemId);
        if (item) return { item, group, dept };
      }
    }
    return null;
  }

  function sessionProductionId() {
    return State.data.productionId || null;
  }

  function enrich(row) {
    const empName = row.employee_name || Employees.name(row.employee_id);
    const empColor = row.employee_color || Employees.color(row.employee_id);
    const prod =
      row.production_name ||
      ((State.cache.productions || []).find((p) => p.id === row.production_id) || {}).name ||
      "—";
    let dept = row.department_name || "";
    if (!dept && row.item_id) {
      const found = findInTree(row.item_id);
      if (found) dept = found.dept.name;
    }
    return {
      ...row,
      employee_name: empName,
      employee_color: empColor,
      production_name: prod,
      department_name: dept || "—",
    };
  }

  function periodStart(key) {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    if (key === "today") return now.getTime();
    if (key === "7") {
      const d = new Date(now);
      d.setDate(d.getDate() - 6);
      return d.getTime();
    }
    if (key === "30") {
      const d = new Date(now);
      d.setDate(d.getDate() - 29);
      return d.getTime();
    }
    return now.getTime();
  }

  function applyFilters(rows) {
    const prodId = sessionProductionId();
    const start = periodStart(filters.period);
    const end = Date.now() + 86400000;
    return rows
      .filter((h) => {
        if (prodId && h.production_id && h.production_id !== prodId) return false;
        const t = new Date(h.created_at).getTime();
        if (t < start || t >= end) return false;
        return true;
      })
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }

  function cardHtml(h) {
    const sign = h.difference > 0 ? "+" : "";
    const diffClass = h.difference > 0 ? "is-pos" : h.difference < 0 ? "is-neg" : "";
    const path = [h.production_name, h.department_name].filter((x) => x && x !== "—").join(" → ");
    return `
      <article class="hist-card">
        <div class="hist-card-top">
          <span class="dot" style="--c:${UI.escapeHtml(h.employee_color)}"></span>
          <b>${UI.escapeHtml(h.employee_name)}</b>
          <time>${UI.escapeHtml(UI.formatDayTime(h.created_at))}</time>
        </div>
        <div class="hist-name">${UI.escapeHtml(h.item_name || "Позиция")}</div>
        <div class="hist-path">${UI.escapeHtml(path || "—")}</div>
        <div class="hist-delta">
          <span>${h.old_value} → ${h.new_value}</span>
          <span class="hist-diff ${diffClass}">${sign}${h.difference}</span>
        </div>
      </article>`;
  }

  const History = {
    async load(_productionId, nextLimit) {
      limit = nextLimit || PAGE;
      const productionId = sessionProductionId();
      if (!productionId) {
        State.cache.history = [];
        Offline.saveCache();
        return [];
      }
      const rows = await DB.getHistory(productionId, limit);
      State.cache.history = (rows || []).map(enrich);
      Offline.saveCache();
      return State.cache.history;
    },

    render(root) {
      if (!root) return;
      const all = (State.cache.history || []).map(enrich);
      const visible = applyFilters(all);
      const canMore = all.length >= limit && limit < MAX;
      const period = filters.period;

      root.innerHTML = `
        <h2 class="panel-title">История изменений</h2>
        <div class="hist-filters">
          <select data-hist-filter="period" aria-label="Период">
            <option value="today"${period === "today" ? " selected" : ""}>Сегодня</option>
            <option value="7"${period === "7" ? " selected" : ""}>Последние 7 дней</option>
            <option value="30"${period === "30" ? " selected" : ""}>Последние 30 дней</option>
          </select>
        </div>
        <div class="hist-list">${visible.map(cardHtml).join("")}</div>
        <p class="empty hist-empty${visible.length ? " hidden" : ""}">Нет записей за выбранный период.</p>
        ${canMore ? '<button type="button" class="btn btn-block" id="histMore">Показать ещё</button>' : ""}
      `;

      const periodEl = root.querySelector("[data-hist-filter=period]");
      if (periodEl) {
        periodEl.addEventListener("change", () => {
          filters.period = periodEl.value || "today";
          History.render(root);
        });
      }
      const more = UI.$("#histMore", root);
      if (more) {
        more.addEventListener("click", async () => {
          try {
            await History.load(sessionProductionId(), Math.min(limit + PAGE, MAX));
            History.render(root);
          } catch {
            UI.toast("Не удалось загрузить ещё", true);
          }
        });
      }
    },
  };

  global.History = History;
})(window);
