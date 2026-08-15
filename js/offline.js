/**
 * Базовый offline: кэш последнего состояния, очередь изменений количества,
 * индикатор сети. Не CRDT — после восстановления очередь прогоняется CAS-ами.
 */
(function (global) {
  const CACHE_KEY = "factory.cache.v1";
  const QUEUE_KEY = "factory.queue.v1";

  function readJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  const Offline = {
    online: navigator.onLine,
    queue: readJson(QUEUE_KEY, []),

    saveCache() {
      try {
        localStorage.setItem(
          CACHE_KEY,
          JSON.stringify({
            at: Date.now(),
            employees: State.cache.employees,
            productions: State.cache.productions,
            tree: State.cache.tree,
            history: State.cache.history,
            notes: State.cache.notes,
            goal: State.cache.goal,
            packedFact: State.cache.packedFact,
            productionId: State.data.productionId,
          })
        );
      } catch {
        /* ignore */
      }
    },

    loadCache() {
      return readJson(CACHE_KEY, null);
    },

    enqueueQty(job) {
      this.queue.push(job);
      localStorage.setItem(QUEUE_KEY, JSON.stringify(this.queue));
    },

    persistQueue() {
      localStorage.setItem(QUEUE_KEY, JSON.stringify(this.queue));
    },

    async flush() {
      if (!this.queue.length || !State.token()) return;
      const pending = [...this.queue];
      this.queue = [];
      this.persistQueue();
      for (const job of pending) {
        try {
          const res = await DB.updateItemQuantity(State.token(), job.itemId, job.oldQty, job.newQty);
          if (!res.ok && res.error === "conflict") {
            UI.toast("Конфликт: количество уже изменено. Откройте позицию ещё раз.", true);
          }
        } catch {
          this.queue.push(job);
        }
      }
      this.persistQueue();
    },

    renderStatus() {
      const offlineBanner = UI.$("#offlineBanner");
      const localBanner = UI.$("#localBanner");
      const led = UI.$("#connLed");
      if (offlineBanner) offlineBanner.classList.toggle("is-visible", !this.online);
      if (localBanner) localBanner.classList.toggle("is-visible", DB.mode === "local");
      if (led) {
        led.classList.toggle("is-off", !this.online);
        led.classList.toggle("is-local", this.online && DB.mode === "local");
      }
    },

    init() {
      this.online = navigator.onLine;
      this.renderStatus();
      window.addEventListener("online", async () => {
        this.online = true;
        this.renderStatus();
        await this.flush();
        if (global.App && App.refreshWorkspace) App.refreshWorkspace();
      });
      window.addEventListener("offline", () => {
        this.online = false;
        this.renderStatus();
      });
    },
  };

  global.Offline = Offline;
})(window);
