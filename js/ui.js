/**
 * Общие UI-хелперы: экраны, тема, тосты, форматирование.
 */
(function (global) {
  function $(sel, root) {
    return (root || document).querySelector(sel);
  }

  function $all(sel, root) {
    return Array.from((root || document).querySelectorAll(sel));
  }

  function showScreen(name) {
    $all(".screen").forEach((el) => {
      el.classList.toggle("is-active", el.dataset.screen === name);
    });
  }

  function toast(message, isError) {
    const host = $("#toasts");
    if (!host) return;
    const el = document.createElement("div");
    el.className = "toast" + (isError ? " is-error" : "");
    el.textContent = message;
    host.appendChild(el);
    setTimeout(() => el.remove(), 3200);
  }

  function applyTheme() {
    const theme = State.data.theme || "dark";
    document.documentElement.setAttribute("data-theme", theme);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", theme === "light" ? "#ece7dc" : "#101418");
  }

  function toggleTheme() {
    State.setTheme(State.data.theme === "dark" ? "light" : "dark");
    applyTheme();
  }

  function bindThemeToggles() {
    document.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-theme-toggle]");
      if (btn) toggleTheme();
    });
  }

  function formatDateTime(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function todayISO() {
    const d = new Date();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${d.getFullYear()}-${m}-${day}`;
  }

  function escapeHtml(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function uid() {
    if (crypto.randomUUID) return crypto.randomUUID();
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  const UI = {
    $,
    $all,
    showScreen,
    toast,
    applyTheme,
    toggleTheme,
    bindThemeToggles,
    formatDateTime,
    todayISO,
    escapeHtml,
    uid,
  };

  global.UI = UI;
})(window);
