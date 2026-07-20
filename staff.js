(() => {
  "use strict";

  const api = window.DPRO_API;
  const q = (selector, root = document) => root.querySelector(selector);
  const qa = (selector, root = document) => [...root.querySelectorAll(selector)];

  const state = {
    deliveries: [],
    detail: null,
    staff: [],
  };

  const labels = {
    planned: "予定",
    loading: "積込中",
    in_transit: "配送中",
    arrived: "到着",
    completed: "完了",
    failed: "未完了",
    cancelled: "取消",
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

  function showError(target, error) {
    if (target) target.textContent = error?.message || String(error || "");
  }

  function dateTimeText(value) {
    if (!value) return "未設定";
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? value
      : new Intl.DateTimeFormat("ja-JP", {
          dateStyle: "medium", timeStyle: "short",
        }).format(date);
  }

  function statusClass(status) {
    if (status === "completed") return "status--success";
    if (["failed","cancelled"].includes(status)) return "status--danger";
    return "status--warning";
  }

  function fillStaff() {
    qa("[data-delivery-work-staff]").forEach((select) => {
      const current = select.value;
      select.innerHTML = '<option value="">選択してください</option>' +
        state.staff.map((item) =>
          `<option value="${esc(item.id)}">${esc(item.staff_name)}（${esc(item.role)}）</option>`
        ).join("");
      select.value = current;
    });
  }

  async function loadMaster() {
    const data = await api.request("/admin/staff");
    state.staff = data.staff || [];
    fillStaff();
  }

  function renderList() {
    const target = q("#delivery-list");
    if (!target) return;
    if (!state.deliveries.length) {
      target.innerHTML = '<div class="notice notice--info">指定日の納品予定はありません。</div>';
      return;
    }
    target.innerHTML = state.deliveries.map((item) => `
      <article class="delivery-task-card ${state.detail?.delivery?.id === item.id ? "is-selected" : ""}">
        <div>
          <p class="eyebrow">${esc(item.delivery_number)}</p>
          <h3>${esc(item.clients?.client_name || "利用者")}</h3>
          <p>${esc(dateTimeText(item.visits?.start_at))}</p>
          <p>${esc(item.visits?.address || item.clients?.address || "")}</p>
        </div>
        <div class="delivery-task-card__actions">
          <span class="status ${statusClass(item.status)}">${esc(labels[item.status] || item.status)}</span>
          <button class="button button--secondary button--small open-delivery" type="button" data-id="${esc(item.id)}">作業を開く</button>
        </div>
      </article>
    `).join("");
  }

  async function loadDeliveries() {
    const form = q("#delivery-filter-form");
    const data = formObject(form);
    const params = new URLSearchParams();
    if (data.date_from) {
      params.set("date_from", data.date_from);
      params.set("date_to", data.date_from);
    }
    if (data.status) params.set("status", data.status);
    showError(q("#delivery-list-error"), "");
    q("#delivery-list").innerHTML = '<p class="help">読み込み中…</p>';
    try {
      const result = await api.request(`/admin/deliveries?${params.toString()}`);
      state.deliveries = result.deliveries || [];
      renderList();
    } catch (error) {
      showError(q("#delivery-list-error"), error);
    }
  }

  function installationFor(item) {
    return (state.detail?.installations || []).find(
      (installation) => installation.asset_id === item.asset_id
    );
  }

  function renderDetail() {
    const data = state.detail;
    if (!data) return;
    const delivery = data.delivery;
    q("#delivery-work-section").hidden = false;
    q("#delivery-detail-title").textContent =
      `${delivery.delivery_number}｜${data.client.client_name} 様`;
    q("#delivery-detail-summary").innerHTML = `
      <div><span>状態</span><strong><span class="status ${statusClass(delivery.status)}">${esc(labels[delivery.status] || delivery.status)}</span></strong></div>
      <div><span>予定</span><strong>${esc(dateTimeText(data.visit?.start_at))}</strong></div>
      <div><span>住所</span><strong>${esc(data.visit?.address || data.client.address || "")}</strong></div>
      <div><span>電話</span><strong>${esc(data.client.phone || "")}</strong></div>
      <div><span>担当</span><strong>${esc((data.assignments || []).map((item) => item.staff?.staff_name).filter(Boolean).join("・") || "未割当")}</strong></div>
      <div><span>契約</span><strong>${esc(data.contract?.contract_number || "")}</strong></div>
    `;
    renderStatusActions();
    renderItems();
    renderInstallations();
    updateCompleteButton();
    renderList();
  }

  function renderStatusActions() {
    const status = state.detail.delivery.status;
    const target = q("#delivery-status-actions");
    target.hidden = false;
    const actions = {
      planned: [["loading","積込開始"]],
      loading: [["in_transit","出発"]],
      in_transit: [["arrived","到着"]],
      arrived: [],
      completed: [],
    }[status] || [];

    target.innerHTML = actions.map(([next, label]) =>
      `<button class="button button--primary change-delivery-status" type="button" data-status="${next}">${esc(label)}</button>`
    ).join("") + (
      ["planned","loading"].includes(status)
        ? '<button class="button button--outline change-delivery-status" type="button" data-status="cancelled">予定取消</button>'
        : ""
    );
  }

  function renderItems() {
    const target = q("#delivery-item-list");
    const editable = ["planned","loading"].includes(state.detail.delivery.status);
    target.innerHTML = (state.detail.items || []).map((item) => {
      const product = item.product_models || {};
      const asset = item.rental_assets || {};
      return `
        <article class="delivery-item-row ${item.loaded_at ? "is-loaded" : ""}">
          <div>
            <p class="eyebrow">${esc(item.item_kind)}｜数量 ${esc(item.quantity)}</p>
            <h3>${esc(product.product_name || "商品")}</h3>
            <p>${item.asset_id ? `管理番号：${esc(asset.asset_number || "")}｜シリアル：${esc(asset.serial_number || "")}` : "販売商品"}</p>
          </div>
          <button class="button ${item.loaded_at ? "button--outline" : "button--secondary"} button--small toggle-load"
            type="button" data-id="${esc(item.id)}" data-loaded="${item.loaded_at ? "true" : "false"}"
            ${editable ? "" : "disabled"}>${item.loaded_at ? "積込済み" : "積込確認"}</button>
        </article>
      `;
    }).join("");
  }

  function renderInstallations() {
    const target = q("#installation-list");
    const arrived = state.detail.delivery.status === "arrived";
    const rentalItems = (state.detail.items || []).filter(
      (item) => item.item_kind === "rental"
    );
    if (!rentalItems.length) {
      target.innerHTML = '<div class="notice notice--info">販売商品のみの納品です。設置確認はありません。</div>';
      return;
    }

    target.innerHTML = rentalItems.map((item) => {
      const product = item.product_models || {};
      const asset = item.rental_assets || {};
      const existing = installationFor(item);
      const checked = (key) => existing?.[key] ? "checked" : "";
      return `
        <form class="installation-form" data-item-id="${esc(item.id)}">
          <div class="installation-form__head">
            <div><p class="eyebrow">${esc(asset.asset_number || "")}</p><h3>${esc(product.product_name || "貸与用具")}</h3></div>
            <span class="status ${existing ? "status--success" : "status--warning"}">${existing ? "記録済み" : "未確認"}</span>
          </div>
          <div class="field"><label>設置場所</label><input name="location_note" value="${esc(existing?.location_note || "")}" ${arrived ? "" : "disabled"}></div>
          <div class="installation-check-grid">
            <label><input type="checkbox" name="fit_confirmed" ${checked("fit_confirmed")} ${arrived ? "" : "disabled"}> 身体適合</label>
            <label><input type="checkbox" name="stability_confirmed" ${checked("stability_confirmed")} ${arrived ? "" : "disabled"}> 安定性</label>
            <label><input type="checkbox" name="usage_explained" ${checked("usage_explained")} ${arrived ? "" : "disabled"}> 使用方法説明</label>
            <label><input type="checkbox" name="safety_explained" ${checked("safety_explained")} ${arrived ? "" : "disabled"}> 安全説明</label>
            <label><input type="checkbox" name="manual_delivered" ${checked("manual_delivered")} ${arrived ? "" : "disabled"}> 説明書交付</label>
            <label><input type="checkbox" name="height_adjusted" ${checked("height_adjusted")} ${arrived ? "" : "disabled"}> 高さ調整</label>
            <label><input type="checkbox" name="brakes_confirmed" ${checked("brakes_confirmed")} ${arrived ? "" : "disabled"}> ブレーキ確認</label>
            <label><input type="checkbox" name="accessories_confirmed" ${checked("accessories_confirmed")} ${arrived ? "" : "disabled"}> 付属品確認</label>
          </div>
          <div class="field"><label>確認者氏名</label><input name="confirmed_by_name" value="${esc(existing?.confirmed_by_name || "")}" ${arrived ? "" : "disabled"}></div>
          <div class="field"><label>設置メモ</label><textarea name="completion_note" ${arrived ? "" : "disabled"}>${esc(existing?.completion_note || "")}</textarea></div>
          <div class="field"><label>設置担当</label><select name="installed_by" data-install-staff required ${arrived ? "" : "disabled"}><option value="">選択してください</option>${state.staff.map((staff) => `<option value="${esc(staff.id)}" ${existing?.installed_by === staff.id ? "selected" : ""}>${esc(staff.staff_name)}</option>`).join("")}</select></div>
          <button class="button button--secondary save-installation" type="submit" ${arrived ? "" : "disabled"}>設置確認を保存</button>
        </form>
      `;
    }).join("");
  }

  function updateCompleteButton() {
    const button = q('#delivery-complete-form button[type="submit"]');
    if (!button) return;
    button.disabled = state.detail?.delivery?.status !== "arrived";
  }

  async function loadDelivery(id) {
    showError(q("#delivery-detail-error"), "");
    try {
      state.detail = await api.request(`/admin/deliveries/${id}`);
      renderDetail();
      q("#delivery-detail-card").scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) {
      showError(q("#delivery-detail-error"), error);
    }
  }

  async function changeStatus(status, button) {
    setLoading(button, true);
    try {
      await api.request(`/admin/deliveries/${state.detail.delivery.id}/status`, {
        method: "PATCH",
        body: { status },
      });
      window.DPRO?.toast("納品状態を更新しました。");
      await Promise.all([
        loadDelivery(state.detail.delivery.id),
        loadDeliveries(),
      ]);
    } catch (error) {
      window.DPRO?.toast(error.message);
    } finally {
      setLoading(button, false);
    }
  }

  function setupEvents() {
    q("#delivery-filter-form")?.addEventListener("submit", (event) => {
      event.preventDefault();
      loadDeliveries();
    });
    q("#reload-deliveries")?.addEventListener("click", loadDeliveries);

    q("#delivery-list")?.addEventListener("click", (event) => {
      const button = event.target.closest(".open-delivery");
      if (button) loadDelivery(button.dataset.id);
    });

    q("#delivery-status-actions")?.addEventListener("click", (event) => {
      const button = event.target.closest(".change-delivery-status");
      if (!button) return;
      if (button.dataset.status === "cancelled" && !confirm("この納品予定を取り消しますか？")) return;
      changeStatus(button.dataset.status, button);
    });

    q("#delivery-item-list")?.addEventListener("click", async (event) => {
      const button = event.target.closest(".toggle-load");
      if (!button) return;
      setLoading(button, true);
      try {
        await api.request(`/admin/delivery-items/${button.dataset.id}/load`, {
          method: "PATCH",
          body: {
            loaded: button.dataset.loaded !== "true",
            staff_id: q('[data-delivery-work-staff]')?.value || null,
          },
        });
        await loadDelivery(state.detail.delivery.id);
      } catch (error) {
        window.DPRO?.toast(error.message);
      } finally {
        setLoading(button, false);
      }
    });

    q("#installation-list")?.addEventListener("submit", async (event) => {
      const form = event.target.closest(".installation-form");
      if (!form) return;
      event.preventDefault();
      const button = q('button[type="submit"]', form);
      setLoading(button, true);
      try {
        await api.request(
          `/admin/delivery-items/${form.dataset.itemId}/installation`,
          { method: "POST", body: formObject(form) }
        );
        window.DPRO?.toast("設置確認を保存しました。");
        await loadDelivery(state.detail.delivery.id);
      } catch (error) {
        window.DPRO?.toast(error.message);
      } finally {
        setLoading(button, false);
      }
    });

    q("#delivery-complete-form")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const button = q('button[type="submit"]', form);
      setLoading(button, true);
      showError(q("#delivery-complete-error"), "");
      try {
        const data = await api.request(
          `/admin/deliveries/${state.detail.delivery.id}/complete`,
          { method: "POST", body: formObject(form) }
        );
        window.DPRO?.toast("納品を完了し、貸与を開始しました。");
        state.detail = data;
        renderDetail();
        await loadDeliveries();
      } catch (error) {
        showError(q("#delivery-complete-error"), error);
      } finally {
        setLoading(button, false);
      }
    });
  }

  async function initialize() {
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Tokyo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    q('[name="date_from"]', q("#delivery-filter-form")).value = today;
    await Promise.all([loadMaster(), loadDeliveries()]);
    const id = new URLSearchParams(location.search).get("id");
    if (id) await loadDelivery(id);
  }

  document.addEventListener("DOMContentLoaded", () => {
    if (!api) return;
    setupEvents();
    document.addEventListener("dpro-admin-ready", initialize, { once: true });
    if (
      sessionStorage.getItem("dpro_welfare_admin_ok") === "1" &&
      api.hasToken()
    ) initialize();
  });
})();
