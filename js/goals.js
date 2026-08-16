/**
 * Дневной план: несколько целей, каждая со своей отслеживаемой позицией.
 */
(function (global) {
  const TRACK_PREFIX = "item:";
  const saveTimers = new Map();
  let saving = false;

  function flattenItems() {
    const tree = State.cache.tree || [];
    const out = [];
    for (const dept of tree) {
      for (const group of dept.groups || []) {
        for (const item of group.items || []) {
          const qty =
            typeof Production !== "undefined" && Production.displayQty
              ? Production.displayQty(item, group)
              : item.quantity;
          out.push({
            id: item.id,
            name: item.name,
            quantity: qty,
            is_sum: !!item.is_sum,
            deptName: dept.name,
            groupName: group.name,
          });
        }
      }
    }
    return out;
  }

  function trackedItemIdFromGoal(goal) {
    if (!goal) return "";
    if (goal.tracked_item_id) return String(goal.tracked_item_id);
    const label = String(goal.label || "");
    if (label.startsWith(TRACK_PREFIX)) return label.slice(TRACK_PREFIX.length);
    return "";
  }

  function encodeTrackedLabel(itemId) {
    return itemId ? TRACK_PREFIX + itemId : "";
  }

  function optionLabel(item) {
    const sum = item.is_sum ? "Σ " : "";
    return `${item.deptName} / ${item.groupName} / ${sum}${item.name}`;
  }

  function findTracked(itemId) {
    if (!itemId) return null;
    return flattenItems().find((i) => i.id === itemId) || null;
  }

  function goalsList() {
    return Array.isArray(State.cache.goals) ? State.cache.goals : [];
  }

  function statsFor(goal, overrideTarget) {
    const target = overrideTarget != null ? overrideTarget : goal ? UI.parseNonNegInt(goal.target, 0) : 0;
    const itemId = trackedItemIdFromGoal(goal);
    const item = findTracked(itemId);
    const fact = item ? item.quantity : 0;
    return {
      target,
      fact,
      left: Math.max(target - fact, 0),
      itemId,
      item,
    };
  }

  function optionsHtml(selectedId) {
    const items = flattenItems();
    const opts = ['<option value="">Не выбрано</option>']
      .concat(
        items.map((item) => {
          const sel = item.id === selectedId ? " selected" : "";
          return `<option value="${item.id}"${sel}>${UI.escapeHtml(optionLabel(item))}</option>`;
        })
      )
      .join("");
    return { html: opts, exists: !selectedId || items.some((i) => i.id === selectedId) };
  }

  function formBusy(root) {
    if (!root) return false;
    const active = document.activeElement;
    if (!active || !root.contains(active)) return false;
    return active.matches("[data-goal-target], [data-goal-item]");
  }

  function paintCard(card) {
    if (!card) return;
    const id = card.getAttribute("data-goal");
    const goal = goalsList().find((g) => g.id === id);
    const input = card.querySelector("[data-goal-target]");
    const typed = input && document.activeElement === input ? UI.parseNonNegInt(input.value, 0) : null;
    const s = statsFor(goal, typed);
    const t = card.querySelector("[data-stat=target]");
    const f = card.querySelector("[data-stat=fact]");
    const l = card.querySelector("[data-stat=left]");
    if (t) t.textContent = String(s.target);
    if (f) f.textContent = String(s.fact);
    if (l) l.textContent = String(s.left);
    const nameEl = card.querySelector(".plan-track-name");
    if (nameEl) nameEl.textContent = s.item ? s.item.name : "позиция не выбрана";
  }

  function paintAll(root) {
    if (!root) return;
    root.querySelectorAll("[data-goal]").forEach(paintCard);
  }

  async function persistCard(card, opts) {
    if (!card || !State.data.productionId) return;
    const id = card.getAttribute("data-goal");
    const input = card.querySelector("[data-goal-target]");
    const select = card.querySelector("[data-goal-item]");
    const targetVal = UI.parseNonNegInt(input ? input.value : 0, 0);
    const itemId = select ? select.value : "";
    const labelVal = encodeTrackedLabel(itemId);
    saving = true;
    try {
      const res = await DB.upsertGoal(State.token(), State.data.productionId, null, targetVal, labelVal, id);
      const saved = res.goal || { id, target: targetVal, label: labelVal };
      State.cache.goals = goalsList().map((g) => (g.id === id ? Object.assign({}, g, saved) : g));
      Offline.saveCache();
      paintCard(card);
      if (opts && opts.toast) UI.toast("Цель сохранена");
    } catch {
      UI.toast("Не удалось сохранить цель", true);
    } finally {
      saving = false;
    }
  }

  function schedulePersist(card) {
    const id = card.getAttribute("data-goal");
    clearTimeout(saveTimers.get(id));
    saveTimers.set(
      id,
      setTimeout(() => persistCard(card), 400)
    );
  }

  function bindCard(card) {
    const input = card.querySelector("[data-goal-target]");
    const select = card.querySelector("[data-goal-item]");
    if (input) {
      input.addEventListener("input", () => {
        paintCard(card);
        schedulePersist(card);
      });
      input.addEventListener("change", () => persistCard(card));
      input.addEventListener("blur", () => persistCard(card));
    }
    if (select) {
      select.addEventListener("change", () => persistCard(card, { toast: true }));
    }
    const del = card.querySelector("[data-goal-del]");
    if (del) {
      del.addEventListener("click", async () => {
        const id = card.getAttribute("data-goal");
        try {
          await DB.deleteGoal(State.token(), id);
          State.cache.goals = goalsList().filter((g) => g.id !== id);
          Offline.saveCache();
          const root = card.closest(".panel") || card.parentElement;
          await Goals.render(root);
        } catch {
          UI.toast("Не удалось удалить цель", true);
        }
      });
    }
  }

  function cardHtml(goal) {
    const s = statsFor(goal);
    const built = optionsHtml(s.itemId);
    return `
      <article class="goal-card" data-goal="${goal.id}">
        <div class="goal-card-head">
          <p class="lede"><span class="plan-track-name">${UI.escapeHtml(s.item ? s.item.name : "позиция не выбрана")}</span></p>
          <button type="button" class="btn btn-ghost" data-goal-del>Удалить</button>
        </div>
        <div class="goal-grid">
          <div class="stat"><b data-stat="target">${s.target}</b><span>План</span></div>
          <div class="stat"><b data-stat="fact">${s.fact}</b><span>Факт</span></div>
          <div class="stat"><b data-stat="left">${s.left}</b><span>Осталось</span></div>
        </div>
        <label class="field">
          <span>Цель</span>
          <input type="number" data-goal-target min="0" step="1" inputmode="numeric" value="${s.target}" />
        </label>
        <label class="field">
          <span>Отслеживать позицию</span>
          <select data-goal-item>${built.html}</select>
        </label>
      </article>`;
  }

  const Goals = {
    get saving() {
      return saving;
    },
    async load(productionId) {
      const goals = await DB.getGoals(productionId, null);
      State.cache.goals = goals;
      State.cache.goal = goals[0] || null;
      Offline.saveCache();
    },

    syncFromItems(root) {
      const host = root || UI.$("#panel-goals");
      if (!host || !host.querySelector("[data-goal]")) return;
      host.querySelectorAll("[data-goal]").forEach((card) => {
        const id = card.getAttribute("data-goal");
        const goal = goalsList().find((g) => g.id === id);
        const select = card.querySelector("[data-goal-item]");
        const current = select ? select.value : trackedItemIdFromGoal(goal);
        const built = optionsHtml(current);
        if (select) {
          const keep = select.value;
          select.innerHTML = built.html;
          if (built.exists) select.value = keep || current;
          else {
            select.value = "";
            if (current) persistCard(card);
          }
        }
        paintCard(card);
      });
    },

    async render(root) {
      if (!root) return;
      if (saving || formBusy(root)) {
        paintAll(root);
        return;
      }

      const goals = goalsList();
      let history = [];
      try {
        history = await DB.getPackedHistory(State.data.productionId);
      } catch {
        history = [];
      }
      if (saving || formBusy(root)) {
        paintAll(root);
        return;
      }

      root.innerHTML = `
        <div class="plan-layout">
          <div class="plan-main">
            <div class="plan-toolbar">
              <h2 class="plan-title">Дневной план</h2>
              <button type="button" class="btn btn-primary" id="addGoal">Добавить цель</button>
            </div>
            <p class="lede">${UI.todayISO()}</p>
            ${
              goals.length
                ? goals.map(cardHtml).join("")
                : '<p class="empty">Целей на сегодня нет. Добавьте первую.</p>'
            }
          </div>
          <div class="plan-history">
            <h3 class="plan-history-title">По датам</h3>
            ${
              history.length
                ? history
                    .map((h) => {
                      const parts = Array.isArray(h.goals) && h.goals.length
                        ? h.goals
                            .map((g) => {
                              const item = findTracked(trackedItemIdFromGoal(g));
                              const name = item ? item.name : "";
                              return `план ${g.target}${name ? " · " + name : ""}`;
                            })
                            .join("; ")
                        : `план ${h.target}`;
                      return `
              <div class="history-item">
                <span></span>
                <div>
                  <div class="who">${UI.escapeHtml(h.date)}</div>
                  <div class="delta">${UI.escapeHtml(parts)}</div>
                </div>
              </div>`;
                    })
                    .join("")
                : '<p class="empty">Истории пока нет.</p>'
            }
          </div>
        </div>
      `;

      root.querySelectorAll("[data-goal]").forEach(bindCard);
      const addBtn = UI.$("#addGoal", root);
      if (addBtn) {
        addBtn.addEventListener("click", async () => {
          try {
            const res = await DB.upsertGoal(State.token(), State.data.productionId, null, 0, "", null);
            const goal = res.goal;
            if (goal) {
              State.cache.goals = goalsList().concat([goal]);
              Offline.saveCache();
            }
            await Goals.load(State.data.productionId);
            await Goals.render(root);
          } catch {
            UI.toast("Не удалось добавить цель", true);
          }
        });
      }
    },
  };

  global.Goals = Goals;
})(window);
