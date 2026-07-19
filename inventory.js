(() => {
  "use strict";

  const api = window.DPRO_API;
  const q = (selector, root = document) => root.querySelector(selector);
  const qa = (selector, root = document) => [...root.querySelectorAll(selector)];
  let categories = [];
  let products = [];
  let staff = [];
  let selectedAsset = null;

  const statusLabels = {
    available: "貸出可能",
    reserved: "予約済み",
    rented: "貸出中",
    returned_pending: "回収済み・消毒待ち",
    sanitizing: "消毒中",
    inspection: "点検中",
    repair: "修理中",
    retired: "廃棄・除却",
    lost: "紛失",
  };

  const statusClasses = {
    available: "status--success",
    reserved: "status--info",
    rented: "status--info",
    returned_pending: "status--warning",
    sanitizing: "status--warning",
    inspection: "status--warning",
    repair: "status--danger",
    retired: "status--danger",
    lost: "status--danger",
  };

  function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
    }[char]));
  }

  function formObject(form) {
    const data = Object.fromEntries(new FormData(form).entries());
    qa('input[type="checkbox"]', form).forEach((input) => {
      data[input.name] = input.checked;
    });
    return data;
  }

  function setLoading(button, loading) {
    if (!button) return;
    if (!button.dataset.label) button.dataset.label = button.textContent;
    button.disabled = loading;
    button.textContent = loading ? "処理中…" : button.dataset.label;
  }

  function errorText(target, error) {
    if (target) target.textContent = error?.message || String(error || "");
  }

  function yen(value) {
    if (value === null || value === undefined || value === "") return "未設定";
    return `${Number(value).toLocaleString("ja-JP")}円`;
  }

  function dateText(value) {
    if (!value) return "未設定";
    const date = new Date(`${value}T00:00:00+09:00`);
    return Number.isNaN(date.getTime())
      ? value
      : new Intl.DateTimeFormat("ja-JP").format(date);
  }

  function setupSubtabs() {
    qa("[data-inventory-tab]").forEach((button) => {
      button.addEventListener("click", () => {
        const target = button.dataset.inventoryTab;
        qa("[data-inventory-tab]").forEach((item) =>
          item.classList.toggle("is-active", item === button)
        );
        qa("[data-inventory-panel]").forEach((panel) => {
          panel.hidden = panel.dataset.inventoryPanel !== target;
        });
      });
    });
  }

  async function loadSummary() {
    const data = await api.request("/admin/inventory/summary");
    Object.entries(data.counts || {}).forEach(([key, value]) => {
      qa(`[data-inventory-count="${key}"]`).forEach((node) => {
        node.textContent = String(value);
      });
    });
  }

  async function loadMasterOptions() {
    const [categoryData, productData, staffData] = await Promise.all([
      api.request("/admin/product-categories"),
      api.request("/admin/products?active_only=true"),
      api.request("/admin/staff"),
    ]);
    categories = categoryData.categories || [];
    products = productData.products || [];
    staff = staffData.staff || [];
    fillMasterSelects();
    renderProducts();
  }

  function fillMasterSelects() {
    qa("[data-category-select]").forEach((select) => {
      const current = select.value;
      select.innerHTML =
        '<option value="">選択してください</option>' +
        categories
          .filter((item) => item.is_active)
          .map((item) =>
            `<option value="${esc(item.id)}">${esc(item.category_name)}｜${esc(item.insurance_class)}</option>`
          ).join("");
      select.value = current;
    });

    qa("[data-rental-product-select]").forEach((select) => {
      const current = select.value;
      select.innerHTML =
        '<option value="">選択してください</option>' +
        products
          .filter((item) => item.is_active && item.can_rent)
          .map((item) =>
            `<option value="${esc(item.id)}">${esc(item.product_code)}｜${esc(item.product_name)}</option>`
          ).join("");
      select.value = current;
    });

    qa("[data-sale-product-select]").forEach((select) => {
      const current = select.value;
      select.innerHTML =
        '<option value="">選択してください</option>' +
        products
          .filter((item) => item.is_active && item.can_sell)
          .map((item) =>
            `<option value="${esc(item.id)}">${esc(item.product_code)}｜${esc(item.product_name)}</option>`
          ).join("");
      select.value = current;
    });

    qa("[data-inventory-staff-select]").forEach((select) => {
      const current = select.value;
      select.innerHTML =
        '<option value="">未選択</option>' +
        staff.map((item) =>
          `<option value="${esc(item.id)}">${esc(item.staff_name)}</option>`
        ).join("");
      select.value = current;
    });
  }

  function renderProducts() {
    const target = q("#product-list");
    if (!target) return;
    if (!products.length) {
      target.innerHTML = '<div class="notice notice--info">商品が登録されていません。</div>';
      return;
    }
    target.innerHTML = products.map((product) => `
      <article class="product-row">
        <div>
          <p class="eyebrow">${esc(product.product_code)}</p>
          <h3>${esc(product.product_name)}</h3>
          <p>${esc(product.manufacturer || "メーカー未設定")} ${esc(product.model_number || "")}</p>
          <p class="help">
            ${product.can_rent ? `貸与 ${esc(yen(product.monthly_rental_price))}` : ""}
            ${product.can_rent && product.can_sell ? "｜" : ""}
            ${product.can_sell ? `販売 ${esc(yen(product.sale_price))}` : ""}
            ${product.selection_option ? "｜選択制" : ""}
          </p>
        </div>
        <div class="product-row__meta">
          <span class="status ${product.is_active ? "status--success" : "status--danger"}">${product.is_active ? "有効" : "無効"}</span>
          <span>点検 ${esc(product.inspection_interval_days)}日</span>
        </div>
      </article>
    `).join("");
  }

  function renderAssets(assets) {
    const target = q("#asset-list");
    if (!target) return;
    if (!assets.length) {
      target.innerHTML = '<div class="notice notice--info">該当する用具個体はありません。</div>';
      return;
    }
    target.innerHTML = assets.map((asset) => {
      const product = asset.product_models || {};
      return `
        <article class="asset-row ${selectedAsset?.id === asset.id ? "is-selected" : ""}">
          <div>
            <div class="asset-row__head">
              <strong>${esc(asset.asset_number)}</strong>
              <span class="status ${statusClasses[asset.status] || "status--info"}">${esc(statusLabels[asset.status] || asset.status)}</span>
            </div>
            <h3>${esc(product.product_name || "商品未設定")}</h3>
            <p>${esc(product.manufacturer || "")} ${esc(product.model_number || "")}</p>
            <p class="help">
              シリアル：${esc(asset.serial_number || "未設定")}｜
              保管場所：${esc(asset.current_location || "未設定")}｜
              次回点検：${esc(dateText(asset.inspection_due_date))}
            </p>
          </div>
          <button class="button button--secondary button--small select-asset" type="button"
            data-asset='${esc(JSON.stringify(asset))}'>選択</button>
        </article>`;
    }).join("");
  }

  async function loadAssets() {
    const form = q("#asset-search-form");
    const params = new URLSearchParams();
    if (form) {
      const data = formObject(form);
      if (data.q) params.set("q", data.q);
      if (data.status) params.set("status", data.status);
    }
    errorText(q("#asset-list-error"), "");
    try {
      const data = await api.request(`/admin/assets?${params.toString()}`);
      renderAssets(data.assets || []);
    } catch (error) {
      errorText(q("#asset-list-error"), error);
    }
  }

  async function loadSaleStock() {
    const target = q("#sale-stock-list");
    if (!target) return;
    target.innerHTML = '<p class="help">読み込み中…</p>';
    try {
      const data = await api.request("/admin/sale-stock");
      const stock = data.stock || [];
      if (!stock.length) {
        target.innerHTML = '<div class="notice notice--info">販売在庫はまだ登録されていません。</div>';
        return;
      }
      target.innerHTML = stock.map((item) => {
        const product = item.product_models || {};
        return `
          <article class="stock-row ${item.low_stock ? "is-low" : ""}">
            <div>
              <p class="eyebrow">${esc(product.product_code || "")}</p>
              <h3>${esc(product.product_name || "商品未設定")}</h3>
              <p>${esc(item.location_name)}｜予約 ${esc(item.reserved_quantity)}個</p>
            </div>
            <div class="stock-row__quantity">
              <strong>${esc(item.quantity_on_hand)}</strong><span>個</span>
              ${item.low_stock ? '<span class="status status--danger">在庫警告</span>' : '<span class="status status--success">在庫正常</span>'}
            </div>
          </article>`;
      }).join("");
    } catch (error) {
      target.innerHTML = `<p class="error-text">${esc(error.message)}</p>`;
    }
  }

  function renderSelectedAsset() {
    const message = q("#selected-asset-message");
    const content = q("#asset-operation-content");
    const summary = q("#selected-asset-summary");
    const buttons = q("#asset-action-buttons");
    const history = q("#asset-history");
    if (!message || !content || !summary || !buttons) return;

    if (!selectedAsset) {
      message.textContent = "一覧から用具を選択してください。";
      content.hidden = true;
      return;
    }

    const product = selectedAsset.product_models || {};
    message.textContent = "状態に応じて実行可能な工程だけ表示しています。";
    content.hidden = false;
    history.innerHTML = "";
    summary.innerHTML = `
      <strong>${esc(selectedAsset.asset_number)}</strong>
      <span>${esc(product.product_name || "")}</span>
      <span class="status ${statusClasses[selectedAsset.status] || "status--info"}">${esc(statusLabels[selectedAsset.status] || selectedAsset.status)}</span>
    `;

    const actions = [];
    if (selectedAsset.status === "returned_pending") {
      actions.push(["start-sanitization", "消毒を開始", "button--primary"]);
    }
    if (selectedAsset.status === "sanitizing") {
      actions.push(["complete-sanitization", "消毒合格・点検へ", "button--primary"]);
      actions.push(["sanitization-failed", "消毒不合格・修理へ", "button--danger"]);
    }
    if (["inspection","repair","available"].includes(selectedAsset.status)) {
      actions.push(["inspection-pass", "点検合格・貸出可能", "button--primary"]);
      actions.push(["inspection-fail", "点検不合格・修理へ", "button--danger"]);
    }
    if (["available","reserved","inspection","repair","returned_pending","sanitizing","lost"].includes(selectedAsset.status)) {
      actions.push(["retire", "廃棄・除却", "button--outline"]);
    }
    if (["available","reserved"].includes(selectedAsset.status)) {
      actions.push(["repair", "修理へ移動", "button--outline"]);
    }

    buttons.innerHTML = actions.map(([action, label, cls]) =>
      `<button class="button ${cls}" type="button" data-asset-action="${action}">${esc(label)}</button>`
    ).join("") || '<p class="help">現在の状態で手動実行できる操作はありません。</p>';
  }

  async function assetAction(action) {
    if (!selectedAsset) return;
    const error = q("#asset-operation-error");
    errorText(error, "");
    const note = q("#asset-operation-note")?.value || "";
    const staffId = q("#asset-operation-staff")?.value || null;
    let path;
    let method = "POST";
    let body = { office_code: window.DPRO_CONFIG.officeCode, staff_id: staffId };

    if (action === "start-sanitization") {
      path = `/admin/assets/${selectedAsset.id}/sanitization/start`;
      body.method = note || "標準洗浄・消毒";
    } else if (action === "complete-sanitization") {
      path = `/admin/assets/${selectedAsset.id}/sanitization/complete`;
      body.result = "passed";
      body.note = note;
    } else if (action === "sanitization-failed") {
      path = `/admin/assets/${selectedAsset.id}/sanitization/complete`;
      body.result = "failed";
      body.note = note;
    } else if (action === "inspection-pass") {
      path = `/admin/assets/${selectedAsset.id}/inspection`;
      body.result = selectedAsset.status === "repair" ? "repaired" : "passed";
      body.detail = note;
    } else if (action === "inspection-fail") {
      path = `/admin/assets/${selectedAsset.id}/inspection`;
      body.result = "failed";
      body.detail = note;
    } else if (action === "retire") {
      if (!confirm("この用具を廃棄・除却状態にします。元へ戻せません。よろしいですか？")) return;
      path = `/admin/assets/${selectedAsset.id}/status`;
      method = "PATCH";
      body.status = "retired";
      body.reason = note || "廃棄・除却";
    } else if (action === "repair") {
      path = `/admin/assets/${selectedAsset.id}/status`;
      method = "PATCH";
      body.status = "repair";
      body.reason = note || "修理対応";
    } else {
      return;
    }

    try {
      const data = await api.request(path, { method, body });
      window.DPRO?.toast("用具の状態を更新しました。");
      selectedAsset.status =
        data.result?.status || data.asset?.status || selectedAsset.status;
      q("#asset-operation-note").value = "";
      renderSelectedAsset();
      await Promise.all([loadAssets(), loadSummary()]);
    } catch (err) {
      errorText(error, err);
    }
  }

  async function showHistory() {
    if (!selectedAsset) return;
    const target = q("#asset-history");
    target.innerHTML = '<p class="help">履歴を読み込み中…</p>';
    try {
      const data = await api.request(`/admin/assets/${selectedAsset.id}/history`);
      const statusRows = (data.status_logs || []).map((row) =>
        `<li><strong>${esc(row.from_status || "新規")} → ${esc(row.to_status)}</strong><span>${esc(new Date(row.changed_at).toLocaleString("ja-JP"))}</span></li>`
      ).join("");
      const maintenanceRows = (data.maintenance || []).map((row) =>
        `<li><strong>${esc(row.maintenance_type)}｜${esc(row.result || "進行中")}</strong><span>${esc(row.detail || "")}</span></li>`
      ).join("");
      const sanitationRows = (data.sanitization || []).map((row) =>
        `<li><strong>消毒｜${esc(row.result || "進行中")}</strong><span>${esc(row.method || "")}</span></li>`
      ).join("");
      target.innerHTML = `
        <h3>状態履歴</h3><ul>${statusRows || "<li>履歴なし</li>"}</ul>
        <h3>点検・修理</h3><ul>${maintenanceRows || "<li>履歴なし</li>"}</ul>
        <h3>消毒</h3><ul>${sanitationRows || "<li>履歴なし</li>"}</ul>`;
    } catch (error) {
      target.innerHTML = `<p class="error-text">${esc(error.message)}</p>`;
    }
  }

  function setupForms() {
    q("#category-form")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const button = q('button[type="submit"]', form);
      setLoading(button, true);
      errorText(q("#category-error"), "");
      try {
        await api.request("/admin/product-categories", {
          method: "POST", body: formObject(form)
        });
        form.reset();
        window.DPRO?.toast("カテゴリを追加しました。");
        await loadMasterOptions();
      } catch (error) {
        errorText(q("#category-error"), error);
      } finally {
        setLoading(button, false);
      }
    });

    q("#product-form")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const button = q('button[type="submit"]', form);
      setLoading(button, true);
      errorText(q("#product-error"), "");
      try {
        await api.request("/admin/products", {
          method: "POST", body: formObject(form)
        });
        form.reset();
        q('[name="can_rent"]', form).checked = true;
        q('[name="inspection_interval_days"]', form).value = "180";
        q('[name="stock_alert_threshold"]', form).value = "2";
        window.DPRO?.toast("商品マスターを登録しました。");
        await loadMasterOptions();
      } catch (error) {
        errorText(q("#product-error"), error);
      } finally {
        setLoading(button, false);
      }
    });

    q("#asset-form")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const button = q('button[type="submit"]', form);
      setLoading(button, true);
      errorText(q("#asset-form-error"), "");
      try {
        const data = await api.request("/admin/assets", {
          method: "POST", body: formObject(form)
        });
        form.reset();
        q('[name="current_location"]', form).value = "本社倉庫";
        window.DPRO?.toast(data.message);
        await Promise.all([loadAssets(), loadSummary()]);
      } catch (error) {
        errorText(q("#asset-form-error"), error);
      } finally {
        setLoading(button, false);
      }
    });

    q("#sale-stock-form")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const button = q('button[type="submit"]', form);
      setLoading(button, true);
      errorText(q("#sale-stock-error"), "");
      try {
        await api.request("/admin/sale-stock/adjust", {
          method: "POST", body: formObject(form)
        });
        form.reset();
        q('[name="location_name"]', form).value = "本社倉庫";
        window.DPRO?.toast("販売在庫を更新しました。");
        await Promise.all([loadSaleStock(), loadSummary()]);
      } catch (error) {
        errorText(q("#sale-stock-error"), error);
      } finally {
        setLoading(button, false);
      }
    });

    q("#asset-search-form")?.addEventListener("submit", (event) => {
      event.preventDefault();
      loadAssets();
    });
    q("#reload-assets")?.addEventListener("click", loadAssets);
    q("#reload-products")?.addEventListener("click", loadMasterOptions);
    q("#reload-sale-stock")?.addEventListener("click", loadSaleStock);

    q("#asset-list")?.addEventListener("click", (event) => {
      const button = event.target.closest(".select-asset");
      if (!button) return;
      selectedAsset = JSON.parse(button.dataset.asset);
      renderSelectedAsset();
      loadAssets();
      q("#asset-operation-card")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });

    q("#asset-action-buttons")?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-asset-action]");
      if (!button) return;
      assetAction(button.dataset.assetAction);
    });

    q("#show-asset-history")?.addEventListener("click", showHistory);
  }

  async function initialize() {
    const panel = q("#inventory-panel");
    if (!panel || !api) return;
    try {
      await Promise.all([
        loadSummary(),
        loadMasterOptions(),
        loadAssets(),
        loadSaleStock(),
      ]);
      renderSelectedAsset();
    } catch (error) {
      errorText(q("#asset-list-error"), error);
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    if (!q("#inventory-panel")) return;
    setupSubtabs();
    setupForms();
    document.addEventListener("dpro-admin-ready", initialize, { once: true });
    if (
      sessionStorage.getItem("dpro_welfare_admin_ok") === "1" &&
      api?.hasToken()
    ) {
      initialize();
    }
  });
})();
