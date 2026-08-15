/**
 * Адаптер Supabase: чтение через PostgREST, запись только через RPC.
 */
(function (global) {
  function client() {
    return SB.client;
  }

  function unwrap(rpc) {
    if (rpc.error) throw rpc.error;
    return rpc.data;
  }

  async function rpc(name, args) {
    const res = await client().rpc(name, args);
    if (res.error) {
      const err = new Error(res.error.message || "rpc_error");
      err.details = res.error;
      throw err;
    }
    return res.data;
  }

  const RemoteDB = {
    mode: "supabase",

    async login(password) {
      return rpc("app_login", { p_password: password });
    },

    async logout(token) {
      return rpc("app_logout", { p_token: token });
    },

    async session(token) {
      return rpc("app_session", { p_token: token });
    },

    async setEmployee(token, employeeId) {
      return rpc("app_set_employee", { p_token: token, p_employee_id: employeeId });
    },

    async getEmployees() {
      const { data, error } = await client()
        .from("employees")
        .select("*")
        .eq("active", true)
        .order("sort_order");
      if (error) throw error;
      return data || [];
    },

    async getAllEmployees() {
      const { data, error } = await client()
        .from("employees")
        .select("*")
        .order("sort_order");
      if (error) throw error;
      return data || [];
    },

    async getProductions() {
      const { data, error } = await client()
        .from("productions")
        .select("*")
        .eq("active", true)
        .order("sort_order");
      if (error) throw error;
      return data || [];
    },

    async getAllProductions() {
      const { data, error } = await client()
        .from("productions")
        .select("*")
        .order("sort_order");
      if (error) throw error;
      return data || [];
    },

    async getTree(productionId) {
      const { data: departments, error: e1 } = await client()
        .from("departments")
        .select("*")
        .eq("production_id", productionId)
        .eq("active", true)
        .order("sort_order");
      if (e1) throw e1;
      if (!departments || !departments.length) return [];

      const deptIds = departments.map((d) => d.id);
      const { data: groups, error: e2 } = await client()
        .from("item_groups")
        .select("*")
        .in("department_id", deptIds)
        .eq("active", true)
        .order("sort_order");
      if (e2) throw e2;

      const groupIds = groups.map((g) => g.id);
      const { data: items, error: e3 } = await client()
        .from("items")
        .select("*")
        .in("group_id", groupIds.length ? groupIds : ["00000000-0000-0000-0000-000000000000"])
        .eq("active", true)
        .order("sort_order");
      if (e3) throw e3;

      return departments.map((dept) => ({
        ...dept,
        groups: groups
          .filter((g) => g.department_id === dept.id)
          .map((g) => ({
            ...g,
            items: (items || []).filter((i) => i.group_id === g.id),
          })),
      }));
    },

    async getAdminTree(productionId) {
      const { data: departments, error: e1 } = await client()
        .from("departments")
        .select("*")
        .eq("production_id", productionId)
        .order("sort_order");
      if (e1) throw e1;
      const deptIds = departments.map((d) => d.id);
      const { data: groups, error: e2 } = await client()
        .from("item_groups")
        .select("*")
        .in("department_id", deptIds.length ? deptIds : ["00000000-0000-0000-0000-000000000000"])
        .order("sort_order");
      if (e2) throw e2;
      const groupIds = (groups || []).map((g) => g.id);
      const { data: items, error: e3 } = await client()
        .from("items")
        .select("*")
        .in("group_id", groupIds.length ? groupIds : ["00000000-0000-0000-0000-000000000000"])
        .order("sort_order");
      if (e3) throw e3;
      return departments.map((dept) => ({
        ...dept,
        groups: (groups || [])
          .filter((g) => g.department_id === dept.id)
          .map((g) => ({
            ...g,
            items: (items || []).filter((i) => i.group_id === g.id),
          })),
      }));
    },

    async updateItemQuantity(token, itemId, oldQty, newQty) {
      return rpc("update_item_quantity", {
        p_token: token,
        p_item_id: itemId,
        p_old_qty: oldQty,
        p_new_qty: newQty,
      });
    },

    async getHistory(productionId, limit) {
      const { data, error } = await client()
        .from("change_history")
        .select("*")
        .eq("production_id", productionId)
        .order("created_at", { ascending: false })
        .limit(limit || 80);
      if (error) throw error;
      return data || [];
    },

    async getNotes(productionId) {
      const { data, error } = await client()
        .from("notes")
        .select("*")
        .eq("production_id", productionId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },

    async createNote(token, productionId, text, assigneeId) {
      return rpc("create_note", {
        p_token: token,
        p_production_id: productionId,
        p_text: text,
        p_assignee_id: assigneeId || null,
      });
    },

    async updateNote(token, noteId, patch) {
      return rpc("update_note", {
        p_token: token,
        p_note_id: noteId,
        p_patch: patch,
      });
    },

    async deleteNote(token, noteId) {
      return rpc("delete_note", { p_token: token, p_note_id: noteId });
    },

    async getGoal(productionId, date) {
      const { data, error } = await client()
        .from("daily_goals")
        .select("*")
        .eq("production_id", productionId)
        .eq("goal_date", date)
        .maybeSingle();
      if (error) throw error;
      return data;
    },

    async upsertGoal(token, productionId, date, target, label) {
      return rpc("upsert_daily_goal", {
        p_token: token,
        p_production_id: productionId,
        p_goal_date: date,
        p_target: target,
        p_label: label || "упакованных рамок",
      });
    },

    async addPacked(token, productionId, quantity) {
      return rpc("add_packed", {
        p_token: token,
        p_production_id: productionId,
        p_quantity: quantity,
      });
    },

    async getPackedFact(productionId, date) {
      const { data, error } = await client()
        .from("packed_history")
        .select("quantity")
        .eq("production_id", productionId)
        .eq("packed_date", date);
      if (error) throw error;
      return (data || []).reduce((s, r) => s + r.quantity, 0);
    },

    async getPackedHistory(productionId) {
      const { data: packed, error: e1 } = await client()
        .from("packed_history")
        .select("packed_date, quantity")
        .eq("production_id", productionId);
      if (e1) throw e1;
      const { data: goals, error: e2 } = await client()
        .from("daily_goals")
        .select("goal_date, target")
        .eq("production_id", productionId);
      if (e2) throw e2;
      const map = new Map();
      (packed || []).forEach((p) => {
        map.set(p.packed_date, (map.get(p.packed_date) || 0) + p.quantity);
      });
      const dates = new Set([...map.keys(), ...(goals || []).map((g) => g.goal_date)]);
      return Array.from(dates)
        .map((date) => {
          const goal = (goals || []).find((g) => g.goal_date === date);
          return { date, fact: map.get(date) || 0, target: goal ? goal.target : 0 };
        })
        .sort((a, b) => (a.date < b.date ? 1 : -1));
    },

    async adminSave(token, entity, data) {
      return rpc("admin_save", { p_token: token, p_entity: entity, p_data: data });
    },

    async adminDelete(token, entity, id) {
      return rpc("admin_delete", { p_token: token, p_entity: entity, p_id: id });
    },

    async adminReorder(token, entity, ids) {
      return rpc("admin_reorder", { p_token: token, p_entity: entity, p_ids: ids });
    },

    subscribe(handler) {
      const c = client();
      if (!c) return () => {};
      const channel = c
        .channel("factory-live")
        .on("postgres_changes", { event: "*", schema: "public", table: "items" }, (payload) => handler({ table: "items", payload }))
        .on("postgres_changes", { event: "*", schema: "public", table: "change_history" }, (payload) => handler({ table: "change_history", payload }))
        .on("postgres_changes", { event: "*", schema: "public", table: "notes" }, (payload) => handler({ table: "notes", payload }))
        .on("postgres_changes", { event: "*", schema: "public", table: "daily_goals" }, (payload) => handler({ table: "daily_goals", payload }))
        .on("postgres_changes", { event: "*", schema: "public", table: "packed_history" }, (payload) => handler({ table: "packed_history", payload }))
        .on("postgres_changes", { event: "*", schema: "public", table: "productions" }, (payload) => handler({ table: "productions", payload }))
        .on("postgres_changes", { event: "*", schema: "public", table: "departments" }, (payload) => handler({ table: "departments", payload }))
        .on("postgres_changes", { event: "*", schema: "public", table: "item_groups" }, (payload) => handler({ table: "item_groups", payload }))
        .on("postgres_changes", { event: "*", schema: "public", table: "employees" }, (payload) => handler({ table: "employees", payload }))
        .subscribe();
      return () => {
        c.removeChannel(channel);
      };
    },

    unwrap,
  };

  global.RemoteDB = RemoteDB;
})(window);
