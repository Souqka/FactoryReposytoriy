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

  function setLocalQty(itemId, qty, version) {
    const found = findItem(itemId);
    if (!found) return;
    found.item.quantity = qty;
    if (version != null) found.item.version = version;
    const el = document.querySelector(`[data-item="${itemId}"]`);
    if (el) {
      const val = el.querySelector(".qty-value");
      if (val && !val.querySelector("input")) val.textContent = String(qty);
      el.classList.toggle("is-crit", qty <= found.item.min_limit);
      const meta = el.querySelector(".item-meta");
      if (meta) meta.textContent = `Минимум: ${found.item.min_limit}`;
    }
  }

  async function commitQty(itemId, newQty) {
    const found = findItem(itemId);
    if (!found) return;
    const item = found.item;
    newQty = Math.max(0, Math.floor(Number(newQty)));
    if (!Number.isFinite(newQty) || newQty === item.quantity) {
      setLocalQty(itemId, item.quantity);
      return;
    }
    const oldQty = item.quantity;
    setLocalQty(itemId, newQty);

    const job = { itemId, oldQty, newQty };

    if (!navigator.onLine && DB.mode === "supabase") {
      Offline.enqueueQty(job);
      UI.toast("Нет сети — изменение в очереди");
      return;
    }

    try {
      const res = await DB.updateItemQuantity(State.token(), itemId, oldQty, newQty);
      if (res && res.ok) {
        setLocalQty(itemId, res.quantity, res.version);
        Offline.saveCache();
        return;
      }
      if (res && res.error === "conflict") {
        setLocalQty(itemId, res.quantity, res.version);
        UI.toast("Количество уже изменили на другом устройстве", true);
        return;
      }
      setLocalQty(itemId, oldQty);
      UI.toast("Не удалось сохранить", true);
    } catch {
      Offline.enqueueQty(job);
      UI.toast("Нет связи — изменение сохранено локально", true);
    }
  }

  function startEdit(itemEl, item) {
    const box = itemEl.querySelector(".qty-value");
    if (box.querySelector("input")) return;
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

  const Production = {
    async load(productionId) {
      const tree = await DB.getTree(productionId);
      State.cache.tree = tree;
      Offline.saveCache();
      return tree;
    },

    applyRealtimeItem(row) {
      if (!row || !row.id) return;
      const found = findItem(row.id);
      if (!found) return;
      if ((row.version || 0) < (found.item.version || 0)) return;
      Object.assign(found.item, row);
      setLocalQty(row.id, row.quantity, row.version);
    },

    renderItems(root) {
      const tree = State.cache.tree || [];
      if (!tree.length) {
        root.innerHTML = '<p class="empty">В этом производстве пока нет отделов. Настройте их в админ-панели.</p>';
        return;
      }
      root.innerHTML = tree
        .map((dept) => {
          const groups = (dept.groups || [])
            .map((group) => {
              const items = (group.items || [])
                .map((item) => {
                  const crit = item.quantity <= item.min_limit;
                  return `
                    <div class="item ${crit ? "is-crit" : ""}" data-item="${item.id}">
                      <div class="item-name">${UI.escapeHtml(item.name)}</div>
                      <div class="qty-row">
                        <button type="button" class="qty-btn" data-delta="-1" aria-label="Уменьшить">−</button>
                        <div class="qty-value" data-edit>${item.quantity}</div>
                        <button type="button" class="qty-btn" data-delta="1" aria-label="Увеличить">+</button>
                      </div>
                      <div class="item-meta">Минимум: ${item.min_limit}</div>
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

      root.querySelectorAll(".item").forEach((el) => {
        const id = el.getAttribute("data-item");
        el.querySelectorAll("[data-delta]").forEach((btn) => {
          btn.addEventListener("click", () => {
            const delta = parseInt(btn.getAttribute("data-delta"), 10);
            enqueue(id, () => {
              const found = findItem(id);
              if (!found) return;
              return commitQty(id, found.item.quantity + delta);
            });
          });
        });
        const value = el.querySelector("[data-edit]");
        value.addEventListener("click", () => {
          const found = findItem(id);
          if (found) startEdit(el, found.item);
        });
      });
    },
  };

  global.Production = Production;
})(window);
