/**
 * Дневной план: цель, отслеживаемая позиция (факт = её количество), осталось.
 */
(function (global) {
  const TRACK_PREFIX = "item:";
  let saveTimer = 0;
  let saving = false;

  function flattenItems() {
    const tree = State.cache.tree || [];
    const out = [];
    for (const dept of tree) {
      for (const group of dept.groups || []) {
        for (const item of group.items || []) {
          out.push({
            id: item.id,
            name: item.name,
            quantity: item.quantity,
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
    return `${item.deptName} / ${item.groupName} / ${item.name}`;
  }

  function findTracked(itemId) {
    if (!itemId) return null;
    return flattenItems().find((i) => i.id === itemId) || null;
  }

  function statsFromState(overrideTarget) {
    const goal = State.cache.goal;
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

  function paintStats(root) {
    if (!root) return;
    const input = UI.$("#goalTarget", root);
    const typed = input && document.activeElement === input ? UI.parseNonNegInt(input.value, 0) : null;
    const s = statsFromState(typed);
    const t = UI.$("[data-stat=target]", root);
    const f = UI.$("[data-stat=fact]", root);
    const l = UI.$("[data-stat=left]", root);
    if (t) t.textContent = String(s.target);
    if (f) f.textContent = String(s.fact);
    if (l) l.textContent = String(s.left);
    const nameEl = UI.$(".plan-track-name", root);
    if (nameEl) nameEl.textContent = s.item ? s.item.name : "позиция не выбрана";
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
    return !!(active && root.contains(active) && (active.id === "goalTarget" || active.id === "goalTrackItem" || active.classList.contains("min-input")));
  }

  async function persist(root, opts) {
    if (!root || !State.data.productionId) return;
    const input = UI.$("#goalTarget", root);
    const select = UI.$("#goalTrackItem", root);
    const targetVal = UI.parseNonNegInt(input ? input.value : 0, 0);
    const itemId = select ? select.value : "";
    const labelVal = encodeTrackedLabel(itemId);
    saving = true;
    try {
      const res = await DB.upsertGoal(State.token(), State.data.productionId, null, targetVal, labelVal);
      State.cache.goal = res.goal || { target: targetVal, label: labelVal };
      Offline.saveCache();
      paintStats(root);
      if (opts && opts.toast) UI.toast("План сохранён");
    } catch {
      UI.toast("Не удалось сохранить план", true);
    } finally {
      saving = false;
    }
  }

  function schedulePersist(root) {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => persist(root), 400);
  }

  const Goals = {
    get saving() {
      return saving;
    },
    async load(productionId) {
      const goal = await DB.getGoal(productionId, null);
      State.cache.goal = goal;
      Offline.saveCache();
    },

    syncFromItems(root) {
      const host = root || UI.$("#panel-goals");
      if (!host || !host.querySelector("#goalForm")) return;
      const select = UI.$("#goalTrackItem", host);
      const current = select ? select.value : trackedItemIdFromGoal(State.cache.goal);
      const built = optionsHtml(current);
      if (select) {
        const keep = select.value;
        select.innerHTML = built.html;
        if (built.exists) select.value = keep || current;
        else select.value = "";
        if (!built.exists && current) {
          State.cache.goal = Object.assign({}, State.cache.goal || {}, { label: "" });
          persist(host);
        }
      }
      paintStats(host);
    },

    async render(root) {
      if (!root) return;
      if (saving || formBusy(root)) {
        paintStats(root);
        return;
      }

      const s = statsFromState();
      let history = [];
      try {
        history = await DB.getPackedHistory(State.data.productionId);
      } catch {
        history = [];
      }
      if (saving || formBusy(root)) {
        paintStats(root);
        return;
      }

      const built = optionsHtml(s.itemId);

      root.innerHTML = `
        <div class="plan-layout">
          <div class="plan-main">
            <h2 class="plan-title">Дневной план</h2>
            <p class="lede"><span class="plan-track-name">${UI.escapeHtml(s.item ? s.item.name : "позиция не выбрана")}</span> · ${UI.todayISO()}</p>
            <div class="goal-grid">
              <div class="stat"><b data-stat="target">${s.target}</b><span>План</span></div>
              <div class="stat"><b data-stat="fact">${s.fact}</b><span>Факт</span></div>
              <div class="stat"><b data-stat="left">${s.left}</b><span>Осталось</span></div>
            </div>
            <form id="goalForm">
              <label class="field">
                <span>Цель на сегодня</span>
                <input type="number" id="goalTarget" min="0" step="1" inputmode="numeric" value="${s.target}" />
              </label>
              <label class="field">
                <span>Отслеживать позицию</span>
                <select id="goalTrackItem">${built.html}</select>
              </label>
              <button class="btn btn-primary btn-block" type="submit">Сохранить план</button>
            </form>
          </div>
          <div class="plan-history">
            <h3 class="plan-history-title">По датам</h3>
            ${
              history.length
                ? history
                    .map((h) => {
                      const item = findTracked(trackedItemIdFromGoal(h));
                      const name = item ? item.name : "";
                      return `
              <div class="history-item">
                <span></span>
                <div>
                  <div class="who">${UI.escapeHtml(h.date)}</div>
                  <div class="delta">план ${h.target}${name ? " · " + UI.escapeHtml(name) : ""}</div>
                </div>
              </div>`;
                    })
                    .join("")
                : '<p class="empty">Истории пока нет.</p>'
            }
          </div>
        </div>
      `;

      const form = UI.$("#goalForm", root);
      const targetInput = UI.$("#goalTarget", root);
      const select = UI.$("#goalTrackItem", root);

      targetInput.addEventListener("input", () => {
        paintStats(root);
        schedulePersist(root);
      });
      targetInput.addEventListener("change", () => persist(root));
      targetInput.addEventListener("blur", () => persist(root));
      select.addEventListener("change", () => persist(root, { toast: true }));

      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        clearTimeout(saveTimer);
        await persist(root, { toast: true });
      });
    },
  };

  global.Goals = Goals;
})(window);
