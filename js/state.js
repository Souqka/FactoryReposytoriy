/**
 * Глобальное состояние клиента.
 * Сессия и кэш переживают перезагрузку через localStorage.
 */
(function (global) {
  const KEY = "factory.app.v1";

  const defaults = {
    theme: "dark",
    session: null, // { token, role, expiresAt }
    employeeId: null,
    productionId: null,
    panel: "items",
  };

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return { ...defaults };
      return { ...defaults, ...JSON.parse(raw) };
    } catch {
      return { ...defaults };
    }
  }

  const data = load();

  function persist() {
    try {
      localStorage.setItem(
        KEY,
        JSON.stringify({
          theme: data.theme,
          session: data.session,
          employeeId: data.employeeId,
          productionId: data.productionId,
          panel: data.panel,
        })
      );
    } catch {
      /* quota / private mode */
    }
  }

  const State = {
    data,
    persist,
    cache: {
      employees: [],
      productions: [],
      tree: null,
      history: [],
      notes: [],
      goal: null,
      packedFact: 0,
    },
    setTheme(theme) {
      data.theme = theme === "light" ? "light" : "dark";
      persist();
    },
    setSession(session) {
      data.session = session;
      persist();
    },
    setEmployee(id) {
      data.employeeId = id;
      persist();
    },
    setProduction(id) {
      data.productionId = id;
      persist();
    },
    setPanel(name) {
      data.panel = name;
      persist();
    },
    clearWork() {
      data.employeeId = null;
      data.productionId = null;
      persist();
    },
    logout() {
      data.session = null;
      data.employeeId = null;
      data.productionId = null;
      persist();
    },
    token() {
      return data.session && data.session.token;
    },
    isAdmin() {
      return !!(data.session && data.session.role === "admin");
    },
  };

  global.State = State;
})(window);
