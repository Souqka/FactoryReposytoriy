/**
 * Локальный адаптер (localStorage).
 * Нужен, чтобы разрабатывать UI без Supabase и открывать сайт до настройки ключей.
 * Пароли сравниваются по SHA-256, не строкой if (password === "...").
 * Это всё равно клиентская проверка — только для демо. Боевой контур: RPC в db-supabase.js.
 */
(function (global) {
  const STORE = "factory.db.v1";

  const USER_HASH = "051c2e380d07844ffaca43743957f8c0efe2bdf74c6c1e6a9dcccb8d1a3c596b";
  const ADMIN_HASH = "1c053d3970411ca6bf88c28c07c635079acad2c969baf0ecccf3f53918320eb9";

  async function sha256hex(text) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  function seed() {
    return {
      employees: [
        { id: "11111111-1111-1111-1111-111111111001", name: "Артур", color: "#3b82f6", active: true, sort_order: 0, created_at: new Date().toISOString() },
        { id: "11111111-1111-1111-1111-111111111002", name: "Глеб", color: "#22c55e", active: true, sort_order: 1, created_at: new Date().toISOString() },
        { id: "11111111-1111-1111-1111-111111111003", name: "Илья", color: "#eab308", active: true, sort_order: 2, created_at: new Date().toISOString() },
        { id: "11111111-1111-1111-1111-111111111004", name: "Константин", color: "#a855f7", active: true, sort_order: 3, created_at: new Date().toISOString() },
        { id: "11111111-1111-1111-1111-111111111005", name: "Майа", color: "#ec4899", active: true, sort_order: 4, created_at: new Date().toISOString() },
        { id: "11111111-1111-1111-1111-111111111006", name: "Вика", color: "#f97316", active: true, sort_order: 5, created_at: new Date().toISOString() },
      ],
      productions: [
        { id: "22222222-2222-2222-2222-222222222001", name: "Производство 1", active: true, sort_order: 0 },
        { id: "22222222-2222-2222-2222-222222222002", name: "Производство 2", active: true, sort_order: 1 },
      ],
      departments: [
        { id: "33333333-3333-3333-3333-333333333001", production_id: "22222222-2222-2222-2222-222222222001", name: "Запасы", icon: "📦", active: true, sort_order: 0 },
        { id: "33333333-3333-3333-3333-333333333002", production_id: "22222222-2222-2222-2222-222222222001", name: "Производство", icon: "⚙️", active: true, sort_order: 1 },
        { id: "33333333-3333-3333-3333-333333333003", production_id: "22222222-2222-2222-2222-222222222001", name: "Сборка", icon: "🔧", active: true, sort_order: 2 },
        { id: "33333333-3333-3333-3333-333333333011", production_id: "22222222-2222-2222-2222-222222222002", name: "Запасы", icon: "📦", active: true, sort_order: 0 },
        { id: "33333333-3333-3333-3333-333333333012", production_id: "22222222-2222-2222-2222-222222222002", name: "Производство", icon: "⚙️", active: true, sort_order: 1 },
        { id: "33333333-3333-3333-3333-333333333013", production_id: "22222222-2222-2222-2222-222222222002", name: "Сборка", icon: "🔧", active: true, sort_order: 2 },
      ],
      item_groups: [
        { id: "44444444-4444-4444-4444-444444444001", department_id: "33333333-3333-3333-3333-333333333001", name: "Скотч", active: true, sort_order: 0 },
        { id: "44444444-4444-4444-4444-444444444002", department_id: "33333333-3333-3333-3333-333333333001", name: "Крючки", active: true, sort_order: 1 },
        { id: "44444444-4444-4444-4444-444444444003", department_id: "33333333-3333-3333-3333-333333333001", name: "Клей", active: true, sort_order: 2 },
        { id: "44444444-4444-4444-4444-444444444004", department_id: "33333333-3333-3333-3333-333333333001", name: "Рамки", active: true, sort_order: 3 },
        { id: "44444444-4444-4444-4444-444444444005", department_id: "33333333-3333-3333-3333-333333333001", name: "Одиночные", active: true, sort_order: 4 },
        { id: "44444444-4444-4444-4444-444444444011", department_id: "33333333-3333-3333-3333-333333333002", name: "Заготовки", active: true, sort_order: 0 },
        { id: "44444444-4444-4444-4444-444444444012", department_id: "33333333-3333-3333-3333-333333333002", name: "В работе", active: true, sort_order: 1 },
        { id: "44444444-4444-4444-4444-444444444021", department_id: "33333333-3333-3333-3333-333333333003", name: "Готово к сборке", active: true, sort_order: 0 },
        { id: "44444444-4444-4444-4444-444444444022", department_id: "33333333-3333-3333-3333-333333333003", name: "Упаковка", active: true, sort_order: 1 },
        { id: "44444444-4444-4444-4444-444444444101", department_id: "33333333-3333-3333-3333-333333333011", name: "Материалы", active: true, sort_order: 0 },
        { id: "44444444-4444-4444-4444-444444444102", department_id: "33333333-3333-3333-3333-333333333012", name: "Линия", active: true, sort_order: 0 },
        { id: "44444444-4444-4444-4444-444444444103", department_id: "33333333-3333-3333-3333-333333333013", name: "Сборка", active: true, sort_order: 0 },
      ],
      items: [
        { id: "55555555-5555-5555-5555-555555555001", group_id: "44444444-4444-4444-4444-444444444001", name: "Жёлтый", quantity: 24, min_limit: 10, active: true, sort_order: 0, version: 1 },
        { id: "55555555-5555-5555-5555-555555555002", group_id: "44444444-4444-4444-4444-444444444001", name: "Прозрачный", quantity: 18, min_limit: 8, active: true, sort_order: 1, version: 1 },
        { id: "55555555-5555-5555-5555-555555555003", group_id: "44444444-4444-4444-4444-444444444002", name: "Чёрные", quantity: 42, min_limit: 15, active: true, sort_order: 0, version: 1 },
        { id: "55555555-5555-5555-5555-555555555004", group_id: "44444444-4444-4444-4444-444444444002", name: "Белые", quantity: 17, min_limit: 10, active: true, sort_order: 1, version: 1 },
        { id: "55555555-5555-5555-5555-555555555005", group_id: "44444444-4444-4444-4444-444444444003", name: "Универсальный", quantity: 12, min_limit: 5, active: true, sort_order: 0, version: 1 },
        { id: "55555555-5555-5555-5555-555555555006", group_id: "44444444-4444-4444-4444-444444444004", name: "Чёрные", quantity: 30, min_limit: 10, active: true, sort_order: 0, version: 1 },
        { id: "55555555-5555-5555-5555-555555555007", group_id: "44444444-4444-4444-4444-444444444004", name: "Белые", quantity: 22, min_limit: 10, active: true, sort_order: 1, version: 1 },
        { id: "55555555-5555-5555-5555-555555555008", group_id: "44444444-4444-4444-4444-444444444005", name: "Комплект А", quantity: 8, min_limit: 3, active: true, sort_order: 0, version: 1 },
        { id: "55555555-5555-5555-5555-555555555011", group_id: "44444444-4444-4444-4444-444444444011", name: "Рама 30×40", quantity: 16, min_limit: 5, active: true, sort_order: 0, version: 1 },
        { id: "55555555-5555-5555-5555-555555555012", group_id: "44444444-4444-4444-4444-444444444011", name: "Рама 40×50", quantity: 9, min_limit: 4, active: true, sort_order: 1, version: 1 },
        { id: "55555555-5555-5555-5555-555555555013", group_id: "44444444-4444-4444-4444-444444444012", name: "Партия #12", quantity: 3, min_limit: 1, active: true, sort_order: 0, version: 1 },
        { id: "55555555-5555-5555-5555-555555555021", group_id: "44444444-4444-4444-4444-444444444021", name: "Комплект рам", quantity: 14, min_limit: 6, active: true, sort_order: 0, version: 1 },
        { id: "55555555-5555-5555-5555-555555555022", group_id: "44444444-4444-4444-4444-444444444022", name: "Коробки", quantity: 40, min_limit: 15, active: true, sort_order: 0, version: 1 },
        { id: "55555555-5555-5555-5555-555555555101", group_id: "44444444-4444-4444-4444-444444444101", name: "Профиль", quantity: 20, min_limit: 8, active: true, sort_order: 0, version: 1 },
        { id: "55555555-5555-5555-5555-555555555102", group_id: "44444444-4444-4444-4444-444444444102", name: "Станок 1", quantity: 5, min_limit: 1, active: true, sort_order: 0, version: 1 },
        { id: "55555555-5555-5555-5555-555555555103", group_id: "44444444-4444-4444-4444-444444444103", name: "Готовые", quantity: 11, min_limit: 4, active: true, sort_order: 0, version: 1 },
      ],
      change_history: [],
      notes: [],
      daily_goals: [
        { id: UI.uid(), production_id: "22222222-2222-2222-2222-222222222001", goal_date: UI.todayISO(), target: 100, label: "упакованных рамок" },
      ],
      packed_history: [],
      sessions: [],
      login_attempts: [],
    };
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORE);
      if (!raw) return seed();
      const db = JSON.parse(raw);
      const base = seed();
      for (const k of Object.keys(base)) {
        if (!Array.isArray(db[k])) db[k] = base[k];
      }
      return db;
    } catch {
      return seed();
    }
  }

  let db = load();
  const listeners = new Set();

  function save() {
    localStorage.setItem(STORE, JSON.stringify(db));
    listeners.forEach((fn) => {
      try { fn({ type: "local" }); } catch { /* ignore */ }
    });
  }

  function sessionByToken(token) {
    const s = db.sessions.find((x) => x.token === token);
    if (!s) return null;
    if (new Date(s.expires_at).getTime() < Date.now()) return null;
    return s;
  }

  function requireSession(token, adminOnly) {
    const s = sessionByToken(token);
    if (!s) throw new Error("invalid_session");
    if (adminOnly && s.role !== "admin") throw new Error("forbidden");
    s.expires_at = new Date(Date.now() + 12 * 3600 * 1000).toISOString();
    return s;
  }

  function productionIdForItem(itemId) {
    const item = db.items.find((i) => i.id === itemId && i.active);
    if (!item) return null;
    const group = db.item_groups.find((g) => g.id === item.group_id && g.active);
    if (!group) return null;
    const dept = db.departments.find((d) => d.id === group.department_id && d.active);
    if (!dept) return null;
    const prod = db.productions.find((p) => p.id === dept.production_id && p.active);
    return prod ? prod.id : null;
  }

  function sortByOrder(list) {
    return [...list].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  }

  const LocalDB = {
    mode: "local",

    async login(password, clientKey) {
      const key = String(clientKey || "anonymous").slice(0, 80);
      db.login_attempts = db.login_attempts || [];
      const since = Date.now() - 15 * 60 * 1000;
      const fails = db.login_attempts.filter(
        (a) => a.client_key === key && !a.success && new Date(a.created_at).getTime() > since
      );
      if (fails.length >= 5) {
        db.login_attempts.push({ client_key: key, success: false, created_at: new Date().toISOString() });
        save();
        return { ok: false, error: "too_many_attempts" };
      }
      const hash = await sha256hex(password);
      let role = null;
      if (hash === ADMIN_HASH) role = "admin";
      else if (hash === USER_HASH) role = "user";
      if (!role) {
        db.login_attempts.push({ client_key: key, success: false, created_at: new Date().toISOString() });
        save();
        return { ok: false, error: "invalid_password" };
      }
      db.login_attempts.push({ client_key: key, success: true, created_at: new Date().toISOString() });
      const session = {
        id: UI.uid(),
        token: UI.uid().replace(/-/g, "") + UI.uid().replace(/-/g, ""),
        role,
        employee_id: null,
        expires_at: new Date(Date.now() + 12 * 3600 * 1000).toISOString(),
      };
      db.sessions.push(session);
      save();
      return { ok: true, role, token: session.token, expires_at: session.expires_at };
    },

    async logout(token) {
      db.sessions = db.sessions.filter((s) => s.token !== token);
      save();
      return { ok: true };
    },

    async session(token) {
      const s = sessionByToken(token);
      if (!s) return { ok: false };
      return { ok: true, role: s.role, employee_id: s.employee_id, expires_at: s.expires_at };
    },

    async setEmployee(token, employeeId) {
      const s = requireSession(token, false);
      const emp = db.employees.find((e) => e.id === employeeId && e.active);
      if (!emp) return { ok: false, error: "employee_not_found" };
      s.employee_id = employeeId;
      save();
      return { ok: true, employee_id: employeeId };
    },

    async getEmployees() {
      return sortByOrder(db.employees.filter((e) => e.active));
    },

    async getAllEmployees() {
      return sortByOrder(db.employees);
    },

    async getProductions() {
      return sortByOrder(db.productions.filter((p) => p.active));
    },

    async getAllProductions() {
      return sortByOrder(db.productions);
    },

    async getTree(productionId) {
      const departments = sortByOrder(db.departments.filter((d) => d.production_id === productionId && d.active));
      return departments.map((dept) => {
        const groups = sortByOrder(db.item_groups.filter((g) => g.department_id === dept.id && g.active));
        return {
          ...dept,
          groups: groups.map((g) => ({
            ...g,
            items: sortByOrder(db.items.filter((i) => i.group_id === g.id && i.active)),
          })),
        };
      });
    },

    async getAdminTree(productionId) {
      const departments = sortByOrder(db.departments.filter((d) => d.production_id === productionId));
      return departments.map((dept) => {
        const groups = sortByOrder(db.item_groups.filter((g) => g.department_id === dept.id));
        return {
          ...dept,
          groups: groups.map((g) => ({
            ...g,
            items: sortByOrder(db.items.filter((i) => i.group_id === g.id)),
          })),
        };
      });
    },

    async updateItemQuantity(token, itemId, oldQty, newQty) {
      const session = requireSession(token, false);
      if (!session.employee_id) return { ok: false, error: "employee_required" };
      const emp = db.employees.find((e) => e.id === session.employee_id && e.active);
      if (!emp) return { ok: false, error: "employee_inactive" };
      if (newQty < 0 || !Number.isFinite(newQty)) return { ok: false, error: "invalid_quantity" };
      const productionId = productionIdForItem(itemId);
      if (!productionId) return { ok: false, error: "item_not_found" };
      const item = db.items.find((i) => i.id === itemId);
      if (!item || !item.active) return { ok: false, error: "item_not_found" };
      if (item.is_sum) return { ok: false, error: "sum_item" };
      if (item.quantity !== oldQty) {
        return { ok: false, error: "conflict", quantity: item.quantity, version: item.version };
      }
      item.quantity = newQty;
      item.version = (item.version || 1) + 1;
      item.updated_at = new Date().toISOString();
      db.change_history.unshift({
        id: UI.uid(),
        production_id: productionId,
        item_id: itemId,
        employee_id: session.employee_id,
        item_name: item.name,
        old_value: oldQty,
        new_value: newQty,
        difference: newQty - oldQty,
        created_at: new Date().toISOString(),
      });
      save();
      return { ok: true, quantity: item.quantity, version: item.version };
    },

    async updateItemMinLimit(token, itemId, minLimit) {
      requireSession(token, true);
      const min = UI.parseNonNegInt(minLimit, NaN);
      if (!Number.isFinite(min)) return { ok: false, error: "invalid_min" };
      const productionId = productionIdForItem(itemId);
      if (!productionId) return { ok: false, error: "item_not_found" };
      const item = db.items.find((i) => i.id === itemId);
      if (!item || !item.active) return { ok: false, error: "item_not_found" };
      item.min_limit = min;
      item.version = (item.version || 1) + 1;
      item.updated_at = new Date().toISOString();
      save();
      return { ok: true, min_limit: item.min_limit, version: item.version };
    },

    async getHistory(productionId, limit) {
      const rows = db.change_history
        .filter((h) => !productionId || h.production_id === productionId)
        .slice(0, limit || 80);
      return rows.map((h) => {
        const emp = db.employees.find((e) => e.id === h.employee_id);
        const prod = db.productions.find((p) => p.id === h.production_id);
        const item = db.items.find((i) => i.id === h.item_id);
        const group = item && db.item_groups.find((g) => g.id === item.group_id);
        const dept = group && db.departments.find((d) => d.id === group.department_id);
        return {
          ...h,
          employee_name: emp ? emp.name : "—",
          employee_color: emp ? emp.color : "#64748b",
          production_name: prod ? prod.name : "—",
          department_id: dept ? dept.id : "",
          department_name: dept ? dept.name : "—",
        };
      });
    },

    async getNotes(productionId) {
      return db.notes
        .filter((n) => n.production_id === productionId)
        .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    },

    async createNote(token, productionId, text, assigneeIds) {
      const s = requireSession(token, false);
      const ids = Array.isArray(assigneeIds) ? assigneeIds.filter(Boolean) : assigneeIds ? [assigneeIds] : [];
      const note = {
        id: UI.uid(),
        production_id: productionId,
        text: String(text || "").trim(),
        author_id: s.employee_id,
        assignee_id: ids[0] || null,
        assignee_ids: ids,
        completed: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      db.notes.unshift(note);
      save();
      return { ok: true, note };
    },

    async updateNote(token, noteId, patch) {
      requireSession(token, false);
      const note = db.notes.find((n) => n.id === noteId);
      if (!note) return { ok: false, error: "note_not_found" };
      if (patch.text != null) note.text = patch.text;
      if ("assignee_ids" in patch) {
        const ids = Array.isArray(patch.assignee_ids) ? patch.assignee_ids.filter(Boolean) : [];
        note.assignee_ids = ids;
        note.assignee_id = ids[0] || null;
      }
      if ("assignee_id" in patch) {
        note.assignee_id = patch.assignee_id || null;
        note.assignee_ids = note.assignee_id ? [note.assignee_id] : [];
      }
      if (patch.completed != null) note.completed = !!patch.completed;
      note.updated_at = new Date().toISOString();
      save();
      return { ok: true, note };
    },

    async deleteNote(token, noteId) {
      requireSession(token, false);
      db.notes = db.notes.filter((n) => n.id !== noteId);
      save();
      return { ok: true };
    },

    async getGoals(productionId, date) {
      const d = date || UI.todayISO();
      return db.daily_goals
        .filter((g) => g.production_id === productionId && g.goal_date === d)
        .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0) || String(a.created_at || "").localeCompare(String(b.created_at || "")));
    },

    async upsertGoal(token, productionId, date, target, label, id) {
      requireSession(token, false);
      const d = date || UI.todayISO();
      const nextLabel = label == null ? "" : String(label);
      if (id) {
        const goal = db.daily_goals.find((g) => g.id === id && g.production_id === productionId);
        if (!goal) return { ok: false, error: "goal_not_found" };
        goal.target = target;
        goal.label = nextLabel;
        save();
        return { ok: true, goal };
      }
      const order = db.daily_goals.filter((g) => g.production_id === productionId && g.goal_date === d).length;
      const goal = {
        id: UI.uid(),
        production_id: productionId,
        goal_date: d,
        target,
        label: nextLabel,
        sort_order: order,
        created_at: new Date().toISOString(),
      };
      db.daily_goals.push(goal);
      save();
      return { ok: true, goal };
    },

    async deleteGoal(token, id) {
      requireSession(token, false);
      const before = db.daily_goals.length;
      db.daily_goals = db.daily_goals.filter((g) => g.id !== id);
      if (db.daily_goals.length === before) return { ok: false, error: "goal_not_found" };
      save();
      return { ok: true };
    },

    async addPacked(token, productionId, quantity) {
      const s = requireSession(token, false);
      if (!s.employee_id) return { ok: false, error: "employee_required" };
      const prod = db.productions.find((p) => p.id === productionId && p.active);
      if (!prod) return { ok: false, error: "production_not_found" };
      const date = UI.todayISO();
      const factNow = db.packed_history
        .filter((p) => p.production_id === productionId && p.packed_date === date)
        .reduce((sum, p) => sum + p.quantity, 0);
      if (factNow + quantity < 0) return { ok: false, error: "below_zero", fact: factNow };
      db.packed_history.push({
        id: UI.uid(),
        production_id: productionId,
        employee_id: s.employee_id,
        packed_date: date,
        quantity,
        created_at: new Date().toISOString(),
      });
      save();
      return { ok: true, fact: factNow + quantity };
    },

    async getPackedFact(productionId, date) {
      return db.packed_history
        .filter((p) => p.production_id === productionId && p.packed_date === date)
        .reduce((sum, p) => sum + p.quantity, 0);
    },

    async getPackedHistory(productionId) {
      const map = new Map();
      db.packed_history
        .filter((p) => p.production_id === productionId)
        .forEach((p) => {
          map.set(p.packed_date, (map.get(p.packed_date) || 0) + p.quantity);
        });
      return Array.from(map.entries())
        .map(([date, fact]) => {
          const dayGoals = db.daily_goals.filter((g) => g.production_id === productionId && g.goal_date === date);
          return {
            date,
            fact,
            target: dayGoals.reduce((s, g) => s + (g.target || 0), 0),
            goals: dayGoals.map((g) => ({ id: g.id, target: g.target, label: g.label })),
          };
        })
        .sort((a, b) => (a.date < b.date ? 1 : -1));
    },

    async adminSave(token, entity, data) {
      requireSession(token, true);
      const tables = {
        production: "productions",
        department: "departments",
        group: "item_groups",
        item: "items",
        employee: "employees",
      };
      const table = tables[entity];
      if (!table) return { ok: false, error: "unknown_entity" };
      if (entity === "item" && data.is_sum) {
        const gid = data.group_id || (data.id && (db.items.find((i) => i.id === data.id) || {}).group_id);
        const dup = db.items.some((i) => i.group_id === gid && i.is_sum && i.id !== data.id);
        if (dup) return { ok: false, error: "sum_exists" };
      }
      if (data.id) {
        const row = db[table].find((r) => r.id === data.id);
        if (!row) return { ok: false, error: "not_found" };
        Object.assign(row, data);
        save();
        return { ok: true, row };
      }
      const defaults = {
        production: { name: "Новое производство", active: true, sort_order: db.productions.length },
        department: { name: "Новый отдел", icon: "📦", active: true, sort_order: 0 },
        group: { name: "Новая группа", active: true, sort_order: 0 },
        item: { name: "Новая позиция", quantity: 0, min_limit: 0, is_sum: false, active: true, sort_order: 0, version: 1 },
        employee: { name: "Новый сотрудник", color: "#64748b", active: true, sort_order: db.employees.length, created_at: new Date().toISOString() },
      };
      const row = { id: UI.uid(), ...defaults[entity], ...data };
      db[table].push(row);
      save();
      return { ok: true, row };
    },

    async adminDelete(token, entity, id) {
      requireSession(token, true);
      if (entity === "production") {
        const deptIds = db.departments.filter((d) => d.production_id === id).map((d) => d.id);
        const groupIds = db.item_groups.filter((g) => deptIds.includes(g.department_id)).map((g) => g.id);
        db.items = db.items.filter((i) => !groupIds.includes(i.group_id));
        db.item_groups = db.item_groups.filter((g) => !deptIds.includes(g.department_id));
        db.departments = db.departments.filter((d) => d.production_id !== id);
        db.productions = db.productions.filter((p) => p.id !== id);
        db.notes = db.notes.filter((n) => n.production_id !== id);
      } else if (entity === "department") {
        const groupIds = db.item_groups.filter((g) => g.department_id === id).map((g) => g.id);
        db.items = db.items.filter((i) => !groupIds.includes(i.group_id));
        db.item_groups = db.item_groups.filter((g) => g.department_id !== id);
        db.departments = db.departments.filter((d) => d.id !== id);
      } else if (entity === "group") {
        db.items = db.items.filter((i) => i.group_id !== id);
        db.item_groups = db.item_groups.filter((g) => g.id !== id);
      } else if (entity === "item") {
        db.items = db.items.filter((i) => i.id !== id);
      } else if (entity === "employee") {
        const emp = db.employees.find((e) => e.id === id);
        if (emp) emp.active = false;
      } else {
        return { ok: false, error: "unknown_entity" };
      }
      save();
      return { ok: true };
    },

    async adminReorder(token, entity, ids) {
      requireSession(token, true);
      const tables = {
        production: "productions",
        department: "departments",
        group: "item_groups",
        item: "items",
        employee: "employees",
      };
      const table = tables[entity];
      ids.forEach((id, index) => {
        const row = db[table].find((r) => r.id === id);
        if (row) row.sort_order = index;
      });
      save();
      return { ok: true };
    },

    subscribe(handler) {
      listeners.add(handler);
      const onStorage = (e) => {
        if (e.key === STORE) {
          db = load();
          handler({ type: "storage" });
        }
      };
      window.addEventListener("storage", onStorage);
      return () => {
        listeners.delete(handler);
        window.removeEventListener("storage", onStorage);
      };
    },

    cacheSnapshot() {
      return db;
    },

    restoreCache(snapshot) {
      if (snapshot && snapshot.items) {
        db = snapshot;
      }
    },
  };

  global.LocalDB = LocalDB;
})(window);
