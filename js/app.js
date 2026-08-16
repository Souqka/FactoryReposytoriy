/**
 * Точка входа пользовательского приложения.
 */
(function () {
  let unsub = null;

  function currentEmployee() {
    return Employees.byId(State.data.employeeId);
  }

  function currentProduction() {
    return (State.cache.productions || []).find((p) => p.id === State.data.productionId);
  }

  function paintWorkspaceHeader() {
    const prod = currentProduction();
    const emp = currentEmployee();
    const nameEl = UI.$("#wsProductionName");
    const empName = UI.$("#wsEmployeeName");
    const empDot = UI.$("#wsEmployeeDot");
    if (nameEl) nameEl.textContent = prod ? prod.name : "Производство";
    if (empName) empName.textContent = emp ? emp.name : "";
    if (empDot) empDot.style.setProperty("--c", emp ? emp.color : "#64748b");
  }

  async function openWorkspace() {
    paintWorkspaceHeader();
    UI.showScreen("workspace");
    await refreshWorkspace();
    bindRealtime();
  }

  async function refreshWorkspace() {
    const id = State.data.productionId;
    if (!id) return;
    try {
      await Promise.all([
        Production.load(id),
        History.load(id),
        Notes.load(id),
        Goals.load(id),
      ]);
    } catch {
      const cached = Offline.loadCache();
      if (cached && cached.productionId === id) {
        State.cache.tree = cached.tree;
        State.cache.history = cached.history;
        State.cache.notes = cached.notes;
        State.cache.goal = cached.goal;
        State.cache.goals = cached.goals || (cached.goal ? [cached.goal] : []);
        State.cache.packedFact = cached.packedFact;
        UI.toast("Показаны сохранённые данные", true);
      }
    }
    renderActivePanel();
    Offline.renderStatus();
    if (typeof Notes !== "undefined") Notes.notifyIfAssigned();
  }

  function renderActivePanel() {
    const panel = State.data.panel || "items";
    UI.$all(".panel").forEach((el) => {
      el.classList.toggle("is-active", el.id === "panel-" + panel);
    });
    UI.$all(".dock button").forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.panel === panel);
    });
    if (panel === "items") Production.renderItems(UI.$("#panel-items"));
    if (panel === "history") History.render(UI.$("#panel-history"));
    if (panel === "notes") Notes.render(UI.$("#panel-notes"));
    if (panel === "goals") Goals.render(UI.$("#panel-goals"));
  }

  function bindRealtime() {
    if (unsub) {
      unsub();
      unsub = null;
    }
    unsub = DB.subscribe(async (evt) => {
      if (!State.data.productionId) return;
      if (evt.table === "items") {
        const row = evt.payload && evt.payload.new;
        const op = evt.payload && evt.payload.eventType;
        const applied = op !== "DELETE" && Production.applyRealtimeItem(row);
        if (!applied) {
          await Production.load(State.data.productionId);
          if (State.data.panel === "items") Production.renderItems(UI.$("#panel-items"));
        }
        if (State.data.panel === "goals") Goals.syncFromItems(UI.$("#panel-goals"));
        return;
      }
      if (evt.table === "change_history") {
        await History.load(State.data.productionId);
        if (State.data.panel === "history") History.render(UI.$("#panel-history"));
        return;
      }
      if (evt.table === "notes") {
        await Notes.load(State.data.productionId);
        Notes.notifyIfAssigned();
        if (State.data.panel === "notes") Notes.render(UI.$("#panel-notes"));
        return;
      }
      if (evt.table === "daily_goals" || evt.table === "packed_history") {
        if (typeof Goals !== "undefined" && Goals.saving) return;
        await Goals.load(State.data.productionId);
        if (State.data.panel === "goals") Goals.render(UI.$("#panel-goals"));
        return;
      }
      if (evt.type === "local") {
        if (State.data.panel === "goals") return;
        await refreshWorkspace();
        return;
      }
      if (["productions", "departments", "item_groups", "employees"].includes(evt.table) || evt.type === "storage") {
        await refreshWorkspace();
      }
    });
  }

  async function afterLogin() {
    try {
      await Employees.load();
    } catch (err) {
      console.warn("Employees.load:", err);
    }
    await renderEmployees();
    UI.showScreen("employee");
  }

  async function renderEmployees() {
    Employees.renderList(UI.$("#employeeList"));
  }

  async function renderProductions() {
    let list = State.cache.productions || [];
    try {
      list = await DB.getProductions();
      State.cache.productions = list;
      Offline.saveCache();
    } catch (err) {
      console.warn("getProductions:", err);
    }
    const root = UI.$("#productionList");
    if (!root) return;
    if (!list.length) {
      root.innerHTML = '<p class="empty">Производств нет. Создайте их в админ-панели.</p>';
      return;
    }
    root.innerHTML = list
      .map(
        (p) => `
        <button type="button" class="prod-btn" data-prod="${p.id}">${UI.escapeHtml(p.name)}</button>`
      )
      .join("");
    const emp = currentEmployee();
    const label = UI.$("#selectedEmployeeLabel");
    if (label) label.textContent = emp ? emp.name : "";
  }

  function bind() {
    const loginForm = UI.$("#loginForm");
    const loginInput = UI.$("#loginPassword");
    const loginSubmit = UI.$("#loginSubmit");
    const loginError = UI.$("#loginError");

    /* iOS: value often stays in the keyboard buffer until blur.
       Blur on pointerdown so submit reads 1980 on the first tap. */
    if (loginSubmit && loginInput) {
      loginSubmit.addEventListener("pointerdown", () => {
        loginInput.blur();
      });
    }

    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (loginInput) loginInput.blur();
      const password = String((loginInput && loginInput.value) || "").trim();
      loginError.textContent = "";
      if (!password) {
        loginError.textContent = "Введите пароль";
        if (loginInput) loginInput.focus();
        return;
      }
      if (loginSubmit) loginSubmit.disabled = true;
      try {
        const res = await Auth.login(password);
        if (!res.ok) {
          loginError.textContent =
            res.error === "too_many_attempts"
              ? "Слишком много попыток. Подождите 15 минут."
              : "Неверный пароль";
          return;
        }
        if (loginInput) loginInput.value = "";
        await afterLogin();
      } catch (err) {
        loginError.textContent =
          err && err.kind === "db_not_ready"
            ? "База не обновлена. В SQL Editor выполните schema.sql, затем policies.sql."
            : "Нет связи с базой";
      } finally {
        if (loginSubmit) loginSubmit.disabled = false;
      }
    });

    UI.$("#employeeList").addEventListener("click", async (e) => {
      const btn = e.target.closest("[data-emp]");
      if (!btn) return;
      try {
        await Auth.pickEmployee(btn.getAttribute("data-emp"));
      } catch (err) {
        console.warn("pickEmployee:", err);
      }
      await renderProductions();
      UI.showScreen("production-select");
    });

    UI.$("#productionList").addEventListener("click", async (e) => {
      const btn = e.target.closest("[data-prod]");
      if (!btn) return;
      State.setProduction(btn.getAttribute("data-prod"));
      try {
        await openWorkspace();
      } catch (err) {
        console.warn("openWorkspace:", err);
        UI.showScreen("workspace");
      }
    });

    UI.$("#backFromEmployee").addEventListener("click", async () => {
      await Auth.logout();
      UI.showScreen("login");
    });

    UI.$("#backFromProdSelect").addEventListener("click", () => {
      UI.showScreen("employee");
    });

    UI.$all(".dock button").forEach((btn) => {
      btn.addEventListener("click", async () => {
        State.setPanel(btn.dataset.panel);
        if (btn.dataset.panel === "history") await History.load(State.data.productionId);
        if (btn.dataset.panel === "notes") await Notes.load(State.data.productionId);
        if (btn.dataset.panel === "goals") await Goals.load(State.data.productionId);
        renderActivePanel();
      });
    });

    const menuBtn = UI.$("#wsMenuBtn");
    const menu = UI.$("#wsMenu");
    menuBtn.addEventListener("click", () => menu.classList.toggle("is-open"));
    document.addEventListener("click", (e) => {
      if (!e.target.closest(".menu")) menu.classList.remove("is-open");
    });

    UI.$("#menuChangeProd").addEventListener("click", async () => {
      menu.classList.remove("is-open");
      await renderProductions();
      UI.showScreen("production-select");
    });
    UI.$("#menuChangeEmp").addEventListener("click", () => {
      menu.classList.remove("is-open");
      UI.showScreen("employee");
    });
    UI.$("#menuAdmin").addEventListener("click", () => {
      window.location.href = "./admin.html";
    });
    UI.$("#menuLogout").addEventListener("click", async () => {
      await Auth.logout();
      UI.showScreen("login");
    });
  }

  async function boot() {
    UI.applyTheme();
    UI.applyQtySteppers();
    UI.bindThemeToggles();
    const mode = DB.init();
    Offline.init();
    bind();

    if (mode === "local") {
      UI.$("#setupHint").classList.remove("hidden");
    }

    const cached = Offline.loadCache();
    if (cached) {
      State.cache.employees = cached.employees || [];
      State.cache.productions = cached.productions || [];
      State.cache.tree = cached.tree;
      State.cache.history = cached.history || [];
      State.cache.notes = cached.notes || [];
      State.cache.goal = cached.goal;
      State.cache.goals = cached.goals || (cached.goal ? [cached.goal] : []);
      State.cache.packedFact = cached.packedFact || 0;
    }

    const ok = await Auth.restore();
    if (!ok) {
      UI.showScreen("login");
      return;
    }
    try {
      await Employees.load();
    } catch {
      /* cache already loaded */
    }
    if (!State.data.employeeId) {
      UI.showScreen("employee");
      await renderEmployees();
      return;
    }
    if (!State.data.productionId) {
      await renderProductions();
      UI.showScreen("production-select");
      return;
    }
    try {
      State.cache.productions = await DB.getProductions();
    } catch {
      /* cache */
    }
    await openWorkspace();
  }

  window.App = { refreshWorkspace };
  document.addEventListener("DOMContentLoaded", boot);
})();
