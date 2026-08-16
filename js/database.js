/**
 * Фасад базы: Supabase если настроен, иначе локальный адаптер.
 * Остальной код вызывает только DB.*, чтобы позже подключить Auth без переписывания UI.
 */
(function (global) {
  let impl = null;

  function pick() {
    if (SB.isConfigured() && SB.client) return RemoteDB;
    return LocalDB;
  }

  const DB = {
    get mode() {
      return impl ? impl.mode : "none";
    },
    init() {
      SB.init();
      impl = pick();
      return impl.mode;
    },
    adapter() {
      if (!impl) this.init();
      return impl;
    },
    login(password, clientKey) {
      return this.adapter().login(password, clientKey);
    },
    logout(token) {
      return this.adapter().logout(token);
    },
    session(token) {
      return this.adapter().session(token);
    },
    setEmployee(token, id) {
      return this.adapter().setEmployee(token, id);
    },
    getEmployees() {
      return this.adapter().getEmployees();
    },
    getAllEmployees() {
      return this.adapter().getAllEmployees();
    },
    getProductions() {
      return this.adapter().getProductions();
    },
    getAllProductions() {
      return this.adapter().getAllProductions();
    },
    getTree(id) {
      return this.adapter().getTree(id);
    },
    getAdminTree(id) {
      return this.adapter().getAdminTree(id);
    },
    updateItemQuantity(token, itemId, oldQty, newQty) {
      return this.adapter().updateItemQuantity(token, itemId, oldQty, newQty);
    },
    updateItemMinLimit(token, itemId, minLimit) {
      return this.adapter().updateItemMinLimit(token, itemId, minLimit);
    },
    getHistory(id, limit) {
      return this.adapter().getHistory(id, limit);
    },
    getNotes(id) {
      return this.adapter().getNotes(id);
    },
    createNote(token, productionId, text, assigneeIds) {
      return this.adapter().createNote(token, productionId, text, assigneeIds);
    },
    updateNote(token, noteId, patch) {
      return this.adapter().updateNote(token, noteId, patch);
    },
    deleteNote(token, noteId) {
      return this.adapter().deleteNote(token, noteId);
    },
    getGoals(id, date) {
      return this.adapter().getGoals(id, date);
    },
    upsertGoal(token, productionId, date, target, label, id) {
      return this.adapter().upsertGoal(token, productionId, date, target, label, id);
    },
    deleteGoal(token, id) {
      return this.adapter().deleteGoal(token, id);
    },
    addPacked(token, productionId, quantity) {
      return this.adapter().addPacked(token, productionId, quantity);
    },
    getPackedFact(id, date) {
      return this.adapter().getPackedFact(id, date);
    },
    getPackedHistory(id) {
      return this.adapter().getPackedHistory(id);
    },
    adminSave(token, entity, data) {
      return this.adapter().adminSave(token, entity, data);
    },
    adminDelete(token, entity, id) {
      return this.adapter().adminDelete(token, entity, id);
    },
    adminReorder(token, entity, ids) {
      return this.adapter().adminReorder(token, entity, ids);
    },
    subscribe(handler) {
      return this.adapter().subscribe(handler);
    },
  };

  global.DB = DB;
})(window);
