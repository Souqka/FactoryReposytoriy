/**
 * История изменений количества: карточки, фильтры, лимит.
 * Данные только через app_get_history / локальный адаптер.
 */
(function (global) {
  const PAGE = 80;
  const MAX = 300;

  const filters = {
    employee: "",
    production: null,
    department: "",
    item: "",
    period: "7",
    search: "",
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

  function enrich(row) {
    const empName = row.employee_name || Employees.name(row.employee_id);
    const empColor = row.employee_color || Employees.color(row.employee_id);
    const prod =
      row.production_name ||
      ((State.cache.productions || []).find((p) => p.id === row.production_id) || {}).name ||
      "—";
    let dept = row.department_name || "";
    let deptId = row.department_id || "";
    if (!dept && row.item_id) {
      const found = findInTree(row.item_id);
      if (found) {
        dept = found.dept.name;
        deptId = found.dept.id;
      }
    }
    return {
      ...row,
      employee_name: empName,
      employee_color: empColor,
      production_name: prod,
      department_name: dept || "—",
      department_id: deptId,
    };
  }

  function periodStart(key) {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    if (key === "today") return now.getTime();
    if (key === "yesterday") {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      return y.getTime();
    }
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
    return 0;
  }

  function periodEnd(key) {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    if (key === "yesterday") return now.getTime();
    return Date.now() + 86400000;
  }

  function applyFilters(rows) {
    const q = String(filters.search || "").trim().toLowerCase();
    const start = periodStart(filters.period);
    const end = periodEnd(filters.period);
    return rows.filter((h) => {
      if (filters.employee && h.employee_id !== filters.employee) return false;
      if (filters.production && h.production_id !== filters.production) return false;
      if (filters.department && h.department_id !== filters.department && h.department_name !== filters.department) {
        return false;
      }
      if (filters.item && (h.item_name || "") !== filters.item) return false;
      const t = new Date(h.created_at).getTime();
      if (t < start || t >= end) return false;
      if (q && String(h.item_name || "").toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
  }

  function uniqueOptions(rows, key, labelKey) {
    const seen = new Map();
    rows.forEach((r) => {
      const id = r[key];
      const label = r[labelKey] || id;
      if (id && !seen.has(id)) seen.set(id, label);
    });
    return Array.from(seen.entries()).sort((a, b) => String(a[1]).localeCompare(String(b[1]), "ru"));
  }

  function selectHtml(name, emptyLabel, options, selected) {
    return `<select data-hist-filter="${name}" aria-label="${UI.escapeHtml(emptyLabel)}">
      <option value="">${UI.escapeHtml(emptyLabel)}</option>
      ${options
        .map(([id, label]) => {
          const sel = String(id) === String(selected) ? " selected" : "";
          return `<option value="${UI.escapeHtml(id)}"${sel}>${UI.escapeHtml(label)}</option>`;
        })
        .join("")}
    </select>`;
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
    async load(productionId, nextLimit) {
      limit = nextLimit || PAGE;
      const requested =
        productionId !== undefined
          ? productionId
          : filters.production === null
            ? State.data.productionId
            : filters.production || null;
      let rows = [];
      try {
        rows = await DB.getHistory(requested || null, limit);
      } catch {
        if (!requested) rows = await DB.getHistory(State.data.productionId, limit);
        else throw new Error("history_load_failed");
      }
      State.cache.history = (rows || []).map(enrich);
      Offline.saveCache();
      return State.cache.history;
    },

    render(root) {
      if (!root) return;
      const all = (State.cache.history || []).map(enrich);
      const visible = applyFilters(all);
      const employees = (State.cache.employees || []).map((e) => [e.id, e.name]);
      const productions = (State.cache.productions || []).map((p) => [p.id, p.name]);
      const depts = uniqueOptions(all, "department_id", "department_name").filter((x) => x[0]);
      const items = uniqueOptions(all, "item_name", "item_name");
      const prodSelected = filters.production === null ? State.data.productionId || "" : filters.production;
      const canMore = all.length >= limit && limit < MAX;

      root.innerHTML = `
        <h2 class="panel-title">История изменений</h2>
        <div class="hist-filters">
          ${selectHtml("employee", "Все сотрудники", employees, filters.employee)}
          ${selectHtml("production", "Все производства", productions, prodSelected)}
          ${selectHtml("department", "Все отделы", depts, filters.department)}
          ${selectHtml("item", "Все позиции", items, filters.item)}
          <select data-hist-filter="period" aria-label="Период">
            <option value="today"${filters.period === "today" ? " selected" : ""}>Сегодня</option>
            <option value="yesterday"${filters.period === "yesterday" ? " selected" : ""}>Вчера</option>
            <option value="7"${filters.period === "7" ? " selected" : ""}>Последние 7 дней</option>
            <option value="30"${filters.period === "30" ? " selected" : ""}>Последние 30 дней</option>
            <option value="all"${filters.period === "all" ? " selected" : ""}>Всё время</option>
          </select>
          <input type="search" data-hist-search placeholder="Поиск по позиции" value="${UI.escapeHtml(filters.search)}" />
        </div>
        <div class="hist-list">${visible.map(cardHtml).join("")}</div>
        <p class="empty hist-empty${visible.length ? " hidden" : ""}">Нет записей по выбранным фильтрам.</p>
        ${canMore ? '<button type="button" class="btn btn-block" id="histMore">Показать ещё</button>' : ""}
      `;

      root.querySelectorAll("[data-hist-filter]").forEach((el) => {
        el.addEventListener("change", async () => {
          const key = el.getAttribute("data-hist-filter");
          filters[key] = el.value;
          if (key === "production") {
            try {
              await History.load(filters.production || null, limit);
            } catch {
              UI.toast("Не удалось загрузить историю", true);
            }
          }
          History.render(root);
        });
      });
      const search = root.querySelector("[data-hist-search]");
      if (search) {
        search.addEventListener("input", () => {
          filters.search = search.value;
          const list = root.querySelector(".hist-list");
          const empty = root.querySelector(".hist-empty");
          const next = applyFilters((State.cache.history || []).map(enrich));
          if (list) list.innerHTML = next.map(cardHtml).join("");
          if (empty) empty.classList.toggle("hidden", next.length > 0);
        });
      }
      const more = UI.$("#histMore", root);
      if (more) {
        more.addEventListener("click", async () => {
          try {
            await History.load(filters.production || State.data.productionId, Math.min(limit + PAGE, MAX));
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
