/**
 * Авторизация приложения.
 *
 * Сейчас: RPC app_login (хеш пароля в settings) или локальный SHA-256 для демо.
 * Позже: заменить тело login() на supabase.auth.signInWithPassword,
 * не трогая экраны и DB-фасад.
 *
 * Клиентская проверка пароля НЕ является защитой.
 */
(function (global) {
  const DEVICE_KEY = "factory.device.v1";

  function deviceKey() {
    try {
      let key = localStorage.getItem(DEVICE_KEY);
      if (!key) {
        key = (crypto.randomUUID && crypto.randomUUID()) || String(Date.now()) + Math.random();
        localStorage.setItem(DEVICE_KEY, key);
      }
      return key;
    } catch {
      return "anonymous";
    }
  }

  const Auth = {
    async login(password) {
      const res = await DB.login(password, deviceKey());
      if (!res || !res.ok) return { ok: false, error: (res && res.error) || "invalid_password" };
      State.setSession({
        token: res.token,
        role: res.role,
        expiresAt: res.expires_at,
      });
      return { ok: true, role: res.role };
    },

    async restore() {
      const session = State.data.session;
      if (!session || !session.token) return false;
      try {
        const res = await DB.session(session.token);
        if (!res || !res.ok) {
          State.logout();
          return false;
        }
        State.setSession({
          token: session.token,
          role: res.role,
          expiresAt: res.expires_at,
        });
        if (res.employee_id) State.setEmployee(res.employee_id);
        return true;
      } catch {
        return !!session.token;
      }
    },

    async logout() {
      try {
        if (State.token()) await DB.logout(State.token());
      } catch {
        /* ignore */
      }
      State.logout();
    },

    async pickEmployee(id) {
      State.setEmployee(id);
      if (State.token()) {
        await DB.setEmployee(State.token(), id);
      }
    },
  };

  global.Auth = Auth;
})(window);
