/**
 * Экран производства: дерево отделов/групп/позиций и изменение количества.
 * Очередь на позицию: быстрые нажатия +/− не гоняются параллельно.
 * Ручной ввод фиксирует одно изменение (blur/Enter), не промежуточные цифры.
 */
(function (global) {
  const queues = new Map();

  function enqueue(itemId, fn) {
    const prev = queues.get(itemId) || Promise.resolve();
    const next = prev.then(fn, fn);
    queues.set(itemId, next.catch(() => {}));
    return next;
  }

  function findItem(itemId) {
    const tree = State.cache.tree || [];
    for (const dept of tree) {
      for (const group of dept.groups || []) {
        const item = (group.items || []).find((i) => i.id === itemId);
        if (item) return { item, group, dept };
      }
    }
    return null;
  }

  function groupSum(group) {
    return (group.items || [])
      .filter((i) => !i.is_sum)
      .reduce((sum, i) => sum + (Number(i.quantity) || 0), 0);
  }

  function displayQty(item, group) {
    if (item && item.is_sum) return groupSum(group);
    return item ? item.quantity : 0;
  }

  function refreshGroupSums(group) {
    if (!group) return;
    const sum = groupSum(group);
    (group.items || [])
      .filter((i) => i.is_sum)
      .forEach((item) => {
        item.quantity = sum;
        paintItem(item.id);
      });
  }

  function paintItem(itemId) {
    const found = findItem(itemId);
    if (!found) return;
    const el = document.querySelector(`[data-item="${itemId}"]`);
    if (!el) return;
    const item = found.item;
    const qty = displayQty(item, found.group);
    el.classList.toggle("is-crit", qty <= item.min_limit);
    const val = el.querySelector(".qty-value");
    if (val && !val.querySelector("input")) val.textContent = String(qty);
    const minVal = el.querySelector(".min-val");
    if (minVal) minVal.textContent = String(item.min_limit);
  }

  function setLocalQty(itemId, qty, version) {
    const found = findItem(itemId);
    if (!found) return;
    found.item.quantity = qty;
    if (version != null) found.item.version = version;
    paintItem(itemId);
    refreshGroupSums(found.group);
  }

  function qtyErrorText(err) {
    const details = err && err.details;
    const msg = String((details && (details.message || details.details)) || (err && err.message) || "");
    if (/invalid_session|no_session/i.test(msg)) return "Сессия истекла. Войдите снова.";
    if (/employee_required/i.test(msg)) return "Сначала выберите сотрудника.";
    if (/employee_inactive/i.test(msg)) return "Сотрудник неактивен.";
    if (err && err.kind === "db_not_ready") return "База не обновлена. Выполните SQL в Supabase.";
    if (/Failed to fetch|NetworkError|network|Load failed|offline|supabase_not_configured/i.test(msg)) {
      return "Нет связи — изменение сохранено локально";
    }
    return "Не удалось сохранить количество";
  }

  function isNetworkQtyError(err) {
    const details = err && err.details;
    const msg = String((details && (details.message || details.details)) || (err && err.message) || "");
    return /Failed to fetch|NetworkError|network|Load failed|offline|supabase_not_configured/i.test(msg);
  }

  function syncGoalsFromItems() {
    try {
      if (typeof Goals !== "undefined") Goals.syncFromItems();
    } catch (err) {
      console.warn("Goals.syncFromItems", err);
    }
  }

  async function commitQty(itemId, newQty) {
    const found = findItem(itemId);
    if (!found || found.item.is_sum) return;
    const item = found.item;
    newQty = Math.max(0, Math.floor(Number(newQty)));
    if (!Number.isFinite(newQty) || newQty === item.quantity) {
      setLocalQty(itemId, item.quantity);
      return;
    }
    const oldQty = Math.max(0, Math.floor(Number(item.quantity) || 0));
    setLocalQty(itemId, newQty);

    const job = { itemId, oldQty, newQty };

    if (!navigator.onLine && DB.mode === "supabase") {
      Offline.enqueueQty(job);
      UI.toast("Нет сети — изменение в очереди");
      return;
    }

    if (DB.mode === "supabase" && !State.token()) {
      setLocalQty(itemId, oldQty);
      UI.toast("Сессия истекла. Войдите снова.", true);
      return;
    }

    try {
      const res = await DB.updateItemQuantity(State.token(), itemId, oldQty, newQty);
      if (res && res.ok) {
        setLocalQty(itemId, res.quantity, res.version);
        Offline.saveCache();
        syncGoalsFromItems();
        return;
      }
      if (res && res.error === "conflict") {
        setLocalQty(itemId, res.quantity, res.version);
        UI.toast("Количество уже изменили на другом устройстве", true);
        return;
      }
      setLocalQty(itemId, oldQty);
      UI.toast("Не удалось сохранить", true);
    } catch (err) {
      if (isNetworkQtyError(err)) {
        Offline.enqueueQty(job);
        UI.toast("Нет связи — изменение сохранено локально", true);
        return;
      }
      setLocalQty(itemId, oldQty);
      UI.toast(qtyErrorText(err), true);
    }
  }

  function startEdit(itemEl, item) {
    if (item.is_sum) return;
    const box = itemEl.querySelector(".qty-value");
    if (!box || box.querySelector("input")) return;
    const input = document.createElement("input");
    input.type = "number";
    input.inputMode = "numeric";
    input.min = "0";
    input.step = "1";
    input.value = String(item.quantity);
    box.textContent = "";
    box.appendChild(input);
    input.focus();
    input.select();

    const finish = () => {
      const raw = input.value;
      const next = raw === "" ? item.quantity : parseInt(raw, 10);
      enqueue(item.id, () => commitQty(item.id, next));
    };

    input.addEventListener("blur", finish, { once: true });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        input.blur();
      }
      if (e.key === "Escape") {
        input.value = String(item.quantity);
        input.blur();
      }
    });
  }

  function colClass(count) {
    if (count <= 1) return "is-cols-1";
    if (count === 2) return "is-cols-2";
    return "is-cols-3";
  }

  const Production = {
    displayQty,
    async load(productionId) {
      const tree = await DB.getTree(productionId);
      (tree || []).forEach((dept) => (dept.groups || []).forEach(refreshGroupSums));
      State.cache.tree = tree;
      Offline.saveCache();
      return tree;
    },

    applyRealtimeItem(row) {
      if (!row || !row.id) return false;
      const found = findItem(row.id);
      if (!found) return false;
      if ((row.version || 0) < (found.item.version || 0)) return true;
      Object.assign(found.item, row);
      paintItem(row.id);
      refreshGroupSums(found.group);
      syncGoalsFromItems();
      return true;
    },

    renderItems(root) {
      const tree = State.cache.tree || [];
      if (!tree.length) {
        root.innerHTML = '<p class="empty">В этом производстве пока нет отделов. Настройте их в админ-панели.</p>';
        return;
      }
      const depts = tree
        .map((dept) => {
          const groups = (dept.groups || [])
            .map((group) => {
              const items = (group.items || [])
                .map((item) => {
                  const qty = displayQty(item, group);
                  const crit = qty <= item.min_limit;
                  const sumClass = item.is_sum ? " is-sum" : "";
                  return `
                    <div class="item ${crit ? "is-crit" : ""}${sumClass}" data-item="${item.id}">
                      <div class="item-head">
                        <div class="item-name">${item.is_sum ? "<span class=\"sum-mark\">Σ</span> " : ""}${UI.escapeHtml(item.name)}</div>
                        <span class="item-min">Минимум: <span class="min-val">${item.min_limit}</span></span>
                      </div>
                      <div class="qty-row">
                        <button type="button" class="qty-btn" data-delta="-1" aria-label="Уменьшить">−</button>
                        <div class="qty-value"${item.is_sum ? "" : " data-edit"}>${qty}</div>
                        <button type="button" class="qty-btn" data-delta="1" aria-label="Увеличить">+</button>
                      </div>
                    </div>`;
                })
                .join("");
              if (!items) return "";
              return `<section class="group"><div class="group-h">${UI.escapeHtml(group.name)}</div>${items}</section>`;
            })
            .join("");
          return `<section class="dept"><div class="dept-h">${dept.icon || ""} ${UI.escapeHtml(dept.name)}</div>${groups}</section>`;
        })
        .join("");

      root.innerHTML = `<div class="warehouse-grid ${colClass(tree.length)}" data-count="${tree.length}">${depts}</div>`;

      root.querySelectorAll(".item").forEach((el) => {
        const id = el.getAttribute("data-item");
        el.querySelectorAll("[data-delta]").forEach((btn) => {
          btn.addEventListener("click", () => {
            const delta = parseInt(btn.getAttribute("data-delta"), 10);
            enqueue(id, () => {
              const found = findItem(id);
              if (!found || found.item.is_sum) return;
              return commitQty(id, found.item.quantity + delta);
            });
          });
        });
        const value = el.querySelector("[data-edit]");
        if (value) {
          value.addEventListener("click", () => {
            const found = findItem(id);
            if (found) startEdit(el, found.item);
          });
        }
      });
    },
  };

  global.Production = Production;
})(window);
