/**
 * Дневной план: цели по складским позициям, учёт уже имеющегося количества,
 * автоматическое выполнение при факт >= план.
 */
(function (global) {
  const TRACK_PREFIX = "item:";
  const editing = new Set();
  let saving = false;
  let composerOpen = false;
  let composerRows = [{ itemId: "", target: "" }];
  let composerUseExisting = false;

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

  function parseGoalMeta(goal) {
    const raw = String((goal && goal.label) || "");
    let itemId = goal && goal.tracked_item_id ? String(goal.tracked_item_id) : "";
    let startQty = null;
    let manualDone = false;
    if (raw.startsWith(TRACK_PREFIX)) {
      const parts = raw.slice(TRACK_PREFIX.length).split("|");
      if (!itemId) itemId = parts[0] || "";
      parts.slice(1).forEach((part) => {
        if (part.indexOf("start:") === 0) {
          const n = Number.parseInt(part.slice(6), 10);
          if (Number.isFinite(n) && n >= 0) startQty = n;
        }
        if (part === "done:1" || part === "done") manualDone = true;
      });
    } else if (/(^|\|)done:1(\||$)/.test(raw)) {
      manualDone = true;
    }
    return { itemId, startQty, manualDone };
  }

  function encodeTrackedLabel(itemId, startQty, done) {
    if (!itemId) return "";
    let out = TRACK_PREFIX + itemId;
    if (startQty != null && startQty !== "") out += "|start:" + String(startQty);
    if (done) out += "|done:1";
    return out;
  }

  function optionLabel(item) {
    const sum = item.is_sum ? "Σ " : "";
    return `${item.deptName} / ${item.groupName} / ${sum}${item.name}`;
  }

  function pathLabel(item) {
    if (!item) return "позиция не выбрана";
    const sum = item.is_sum ? "Σ " : "";
    return [item.deptName, item.groupName, sum + item.name].filter(Boolean).join("\\");
  }

  function findTracked(itemId) {
    if (!itemId) return null;
    return flattenItems().find((i) => i.id === itemId) || null;
  }

  function stockQty(itemId) {
    const item = findTracked(itemId);
    return item ? UI.parseNonNegInt(item.quantity, 0) : 0;
  }

  function goalsList() {
    return Array.isArray(State.cache.goals) ? State.cache.goals : [];
  }

  function statsFor(goal, overrideTarget) {
    const target = overrideTarget != null ? overrideTarget : goal ? UI.parseNonNegInt(goal.target, 0) : 0;
    const meta = parseGoalMeta(goal);
    const item = findTracked(meta.itemId);
    const current = item ? UI.parseNonNegInt(item.quantity, 0) : 0;
    const fact = meta.startQty != null ? Math.max(current - meta.startQty, 0) : current;
    const autoDone = !!item && fact >= target;
    const done = !!meta.manualDone || autoDone;
    return {
      target,
      fact,
      left: Math.max(target - fact, 0),
      itemId: meta.itemId,
      item,
      startQty: meta.startQty,
      manualDone: !!meta.manualDone,
      current,
      done,
    };
  }

  function pickNamed(items, re) {
    const matches = items.filter((i) => re.test(i.name));
    if (!matches.length) return null;
    const preferred = matches.filter((i) => /сборк|упаков/i.test(String(i.deptName) + " " + String(i.groupName)));
    const pool = preferred.length ? preferred : matches;
    return pool[pool.length - 1];
  }

  function defaultComposerRows() {
    const items = flattenItems();
    const black = pickNamed(items, /чёрн|черн/i);
    const white = pickNamed(items, /бел/i);
    if (black && white && black.id !== white.id) {
      return [
        { itemId: black.id, target: "" },
        { itemId: white.id, target: "" },
      ];
    }
    return [{ itemId: "", target: "" }];
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
    return active.matches(
      "[data-goal-target], [data-goal-item], [data-compose-item], [data-compose-target], #composeUseExisting"
    );
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
    if (nameEl) nameEl.textContent = pathLabel(s.item);
    card.classList.toggle("is-done", !!s.done);
    const badge = card.querySelector("[data-plan-status]");
    if (badge) badge.classList.toggle("hidden", !s.done);
    const completeBtn = card.querySelector("[data-goal-complete]");
    if (completeBtn) completeBtn.classList.toggle("hidden", !!s.done);
  }

  function paintAll(root) {
    if (!root) return;
    let moved = false;
    root.querySelectorAll("[data-goal]").forEach((card) => {
      const wasDone = card.classList.contains("is-done");
      paintCard(card);
      if (card.classList.contains("is-done") !== wasDone) moved = true;
    });
    return moved;
  }

  async function persistCard(card, opts) {
    if (!card || !State.data.productionId) return false;
    const id = card.getAttribute("data-goal");
    const goal = goalsList().find((g) => g.id === id);
    const input = card.querySelector("[data-goal-target]");
    const select = card.querySelector("[data-goal-item]");
    const prev = parseGoalMeta(goal);
    const targetVal = input
      ? UI.parseNonNegInt(input.value, 0)
      : UI.parseNonNegInt(goal && goal.target, 0);
    const itemId = select ? select.value : prev.itemId;
    const startQty = itemId && itemId === prev.itemId ? prev.startQty : null;
    const keepDone = !!(opts && opts.complete) || (prev.manualDone && !(opts && opts.clearDone));
    let labelVal = encodeTrackedLabel(itemId, startQty, keepDone);
    if (!itemId) {
      const raw = String((goal && goal.label) || "").replace(/\|?done:1/g, "");
      labelVal = keepDone ? (raw ? raw + "|done:1" : "done:1") : raw;
    }
    saving = true;
    try {
      const res = await DB.upsertGoal(State.token(), State.data.productionId, null, targetVal, labelVal, id);
      const saved = res.goal || { id, target: targetVal, label: labelVal };
      State.cache.goals = goalsList().map((g) => (g.id === id ? Object.assign({}, g, saved) : g));
      Offline.saveCache();
      paintCard(card);
      if (opts && opts.toast) UI.toast("Цель сохранена");
      return true;
    } catch {
      UI.toast("Не удалось сохранить цель", true);
      return false;
    } finally {
      saving = false;
    }
  }

  function cardRoot(card) {
    return card.closest(".panel") || card.parentElement;
  }

  function bindCard(card) {
    const input = card.querySelector("[data-goal-target]");
    const select = card.querySelector("[data-goal-item]");
    if (input) {
      input.addEventListener("input", () => paintCard(card));
    }
    if (select) {
      select.addEventListener("change", () => paintCard(card));
    }
    const completeBtn = card.querySelector("[data-goal-complete]");
    if (completeBtn) {
      completeBtn.addEventListener("click", async () => {
        const ok = await persistCard(card, { complete: true, toast: false });
        if (!ok) return;
        editing.delete(card.getAttribute("data-goal"));
        UI.toast("План выполнен");
        await Goals.render(cardRoot(card), { force: true });
      });
    }
    const editBtn = card.querySelector("[data-goal-edit]");
    if (editBtn) {
      editBtn.addEventListener("click", async () => {
        const id = card.getAttribute("data-goal");
        if (editing.has(id)) {
          const ok = await persistCard(card, { toast: true, clearDone: true });
          if (!ok) return;
          editing.delete(id);
        } else {
          editing.add(id);
        }
        await Goals.render(cardRoot(card), { force: true });
      });
    }
    const cancelBtn = card.querySelector("[data-goal-cancel]");
    if (cancelBtn) {
      cancelBtn.addEventListener("click", async () => {
        editing.delete(card.getAttribute("data-goal"));
        await Goals.render(cardRoot(card), { force: true });
      });
    }
    const del = card.querySelector("[data-goal-del]");
    if (del) {
      del.addEventListener("click", async () => {
        const id = card.getAttribute("data-goal");
        try {
          await DB.deleteGoal(State.token(), id);
          editing.delete(id);
          State.cache.goals = goalsList().filter((g) => g.id !== id);
          Offline.saveCache();
          await Goals.render(cardRoot(card), { force: true });
        } catch {
          UI.toast("Не удалось удалить цель", true);
        }
      });
    }
  }

  function cardHtml(goal) {
    const s = statsFor(goal);
    const isEditing = editing.has(goal.id);
    const built = optionsHtml(s.itemId);
    const doneClass = s.done ? " is-done" : "";
    const fields = isEditing
      ? `
        <label class="field">
          <span>Цель</span>
          <input type="number" data-goal-target min="0" step="1" inputmode="numeric" value="${s.target}" />
        </label>
        <label class="field">
          <span>Отслеживать позицию</span>
          <select data-goal-item>${built.html}</select>
        </label>`
      : "";
    const actions = isEditing
      ? `
        <div class="goal-actions">
          <button type="button" class="btn btn-primary" data-goal-edit>Сохранить</button>
          <button type="button" class="btn" data-goal-cancel>Отмена</button>
          <button type="button" class="btn btn-ghost" data-goal-del>Удалить</button>
        </div>`
      : `
        <div class="goal-actions">
          <button type="button" class="btn btn-primary${s.done ? " hidden" : ""}" data-goal-complete>Выполнить</button>
          <button type="button" class="btn" data-goal-edit>Изменить</button>
          <button type="button" class="btn btn-ghost" data-goal-del>Удалить</button>
        </div>`;
    return `
      <article class="goal-card${doneClass}" data-goal="${goal.id}">
        <div class="goal-card-head">
          <p class="lede"><span class="plan-track-name">${UI.escapeHtml(pathLabel(s.item))}</span></p>
        </div>
        <p class="plan-done${s.done ? "" : " hidden"}" data-plan-status>✅ План выполнен</p>
        <div class="goal-grid">
          <div class="stat"><b data-stat="target">${s.target}</b><span>План</span></div>
          <div class="stat"><b data-stat="fact">${s.fact}</b><span>Факт</span></div>
          <div class="stat"><b data-stat="left">${s.left}</b><span>Осталось</span></div>
        </div>
        ${fields}
        ${actions}
      </article>`;
  }

  function composerPreviewHtml() {
    if (!composerUseExisting) return "";
    const lines = composerRows
      .map((row) => {
        const item = findTracked(row.itemId);
        if (!item) return "";
        const want = UI.parseNonNegInt(row.target, 0);
        const have = UI.parseNonNegInt(item.quantity, 0);
        const extra = Math.max(want - have, 0);
        return `<div class="plan-preview-row">
          <b>${UI.escapeHtml(pathLabel(item))}</b>
          <span>Уже есть: ${have} → дополнительно: ${extra}</span>
        </div>`;
      })
      .filter(Boolean)
      .join("");
    if (!lines) {
      return '<div class="plan-preview"><p class="lede">Выберите позицию, чтобы увидеть расчёт.</p></div>';
    }
    return `<div class="plan-preview"><p class="plan-preview-title">Уже есть</p>${lines}</div>`;
  }

  function composerRowHtml(row, index) {
    const built = optionsHtml(row.itemId);
    return `
      <div class="plan-compose-row" data-compose-row="${index}">
        <label class="field">
          <span>Позиция</span>
          <select data-compose-item>${built.html}</select>
        </label>
        <label class="field">
          <span>Цель</span>
          <input type="number" data-compose-target min="0" step="1" inputmode="numeric" value="${UI.escapeHtml(row.target)}" placeholder="0" />
        </label>
      </div>`;
  }

  function composerHtml() {
    if (!composerOpen) return "";
    return `
      <form class="goal-card plan-compose" id="planCompose">
        <h3 class="plan-compose-title">Новый план на сегодня</h3>
        ${composerRows.map(composerRowHtml).join("")}
        <button type="button" class="btn btn-ghost" id="composeAddRow">Ещё позиция</button>
        <label class="chip-check plan-existing">
          <input type="checkbox" id="composeUseExisting"${composerUseExisting ? " checked" : ""} />
          <span>Учитывать уже имеющуюся готовую продукцию</span>
        </label>
        <div id="composePreview">${composerPreviewHtml()}</div>
        <div class="row-actions">
          <button type="submit" class="btn btn-primary">Создать план</button>
          <button type="button" class="btn btn-ghost" id="composeCancel">Отмена</button>
        </div>
      </form>`;
  }

  function readComposer(root) {
    const form = UI.$("#planCompose", root);
    if (!form) return;
    composerUseExisting = !!(UI.$("#composeUseExisting", form) && UI.$("#composeUseExisting", form).checked);
    composerRows = UI.$all("[data-compose-row]", form).map((row) => ({
      itemId: (row.querySelector("[data-compose-item]") || {}).value || "",
      target: (row.querySelector("[data-compose-target]") || {}).value || "",
    }));
    if (!composerRows.length) composerRows = [{ itemId: "", target: "" }];
  }

  function refreshComposerPreview(root) {
    readComposer(root);
    const box = UI.$("#composePreview", root);
    if (box) box.innerHTML = composerPreviewHtml();
  }

  function bindComposer(root) {
    const form = UI.$("#planCompose", root);
    if (!form) return;
    form.addEventListener("input", () => refreshComposerPreview(root));
    form.addEventListener("change", () => refreshComposerPreview(root));
    const addRow = UI.$("#composeAddRow", form);
    if (addRow) {
      addRow.addEventListener("click", () => {
        readComposer(root);
        composerRows.push({ itemId: "", target: "" });
        Goals.render(root, { force: true });
      });
    }
    const cancel = UI.$("#composeCancel", form);
    if (cancel) {
      cancel.addEventListener("click", () => {
        composerOpen = false;
        Goals.render(root, { force: true });
      });
    }
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      readComposer(root);
      const rows = composerRows.filter((row) => row.itemId);
      if (!rows.length) {
        UI.toast("Выберите позицию", true);
        return;
      }
      saving = true;
      try {
        for (const row of rows) {
          const typed = UI.parseNonNegInt(row.target, 0);
          const label = encodeTrackedLabel(row.itemId);
          await DB.upsertGoal(
            State.token(),
            State.data.productionId,
            null,
            typed,
            label,
            null,
            composerUseExisting
          );
        }
        composerOpen = false;
        composerUseExisting = false;
        composerRows = [{ itemId: "", target: "" }];
        UI.toast("План создан");
        saving = false;
        await Goals.load(State.data.productionId);
        await Goals.render(root, { force: true });
      } catch {
        UI.toast("Не удалось создать план", true);
      } finally {
        saving = false;
      }
    });
  }

  function historyLine(g) {
    const s = statsFor(g);
    const name = pathLabel(s.item);
    const done = s.done ? " · выполнен" : "";
    return `${name} · план ${g.target} · факт ${s.fact}${done}`;
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
      try {
        const host = root || UI.$("#panel-goals");
        if (!host || !host.querySelector("[data-goal]")) return;
        host.querySelectorAll("[data-goal]").forEach((card) => {
          const id = card.getAttribute("data-goal");
          const goal = goalsList().find((g) => g.id === id);
          const select = card.querySelector("[data-goal-item]");
          const current = select ? select.value : parseGoalMeta(goal).itemId;
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
        const needsHide = goalsList().some((g) => {
          const s = statsFor(g);
          const card = host.querySelector(`[data-goal="${g.id}"]`);
          return !!s.done && !!card;
        });
        if (needsHide && !saving && !formBusy(host)) {
          Goals.render(host, { force: true });
        }
      } catch (err) {
        console.warn("Goals.syncFromItems", err);
      }
    },

    async render(root, opts) {
      if (!root) return;
      const force = !!(opts && opts.force);
      if (!force && (saving || formBusy(root))) {
        paintAll(root);
        return;
      }

      const goals = goalsList();
      const active = goals.filter((g) => !statsFor(g).done);
      let history = [];
      try {
        history = await DB.getPackedHistory(State.data.productionId);
      } catch {
        history = [];
      }
      if (!force && (saving || formBusy(root))) {
        paintAll(root);
        return;
      }

      root.innerHTML = `
        <div class="plan-layout">
          <div class="plan-main">
            <div class="plan-toolbar">
              <h2 class="plan-title">Дневной план</h2>
              <button type="button" class="btn btn-primary" id="addGoal">Новый план</button>
            </div>
            <p class="lede">${UI.todayISO()}</p>
            ${composerHtml()}
            ${
              active.length
                ? active.map((g) => cardHtml(g)).join("")
                : composerOpen
                  ? ""
                  : '<p class="empty">Активных целей на сегодня нет.</p>'
            }
          </div>
          <div class="plan-history">
            <h3 class="plan-history-title">По датам</h3>
            ${
              history.length
                ? history
                    .map((h) => {
                      const lines =
                        Array.isArray(h.goals) && h.goals.length
                          ? h.goals.map((g) => historyLine(g))
                          : [`план ${h.target}`];
                      return `
              <div class="history-item">
                <span></span>
                <div>
                  <div class="who">${UI.escapeHtml(h.date)}</div>
                  ${lines
                    .map((line) => `<div class="delta plan-day-line">${UI.escapeHtml(line)}</div>`)
                    .join("")}
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
      bindComposer(root);
      const addBtn = UI.$("#addGoal", root);
      if (addBtn) {
        addBtn.addEventListener("click", () => {
          composerOpen = true;
          composerUseExisting = false;
          composerRows = defaultComposerRows();
          Goals.render(root, { force: true });
        });
      }
    },
  };

  global.Goals = Goals;
})(window);
