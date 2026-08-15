/**
 * Дневной план упаковки: план / факт / осталось.
 */
(function (global) {
  const Goals = {
    async load(productionId) {
      const date = UI.todayISO();
      const [goal, fact] = await Promise.all([
        DB.getGoal(productionId, date),
        DB.getPackedFact(productionId, date),
      ]);
      State.cache.goal = goal;
      State.cache.packedFact = fact || 0;
      Offline.saveCache();
    },

    async render(root) {
      const goal = State.cache.goal;
      const target = goal ? goal.target : 0;
      const fact = State.cache.packedFact || 0;
      const left = Math.max(target - fact, 0);
      const label = goal ? goal.label : "упакованных рамок";
      let history = [];
      try {
        history = await DB.getPackedHistory(State.data.productionId);
      } catch {
        history = [];
      }

      root.innerHTML = `
        <h2 style="margin:8px 4px 4px;font-size:16px">Дневной план</h2>
        <p class="lede">${UI.escapeHtml(label)} · ${UI.todayISO()}</p>
        <div class="goal-grid">
          <div class="stat"><b>${target}</b><span>План</span></div>
          <div class="stat"><b>${fact}</b><span>Факт</span></div>
          <div class="stat"><b>${left}</b><span>Осталось</span></div>
        </div>
        <div class="qty-row" style="margin-bottom:18px">
          <button type="button" class="qty-btn" id="packMinus" aria-label="Минус">−</button>
          <div class="qty-value" id="packValue">${fact}</div>
          <button type="button" class="qty-btn" id="packPlus" aria-label="Плюс">+</button>
        </div>
        <form id="goalForm">
          <label class="field">
            <span>Цель на сегодня</span>
            <input type="number" id="goalTarget" min="0" step="1" value="${target}" />
          </label>
          <label class="field">
            <span>Подпись</span>
            <input type="text" id="goalLabel" value="${UI.escapeHtml(label)}" />
          </label>
          <button class="btn btn-primary btn-block" type="submit">Сохранить план</button>
        </form>
        <h3 style="margin:22px 4px 8px;font-size:14px;color:var(--muted)">По датам</h3>
        ${
          history.length
            ? history
                .map(
                  (h) => `
              <div class="history-item">
                <span></span>
                <div>
                  <div class="who">${h.date}</div>
                  <div class="delta">план ${h.target} · факт ${h.fact}</div>
                </div>
              </div>`
                )
                .join("")
            : '<p class="empty">Истории пока нет.</p>'
        }
      `;

      const bump = async (delta) => {
        try {
          const res = await DB.addPacked(State.token(), State.data.productionId, delta);
          if (res && res.ok) {
            State.cache.packedFact = res.fact;
            await this.render(root);
          } else if (res && res.error === "below_zero") {
            UI.toast("Факт не может быть меньше нуля", true);
          }
        } catch {
          UI.toast("Не удалось обновить факт", true);
        }
      };

      UI.$("#packMinus", root).addEventListener("click", () => bump(-1));
      UI.$("#packPlus", root).addEventListener("click", () => bump(1));

      UI.$("#goalForm", root).addEventListener("submit", async (e) => {
        e.preventDefault();
        const targetVal = Math.max(0, parseInt(UI.$("#goalTarget", root).value, 10) || 0);
        const labelVal = UI.$("#goalLabel", root).value.trim() || "упакованных рамок";
        try {
          const res = await DB.upsertGoal(
            State.token(),
            State.data.productionId,
            UI.todayISO(),
            targetVal,
            labelVal
          );
          State.cache.goal = res.goal || { target: targetVal, label: labelVal };
          await this.render(root);
          UI.toast("План сохранён");
        } catch {
          UI.toast("Не удалось сохранить план", true);
        }
      });
    },
  };

  global.Goals = Goals;
})(window);
