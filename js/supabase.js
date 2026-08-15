/**
 * Клиент Supabase. Только anon/publishable key.
 */
(function (global) {
  function isConfigured() {
    const cfg = global.APP_CONFIG || {};
    return !!(cfg.supabaseUrl && cfg.supabaseAnonKey);
  }

  function createClient() {
    if (!isConfigured()) return null;
    if (typeof global.supabase === "undefined" || !global.supabase.createClient) {
      console.warn("supabase-js не загружен");
      return null;
    }
    const cfg = global.APP_CONFIG;
    return global.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  global.SB = {
    isConfigured,
    client: null,
    init() {
      this.client = createClient();
      return this.client;
    },
  };
})(window);
