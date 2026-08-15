/**
 * Адаптер Supabase: все данные через RPC с токеном сессии.
 * Прямой .from().select() больше не используется.
 */
(function (global) {
  function client() {
    return SB.client;
  }

  function token() {
    return global.State && State.token();
  }

  function unwrapOk(res, field) {
    if (!res || res.ok === false) {
      const err = new Error((res && res.error) || "rpc_denied");
      err.body = res;
      throw err;
    }
    if (field) return res[field];
    return res;
  }

  async function rpc(name, args) {
    const c = client();
    if (!c) {
      throw new Error("supabase_not_configured");
    }
    const res = await c.rpc(name, args);
    if (res.error) {
      const err = new Error(res.error.message || "rpc_error");
      err.details = res.error;
      if (isDbNotReady(res.error)) err.kind = "db_not_ready";
      throw err;
    }
    return res.data;
  }

  function isDbNotReady(errorOrMsg) {
    const code = (errorOrMsg && errorOrMsg.code) || "";
    const message = String(
      (errorOrMsg && (errorOrMsg.message || errorOrMsg.details || errorOrMsg.hint)) || errorOrMsg || ""
    );
    return (
      code === "PGRST202" ||
      code === "42883" ||
      /schema cache|Could not find the function|crypt\(text, text\) does not exist/i.test(message)
    );
  }

  const RemoteDB = {
    mode: "supabase",

    async login(password, clientKey) {
      try {
        return await rpc("app_login", { p_password: password, p_client_key: clientKey || "" });
      } catch (e) {
        if (e && e.kind === "db_not_ready" && /app_login\(p_client_key/i.test((e.details && e.details.message) || e.message || "")) {
          return rpc("app_login", { p_password: password });
        }
        throw e;
      }
    },

    async logout(tok) {
      return rpc("app_logout", { p_token: tok });
    },

    async session(tok) {
      return rpc("app_session", { p_token: tok });
    },

    async setEmployee(tok, employeeId) {
      return rpc("app_set_employee", { p_token: tok, p_employee_id: employeeId });
    },

    async getEmployees() {
      const res = await rpc("app_get_employees", { p_token: token(), p_include_inactive: false });
      return unwrapOk(res, "rows") || [];
    },

    async getAllEmployees() {
      const res = await rpc("app_get_employees", { p_token: token(), p_include_inactive: true });
      return unwrapOk(res, "rows") || [];
    },

    async getProductions() {
      const res = await rpc("app_get_productions", { p_token: token(), p_include_inactive: false });
      return unwrapOk(res, "rows") || [];
    },

    async getAllProductions() {
      const res = await rpc("app_get_productions", { p_token: token(), p_include_inactive: true });
      return unwrapOk(res, "rows") || [];
    },

    async getTree(productionId) {
      const res = await rpc("app_get_tree", {
        p_token: token(),
        p_production_id: productionId,
        p_include_inactive: false,
      });
      return unwrapOk(res, "tree") || [];
    },

    async getAdminTree(productionId) {
      const res = await rpc("app_get_tree", {
        p_token: token(),
        p_production_id: productionId,
        p_include_inactive: true,
      });
      return unwrapOk(res, "tree") || [];
    },

    async updateItemQuantity(tok, itemId, oldQty, newQty) {
      return rpc("update_item_quantity", {
        p_token: tok,
        p_item_id: itemId,
        p_old_qty: oldQty,
        p_new_qty: newQty,
      });
    },

    async getHistory(productionId, limit) {
      const res = await rpc("app_get_history", {
        p_token: token(),
        p_production_id: productionId,
        p_limit: limit || 80,
      });
      return unwrapOk(res, "rows") || [];
    },

    async getNotes(productionId) {
      const res = await rpc("app_get_notes", {
        p_token: token(),
        p_production_id: productionId,
      });
      return unwrapOk(res, "rows") || [];
    },

    async createNote(tok, productionId, text, assigneeId) {
      return rpc("create_note", {
        p_token: tok,
        p_production_id: productionId,
        p_text: text,
        p_assignee_id: assigneeId || null,
      });
    },

    async updateNote(tok, noteId, patch) {
      return rpc("update_note", {
        p_token: tok,
        p_note_id: noteId,
        p_patch: patch,
      });
    },

    async deleteNote(tok, noteId) {
      return rpc("delete_note", { p_token: tok, p_note_id: noteId });
    },

    async getGoal(productionId, date) {
      const res = await rpc("app_get_goal", {
        p_token: token(),
        p_production_id: productionId,
        p_date: date,
      });
      unwrapOk(res);
      return res.goal || null;
    },

    async upsertGoal(tok, productionId, date, target, label) {
      return rpc("upsert_daily_goal", {
        p_token: tok,
        p_production_id: productionId,
        p_goal_date: date,
        p_target: target,
        p_label: label || "упакованных рамок",
      });
    },

    async addPacked(tok, productionId, quantity) {
      return rpc("add_packed", {
        p_token: tok,
        p_production_id: productionId,
        p_quantity: quantity,
      });
    },

    async getPackedFact(productionId, date) {
      const res = await rpc("app_get_packed_fact", {
        p_token: token(),
        p_production_id: productionId,
        p_date: date,
      });
      unwrapOk(res);
      return res.fact || 0;
    },

    async getPackedHistory(productionId) {
      const res = await rpc("app_get_packed_history", {
        p_token: token(),
        p_production_id: productionId,
      });
      return unwrapOk(res, "rows") || [];
    },

    async adminSave(tok, entity, data) {
      return rpc("admin_save", { p_token: tok, p_entity: entity, p_data: data });
    },

    async adminDelete(tok, entity, id) {
      return rpc("admin_delete", { p_token: tok, p_entity: entity, p_id: id });
    },

    async adminReorder(tok, entity, ids) {
      return rpc("admin_reorder", { p_token: tok, p_entity: entity, p_ids: ids });
    },

    subscribe(handler) {
      const c = client();
      if (!c) return () => {};
      const channel = c
        .channel("factory-live")
        .on("broadcast", { event: "change" }, (msg) => {
          const p = (msg && msg.payload) || {};
          handler({
            table: p.table,
            payload: { new: p.record || {}, eventType: p.op },
          });
        })
        .subscribe();
      return () => {
        c.removeChannel(channel);
      };
    },
  };

  global.RemoteDB = RemoteDB;
})(window);
