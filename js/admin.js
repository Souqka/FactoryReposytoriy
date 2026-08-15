/**
 * Визуальный конфигуратор: производства → отделы → группы → позиции.
 * Drag & drop на ПК, кнопки вверх/вниз на телефоне.
 */
(function () {
  const view = {
    tab: "productions",
    productionId: null,
    departmentId: null,
    groupId: null,
  };

  function token() {
    return State.token();
  }

  function confirmDelete(label) {
    return window.confirm(`Удалить: ${label}?`);
  }

  async function save(entity, data) {
    const res = await DB.adminSave(token(), entity, data);
    if (!res || !res.ok) throw new Error((res && res.error) || "save_failed");
    return res.row;
  }

  async function remove(entity, id, label) {
    if (!confirmDelete(label)) return false;
    await DB.adminDelete(token(), entity, id);
    return true;
  }

  async function reorder(entity, ids) {
    await DB.adminReorder(token(), entity, ids);
  }

  function move(list, id, dir) {
    const ids = list.map((x) => x.id);
    const i = ids.indexOf(id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= ids.length) return ids;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    return ids;
  }

  function bindReorder(root, entity, getList, after) {
    root.querySelectorAll("[data-up]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const ids = move(getList(), btn.getAttribute("data-up"), -1);
        await reorder(entity, ids);
        after();
      });
    });
    root.querySelectorAll("[data-down]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const ids = move(getList(), btn.getAttribute("data-down"), 1);
        await reorder(entity, ids);
        after();
      });
    });

    let dragId = null;
    root.querySelectorAll(".config-row").forEach((row) => {
      const handle = row.querySelector(".handle");
      if (!handle) return;
      handle.setAttribute("draggable", "true");
      handle.addEventListener("dragstart", (e) => {
        dragId = row.getAttribute("data-id");
        row.classList.add("is-dragging");
        e.dataTransfer.effectAllowed = "move";
      });
      handle.addEventListener("dragend", () => row.classList.remove("is-dragging"));
      row.addEventListener("dragover", (e) => {
        e.preventDefault();
      });
      row.addEventListener("drop", async (e) => {
        e.preventDefault();
        const targetId = row.getAttribute("data-id");
        if (!dragId || dragId === targetId) return;
        const ids = getList().map((x) => x.id);
        const from = ids.indexOf(dragId);
        const to = ids.indexOf(targetId);
        if (from < 0 || to < 0) return;
        ids.splice(to, 0, ids.splice(from, 1)[0]);
        await reorder(entity, ids);
        after();
      });
    });
  }

  function rowChrome(id) {
    return `
      <div class="handle" title="Перетащите">☰</div>
      <div class="grow"></div>
      <div class="row-btns">
        <button type="button" class="reorder-btn" data-up="${id}" aria-label="Выше">▲</button>
        <button type="button" class="reorder-btn" data-down="${id}" aria-label="Ниже">▼</button>
      </div>`;
  }

  async function renderProductions(root) {
    const list = await DB.getAllProductions();
    root.innerHTML = `
      <div class="admin-toolbar">
        <h2>Производства</h2>
        <button type="button" class="btn btn-primary" id="addProd">Добавить</button>
      </div>
      <p class="admin-hint">Порядок: перетащите ☰ на компьютере или стрелки на телефоне. Откройте производство, чтобы настроить отделы.</p>
      <div class="config-list" id="prodRows"></div>
    `;
    const host = UI.$("#prodRows", root);
    host.innerHTML = list
      .map(
        (p) => `
        <div class="config-row" data-id="${p.id}">
          ${rowChrome(p.id).replace('<div class="grow"></div>', `
            <div class="grow">
              <input type="text" data-rename="${p.id}" value="${UI.escapeHtml(p.name)}" />
              <div class="row-actions">
                <button type="button" class="btn" data-open="${p.id}">Отделы</button>
                <button type="button" class="mini-btn" data-del="${p.id}">Удалить</button>
              </div>
            </div>`)}
        </div>`
      )
      .join("");

    UI.$("#addProd", root).addEventListener("click", async () => {
      const row = await save("production", { name: "Новое производство", sort_order: list.length, active: true });
      if (row && row.id) {
        await save("department", { production_id: row.id, name: "Запасы", icon: "📦", sort_order: 0, active: true });
        await save("department", { production_id: row.id, name: "Производство", icon: "⚙️", sort_order: 1, active: true });
        await save("department", { production_id: row.id, name: "Сборка", icon: "🔧", sort_order: 2, active: true });
      }
      renderProductions(root);
    });

    host.querySelectorAll("[data-rename]").forEach((input) => {
      input.addEventListener("change", async () => {
        await save("production", { id: input.getAttribute("data-rename"), name: input.value.trim() || "Без названия" });
        UI.toast("Сохранено");
      });
    });
    host.querySelectorAll("[data-open]").forEach((btn) => {
      btn.addEventListener("click", () => {
        view.productionId = btn.getAttribute("data-open");
        view.departmentId = null;
        view.groupId = null;
        renderMain();
      });
    });
    host.querySelectorAll("[data-del]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const p = list.find((x) => x.id === btn.getAttribute("data-del"));
        if (await remove("production", p.id, p.name)) renderProductions(root);
      });
    });
    bindReorder(host, "production", () => list, () => renderProductions(root));
  }

  async function renderDepartments(root) {
    const productions = await DB.getAllProductions();
    const prod = productions.find((p) => p.id === view.productionId);
    if (!prod) {
      view.productionId = null;
      return renderProductions(root);
    }
    const tree = await DB.getAdminTree(prod.id);
    root.innerHTML = `
      <div class="crumb">
        <button type="button" id="toProds">Производства</button>
        <span>/</span><span>${UI.escapeHtml(prod.name)}</span>
      </div>
      <div class="admin-toolbar">
        <h2>Отделы</h2>
        <button type="button" class="btn btn-primary" id="addDept">Добавить отдел</button>
      </div>
      <div class="config-list" id="deptRows"></div>
    `;
    UI.$("#toProds", root).addEventListener("click", () => {
      view.productionId = null;
      renderMain();
    });
    const host = UI.$("#deptRows", root);
    host.innerHTML = tree
      .map(
        (d) => `
        <div class="config-row" data-id="${d.id}">
          ${rowChrome(d.id).replace('<div class="grow"></div>', `
            <div class="grow">
              <div style="display:flex;gap:8px;align-items:center">
                <input type="text" style="max-width:72px" data-icon="${d.id}" value="${UI.escapeHtml(d.icon || "")}" />
                <input type="text" data-rename="${d.id}" value="${UI.escapeHtml(d.name)}" />
              </div>
              <div class="row-actions">
                <button type="button" class="btn" data-open="${d.id}">Группы</button>
                <button type="button" class="mini-btn" data-del="${d.id}">Удалить</button>
              </div>
            </div>`)}
        </div>`
      )
      .join("");

    UI.$("#addDept", root).addEventListener("click", async () => {
      await save("department", {
        production_id: prod.id,
        name: "Новый отдел",
        icon: "📦",
        sort_order: tree.length,
        active: true,
      });
      renderDepartments(root);
    });
    host.querySelectorAll("[data-rename]").forEach((input) => {
      input.addEventListener("change", async () => {
        await save("department", { id: input.getAttribute("data-rename"), name: input.value.trim() || "Отдел" });
      });
    });
    host.querySelectorAll("[data-icon]").forEach((input) => {
      input.addEventListener("change", async () => {
        await save("department", { id: input.getAttribute("data-icon"), icon: input.value.trim() || "📦" });
      });
    });
    host.querySelectorAll("[data-open]").forEach((btn) => {
      btn.addEventListener("click", () => {
        view.departmentId = btn.getAttribute("data-open");
        view.groupId = null;
        renderMain();
      });
    });
    host.querySelectorAll("[data-del]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const d = tree.find((x) => x.id === btn.getAttribute("data-del"));
        if (await remove("department", d.id, d.name)) renderDepartments(root);
      });
    });
    bindReorder(host, "department", () => tree, () => renderDepartments(root));
  }

  async function renderGroups(root) {
    const productions = await DB.getAllProductions();
    const prod = productions.find((p) => p.id === view.productionId);
    const tree = await DB.getAdminTree(prod.id);
    const dept = tree.find((d) => d.id === view.departmentId);
    if (!dept) {
      view.departmentId = null;
      return renderDepartments(root);
    }
    const groups = dept.groups || [];
    root.innerHTML = `
      <div class="crumb">
        <button type="button" id="toProds">Производства</button>
        <span>/</span>
        <button type="button" id="toDepts">${UI.escapeHtml(prod.name)}</button>
        <span>/</span><span>${UI.escapeHtml(dept.icon || "")} ${UI.escapeHtml(dept.name)}</span>
      </div>
      <div class="admin-toolbar">
        <h2>Группы</h2>
        <button type="button" class="btn btn-primary" id="addGroup">Добавить группу</button>
      </div>
      <div class="config-list" id="groupRows"></div>
    `;
    UI.$("#toProds", root).addEventListener("click", () => {
      view.productionId = null;
      view.departmentId = null;
      renderMain();
    });
    UI.$("#toDepts", root).addEventListener("click", () => {
      view.departmentId = null;
      renderMain();
    });
    const host = UI.$("#groupRows", root);
    host.innerHTML = groups
      .map(
        (g) => `
        <div class="config-row" data-id="${g.id}">
          ${rowChrome(g.id).replace('<div class="grow"></div>', `
            <div class="grow">
              <input type="text" data-rename="${g.id}" value="${UI.escapeHtml(g.name)}" />
              <div class="row-actions">
                <button type="button" class="btn" data-open="${g.id}">Позиции</button>
                <button type="button" class="mini-btn" data-del="${g.id}">Удалить</button>
              </div>
            </div>`)}
        </div>`
      )
      .join("");

    UI.$("#addGroup", root).addEventListener("click", async () => {
      await save("group", { department_id: dept.id, name: "Новая группа", sort_order: groups.length, active: true });
      renderGroups(root);
    });
    host.querySelectorAll("[data-rename]").forEach((input) => {
      input.addEventListener("change", async () => {
        await save("group", { id: input.getAttribute("data-rename"), name: input.value.trim() || "Группа" });
      });
    });
    host.querySelectorAll("[data-open]").forEach((btn) => {
      btn.addEventListener("click", () => {
        view.groupId = btn.getAttribute("data-open");
        renderMain();
      });
    });
    host.querySelectorAll("[data-del]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const g = groups.find((x) => x.id === btn.getAttribute("data-del"));
        if (await remove("group", g.id, g.name)) renderGroups(root);
      });
    });
    bindReorder(host, "group", () => groups, () => renderGroups(root));
  }

  async function renderItems(root) {
    const productions = await DB.getAllProductions();
    const prod = productions.find((p) => p.id === view.productionId);
    const tree = await DB.getAdminTree(prod.id);
    const dept = tree.find((d) => d.id === view.departmentId);
    const group = (dept.groups || []).find((g) => g.id === view.groupId);
    if (!group) {
      view.groupId = null;
      return renderGroups(root);
    }
    const items = group.items || [];
    root.innerHTML = `
      <div class="crumb">
        <button type="button" id="toProds">Производства</button>
        <span>/</span>
        <button type="button" id="toDepts">${UI.escapeHtml(prod.name)}</button>
        <span>/</span>
        <button type="button" id="toGroups">${UI.escapeHtml(dept.name)}</button>
        <span>/</span><span>${UI.escapeHtml(group.name)}</span>
      </div>
      <div class="admin-toolbar">
        <h2>Позиции</h2>
        <button type="button" class="btn btn-primary" id="addItem">Добавить позицию</button>
      </div>
      <div class="config-list" id="itemRows"></div>
    `;
    UI.$("#toProds", root).addEventListener("click", () => {
      view.productionId = view.departmentId = view.groupId = null;
      renderMain();
    });
    UI.$("#toDepts", root).addEventListener("click", () => {
      view.departmentId = view.groupId = null;
      renderMain();
    });
    UI.$("#toGroups", root).addEventListener("click", () => {
      view.groupId = null;
      renderMain();
    });
    const host = UI.$("#itemRows", root);
    host.innerHTML = items
      .map(
        (it) => `
        <div class="config-row" data-id="${it.id}">
          ${rowChrome(it.id).replace('<div class="grow"></div>', `
            <div class="grow">
              <input type="text" data-rename="${it.id}" value="${UI.escapeHtml(it.name)}" />
              <div class="qty-mini">
                <label>Кол-во<input type="number" min="0" data-qty="${it.id}" value="${it.quantity}" /></label>
                <label>Минимум<input type="number" min="0" data-min="${it.id}" value="${it.min_limit}" /></label>
              </div>
              <label style="display:flex;gap:8px;align-items:center;margin-top:6px;font-size:13px;color:var(--muted)">
                <input type="checkbox" data-active="${it.id}" ${it.active ? "checked" : ""} /> Активна
              </label>
              <div class="row-actions">
                <button type="button" class="mini-btn" data-del="${it.id}">Удалить</button>
              </div>
            </div>`)}
        </div>`
      )
      .join("");

    UI.$("#addItem", root).addEventListener("click", async () => {
      await save("item", { group_id: group.id, name: "Новая позиция", quantity: 0, min_limit: 0, sort_order: items.length, active: true });
      renderItems(root);
    });

    const patch = async (id, data) => {
      await save("item", { id, ...data });
    };
    host.querySelectorAll("[data-rename]").forEach((input) => {
      input.addEventListener("change", () => patch(input.getAttribute("data-rename"), { name: input.value.trim() || "Позиция" }));
    });
    host.querySelectorAll("[data-qty]").forEach((input) => {
      input.addEventListener("change", () => patch(input.getAttribute("data-qty"), { quantity: Math.max(0, parseInt(input.value, 10) || 0) }));
    });
    host.querySelectorAll("[data-min]").forEach((input) => {
      input.addEventListener("change", () => patch(input.getAttribute("data-min"), { min_limit: Math.max(0, parseInt(input.value, 10) || 0) }));
    });
    host.querySelectorAll("[data-active]").forEach((input) => {
      input.addEventListener("change", () => patch(input.getAttribute("data-active"), { active: input.checked }));
    });
    host.querySelectorAll("[data-del]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const it = items.find((x) => x.id === btn.getAttribute("data-del"));
        if (await remove("item", it.id, it.name)) renderItems(root);
      });
    });
    bindReorder(host, "item", () => items, () => renderItems(root));
  }

  async function renderEmployees(root) {
    const list = await DB.getAllEmployees();
    root.innerHTML = `
      <div class="admin-toolbar">
        <h2>Сотрудники</h2>
        <button type="button" class="btn btn-primary" id="addEmp">Добавить</button>
      </div>
      <p class="admin-hint">Цвет используется в истории изменений. Удаление деактивирует сотрудника, чтобы не ломать прошлые записи.</p>
      <div class="config-list" id="empRows"></div>
    `;
    const host = UI.$("#empRows", root);
    host.innerHTML = list
      .map(
        (e) => `
        <div class="config-row" data-id="${e.id}">
          ${rowChrome(e.id).replace('<div class="grow"></div>', `
            <div class="grow">
              <div style="display:flex;gap:8px;align-items:center">
                <input class="color-input" type="color" data-color="${e.id}" value="${UI.escapeHtml(e.color)}" />
                <input type="text" data-rename="${e.id}" value="${UI.escapeHtml(e.name)}" />
              </div>
              <label style="display:flex;gap:8px;align-items:center;margin-top:6px;font-size:13px;color:var(--muted)">
                <input type="checkbox" data-active="${e.id}" ${e.active ? "checked" : ""} /> Активен
              </label>
              <div class="row-actions">
                <button type="button" class="mini-btn" data-del="${e.id}">Деактивировать</button>
              </div>
            </div>`)}
        </div>`
      )
      .join("");

    UI.$("#addEmp", root).addEventListener("click", async () => {
      await save("employee", { name: "Новый сотрудник", color: "#64748b", sort_order: list.length, active: true });
      renderEmployees(root);
    });
    host.querySelectorAll("[data-rename]").forEach((input) => {
      input.addEventListener("change", () => save("employee", { id: input.getAttribute("data-rename"), name: input.value.trim() || "Сотрудник" }));
    });
    host.querySelectorAll("[data-color]").forEach((input) => {
      input.addEventListener("change", () => save("employee", { id: input.getAttribute("data-color"), color: input.value }));
    });
    host.querySelectorAll("[data-active]").forEach((input) => {
      input.addEventListener("change", () => save("employee", { id: input.getAttribute("data-active"), active: input.checked }));
    });
    host.querySelectorAll("[data-del]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const e = list.find((x) => x.id === btn.getAttribute("data-del"));
        if (await remove("employee", e.id, e.name)) renderEmployees(root);
      });
    });
    bindReorder(host, "employee", () => list, () => renderEmployees(root));
  }

  function renderAbout(root) {
    root.innerHTML = `
      <h2>Как это устроено</h2>
      <p class="admin-hint">Администратор меняет структуру сайта здесь, без правки кода.</p>
      <ul style="line-height:1.6;color:var(--muted)">
        <li>Производства, отделы, группы и позиции хранятся в отдельных таблицах PostgreSQL.</li>
        <li>Пароль админа проверяется RPC-функцией, не условием в JavaScript.</li>
        <li>Клиент использует только anon key. service_role в репозиторий не кладётся.</li>
        <li>Запись количества идёт через compare-and-swap, чтобы старый запрос не затёр новый.</li>
        <li>Позже вход можно заменить на Supabase Auth — экраны и таблицы менять не придётся.</li>
      </ul>
      <p><a href="./index.html" style="color:var(--accent)">Открыть рабочий экран</a></p>
    `;
  }

  async function renderMain() {
    const root = UI.$("#adminMain");
    try {
      if (view.tab === "employees") return renderEmployees(root);
      if (view.tab === "about") return renderAbout(root);
      if (view.groupId) return renderItems(root);
      if (view.departmentId) return renderGroups(root);
      if (view.productionId) return renderDepartments(root);
      return renderProductions(root);
    } catch (err) {
      root.innerHTML = `<p class="form-error">Ошибка загрузки: ${UI.escapeHtml(err.message || err)}</p>`;
    }
  }

  function bindNav() {
    UI.$("#adminNav").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-admin-tab]");
      if (!btn) return;
      view.tab = btn.dataset.adminTab;
      view.productionId = view.departmentId = view.groupId = null;
      UI.$all("#adminNav button").forEach((b) => b.classList.toggle("is-active", b === btn));
      renderMain();
    });
  }

  async function boot() {
    UI.applyTheme();
    UI.bindThemeToggles();
    DB.init();
    Offline.init();
    bindNav();

    UI.$("#adminLoginForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      UI.$("#adminLoginError").textContent = "";
      try {
        const res = await Auth.login(UI.$("#adminPassword").value);
        if (!res.ok || res.role !== "admin") {
          UI.$("#adminLoginError").textContent =
            res.error === "too_many_attempts"
              ? "Слишком много попыток. Подождите 15 минут."
              : "Нужен пароль администратора";
          if (res.ok) await Auth.logout();
          return;
        }
        UI.showScreen("admin");
        renderMain();
      } catch {
        UI.$("#adminLoginError").textContent = "Нет связи с базой";
      }
    });

    UI.$("#adminLogout").addEventListener("click", async () => {
      await Auth.logout();
      UI.showScreen("login");
    });

    const ok = await Auth.restore();
    if (ok && State.isAdmin()) {
      UI.showScreen("admin");
      renderMain();
    }
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
