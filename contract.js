(() => {
  "use strict";

  const api = window.DPRO_API;
  const cfg = window.DPRO_CONFIG;
  const q = (selector, root = document) => root.querySelector(selector);
  const qa = (selector, root = document) => [...root.querySelectorAll(selector)];

  const state = {
    client: null,
    plans: [],
    selectedPlan: null,
    contract: null,
    staff: [],
    vehicles: [],
  };

  const statusLabel = {
    draft: "下書き",
    active: "有効",
    suspended: "停止中",
    ended: "終了",
    cancelled: "取消",
    pending: "同意待ち",
    signed: "署名済み",
    planned: "予定",
    loading: "積込中",
    in_transit: "配送中",
    arrived: "到着",
    completed: "完了",
    failed: "未完了",
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
    if (["active","signed","completed"].includes(status)) return "status--success";
    if (["cancelled","failed","ended"].includes(status)) return "status--danger";
    if (["draft","pending","planned","loading","in_transit","arrived","suspended"].includes(status)) return "status--warning";
    return "status--info";
  }

  function fillSelects() {
    qa("[data-contract-staff]").forEach((select) => {
      const current = select.value;
      select.innerHTML = '<option value="">選択してください</option>' +
        state.staff.map((item) =>
          `<option value="${esc(item.id)}">${esc(item.staff_name)}（${esc(item.role)}）</option>`
        ).join("");
      select.value = current;
    });

    qa("[data-delivery-staff]").forEach((select) => {
      const current = select.value;
      const deliveryStaff = state.staff.filter((item) =>
        ["delivery","owner","manager","specialist"].includes(item.role)
      );
      select.innerHTML = '<option value="">選択してください</option>' +
        deliveryStaff.map((item) =>
          `<option value="${esc(item.id)}">${esc(item.staff_name)}（${esc(item.role)}）</option>`
        ).join("");
      select.value = current;
    });

    qa("[data-contract-vehicle]").forEach((select) => {
      const current = select.value;
      select.innerHTML = '<option value="">未選択</option>' +
        state.vehicles.map((item) =>
          `<option value="${esc(item.id)}">${esc(item.vehicle_name)}${item.plate_number ? `｜${esc(item.plate_number)}` : ""}</option>`
        ).join("");
      select.value = current;
    });
  }

  async function loadMaster() {
    const [staffData, vehicleData] = await Promise.all([
      api.request("/admin/staff"),
      api.request("/admin/vehicles"),
    ]);
    state.staff = staffData.staff || [];
    state.vehicles = vehicleData.vehicles || [];
    fillSelects();
  }

  function renderClientCandidates(candidates) {
    const target = q("#contract-client-results");
    if (!target) return;
    if (!candidates?.length) {
      target.innerHTML = '<div class="notice notice--info">一致する利用者は見つかりませんでした。</div>';
      return;
    }
    target.innerHTML = candidates.map((client) => `
      <article class="result-card">
        <div>
          <p class="eyebrow">${esc(client.client_number)}</p>
          <h3>${esc(client.client_name)}</h3>
          <p>${esc(client.birth_date || "生年月日未登録")}｜${esc(client.phone || "電話未登録")}</p>
          <p>${esc(client.address || "住所未登録")}</p>
        </div>
        <button class="button button--secondary button--small select-contract-client"
          type="button" data-client='${esc(JSON.stringify(client))}'>この利用者を選択</button>
      </article>
    `).join("");
  }

  async function selectClient(client) {
    state.client = client;
    const badge = q("#contract-client-badge");
    badge.textContent = `${client.client_number} ${client.client_name}`;
    badge.classList.add("is-selected");
    await loadPlans();
  }

  async function loadPlans() {
    const target = q("#contract-plan-list");
    if (!state.client) return;
    target.innerHTML = '<p class="help">有効計画を読み込み中…</p>';
    try {
      const data = await api.request(
        `/admin/plans?status=active&client_id=${encodeURIComponent(state.client.client_id)}`
      );
      state.plans = data.plans || [];
      if (!state.plans.length) {
        target.innerHTML = '<div class="notice notice--warning">有効中のサービス計画がありません。先にアセスメント・計画画面で計画を有効化してください。</div>';
        return;
      }
      target.innerHTML = state.plans.map((plan) => `
        <article class="contract-plan-card ${state.selectedPlan?.id === plan.id ? "is-selected" : ""}">
          <div>
            <p class="eyebrow">${esc(plan.plan_number)}｜第${esc(plan.revision)}版</p>
            <h3>${esc(plan.goals || "福祉用具サービス計画")}</h3>
            <p>計画日：${esc(dateText(plan.plan_date))}｜利用開始：${esc(dateText(plan.service_start_date))}</p>
          </div>
          <button class="button button--primary button--small select-contract-plan"
            type="button" data-plan='${esc(JSON.stringify(plan))}'>この計画から契約</button>
        </article>
      `).join("");
    } catch (error) {
      target.innerHTML = `<p class="error-text">${esc(error.message)}</p>`;
    }
  }

  function selectPlan(plan) {
    state.selectedPlan = plan;
    q("#contract-create-section").hidden = false;
    q("#selected-plan-label").value =
      `${plan.plan_number} 第${plan.revision}版`;
    const startInput = q('[name="start_date"]', q("#contract-create-form"));
    if (startInput && !startInput.value) {
      startInput.value = plan.service_start_date || new Date().toISOString().slice(0, 10);
    }
    updateProgress();
    loadPlans();
    q("#contract-create-section").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function updateProgress() {
    const complete = {
      plan: Boolean(state.selectedPlan || state.contract?.plan),
      contract: Boolean(state.contract?.contract),
      consent: state.contract?.contract?.consent_status === "signed",
      assignment: false,
      delivery: Boolean(state.contract?.deliveries?.length),
    };
    if (state.contract?.items?.length) {
      const rentalItems = state.contract.items.filter((item) => item.service_type === "rental");
      complete.assignment = rentalItems.every((item) => {
        const count = (state.contract.rental_periods || []).filter(
          (period) =>
            period.contract_item_id === item.id &&
            ["reserved","active"].includes(period.status)
        ).length;
        return count >= item.quantity;
      });
    }
    qa("[data-contract-step]").forEach((node) => {
      const key = node.dataset.contractStep;
      node.classList.toggle("is-complete", Boolean(complete[key]));
    });
  }

  function renderSummary() {
    const data = state.contract;
    const target = q("#contract-summary");
    if (!data?.contract || !target) return;
    const c = data.contract;
    target.innerHTML = `
      <div><span>契約番号</span><strong>${esc(c.contract_number)}</strong></div>
      <div><span>利用者</span><strong>${esc(data.client.client_name)}</strong></div>
      <div><span>契約区分</span><strong>${esc(c.contract_type)}</strong></div>
      <div><span>契約状態</span><strong><span class="status ${statusClass(c.status)}">${esc(statusLabel[c.status] || c.status)}</span></strong></div>
      <div><span>契約期間</span><strong>${esc(dateText(c.start_date))}～${esc(dateText(c.end_date))}</strong></div>
      <div><span>同意</span><strong><span class="status ${statusClass(c.consent_status)}">${esc(statusLabel[c.consent_status] || c.consent_status)}</span></strong></div>
    `;
    q("#contract-detail-title").textContent =
      `${c.contract_number}｜${data.client.client_name} 様`;
  }

  async function loadAvailableAssets(itemId, productModelId) {
    const select = q(`[data-asset-select="${itemId}"]`);
    if (!select) return;
    select.innerHTML = '<option value="">読み込み中…</option>';
    try {
      const data = await api.request(
        `/admin/contract-assets/available?product_model_id=${encodeURIComponent(productModelId)}`
      );
      select.innerHTML = '<option value="">貸出可能個体を選択</option>' +
        (data.assets || []).map((asset) =>
          `<option value="${esc(asset.id)}">${esc(asset.asset_number)}｜${esc(asset.current_location || "保管場所未設定")}｜点検期限 ${esc(dateText(asset.inspection_due_date))}</option>`
        ).join("");
    } catch (error) {
      select.innerHTML = `<option value="">${esc(error.message)}</option>`;
    }
  }

  function renderItems() {
    const data = state.contract;
    const target = q("#contract-item-list");
    if (!target || !data) return;
    const periods = data.rental_periods || [];
    target.innerHTML = (data.items || []).map((item) => {
      const product = item.product_models || {};
      const assigned = periods.filter(
        (period) =>
          period.contract_item_id === item.id &&
          ["reserved","active"].includes(period.status)
      );
      const remaining = Math.max(item.quantity - assigned.length, 0);
      return `
        <article class="contract-item-card">
          <div class="contract-item-card__head">
            <div>
              <p class="eyebrow">${esc(item.service_type)}｜数量 ${esc(item.quantity)}</p>
              <h3>${esc(item.item_name_snapshot || product.product_name || "商品")}</h3>
              <p>${esc(product.manufacturer || "")} ${esc(product.model_number || "")}</p>
            </div>
            <strong>${esc(yen(item.unit_price))}</strong>
          </div>
          ${item.service_type === "rental" ? `
            <div class="assigned-assets">
              <h4>用具個体割当 ${assigned.length}/${item.quantity}</h4>
              ${assigned.length ? assigned.map((period) => `
                <div class="assigned-asset-row">
                  <span>${esc(period.rental_assets?.asset_number || "個体")}｜${esc(statusLabel[period.status] || period.status)}</span>
                  ${period.status === "reserved" && !(data.deliveries || []).length
                    ? `<button type="button" class="button button--outline button--small unassign-asset" data-period-id="${esc(period.id)}">割当解除</button>`
                    : ""}
                </div>
              `).join("") : '<p class="help">まだ割り当てられていません。</p>'}
            </div>
            ${data.contract.status === "active" && remaining > 0 ? `
              <div class="asset-assignment-form">
                <select data-asset-select="${esc(item.id)}"><option value="">貸出可能個体を読み込みます</option></select>
                <button type="button" class="button button--secondary button--small assign-asset"
                  data-item-id="${esc(item.id)}" data-product-id="${esc(item.product_model_id)}">個体を割り当て</button>
              </div>
            ` : ""}
          ` : `
            <div class="notice notice--info">販売商品は納品完了時に販売在庫から自動出庫します。</div>
          `}
          <p class="help">${esc(item.note || "")}</p>
        </article>
      `;
    }).join("");

    (data.items || [])
      .filter((item) => item.service_type === "rental")
      .forEach((item) => loadAvailableAssets(item.id, item.product_model_id));
  }

  function renderConsent() {
    const data = state.contract;
    const form = q("#contract-consent-form");
    const complete = q("#contract-consent-complete");
    if (!data?.contract || !form || !complete) return;
    const signed = data.contract.consent_status === "signed";
    form.hidden = signed;
    complete.hidden = !signed;
    if (signed) {
      complete.innerHTML = `
        <strong>契約説明・同意は完了しています。</strong><br>
        署名者：${esc(data.consent?.signer_name || data.contract.signed_by_name || "")}<br>
        同意日時：${esc(dateTimeText(data.consent?.signed_at || data.contract.signed_at))}
      `;
    }
  }

  function renderDeliveries() {
    const target = q("#contract-delivery-list");
    if (!target || !state.contract) return;
    const deliveries = state.contract.deliveries || [];
    if (!deliveries.length) {
      target.innerHTML = '<div class="notice notice--info">納品予定はまだありません。</div>';
      return;
    }
    target.innerHTML = deliveries.map((item) => `
      <article class="delivery-overview-row">
        <div><strong>${esc(item.delivery_number)}</strong><span>${esc(dateTimeText(item.created_at))}</span></div>
        <span class="status ${statusClass(item.status)}">${esc(statusLabel[item.status] || item.status)}</span>
      </article>
    `).join("");
  }

  function updateDeliveryForm() {
    const form = q("#contract-delivery-form");
    if (!form || !state.contract) return;
    const c = state.contract.contract;
    const rentalItems = state.contract.items.filter((item) => item.service_type === "rental");
    const allAssigned = rentalItems.every((item) => {
      const count = state.contract.rental_periods.filter(
        (period) =>
          period.contract_item_id === item.id &&
          ["reserved","active"].includes(period.status)
      ).length;
      return count >= item.quantity;
    });
    const hasOpen = state.contract.deliveries.some((item) =>
      ["planned","loading","in_transit","arrived"].includes(item.status)
    );
    const button = q('button[type="submit"]', form);
    button.disabled = c.status !== "active" || !allAssigned || hasOpen;
    q('[name="address"]', form).value =
      q('[name="address"]', form).value || state.contract.client.address || "";
  }

  async function setContractData(data) {
    state.contract = data;
    state.selectedPlan = data.plan || state.selectedPlan;
    q("#contract-detail-section").hidden = false;
    renderSummary();
    renderItems();
    renderConsent();
    renderDeliveries();
    updateDeliveryForm();
    updateProgress();
    q("#contract-detail-section").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function loadContract(contractId) {
    showError(q("#contract-detail-error"), "");
    try {
      const data = await api.request(`/admin/contracts/${contractId}`);
      await setContractData(data);
    } catch (error) {
      showError(q("#contract-detail-error"), error);
    }
  }

  async function loadRecentContracts() {
    const target = q("#recent-contract-list");
    target.innerHTML = '<p class="help">読み込み中…</p>';
    try {
      const data = await api.request("/admin/contracts?limit=50");
      const contracts = data.contracts || [];
      if (!contracts.length) {
        target.innerHTML = '<div class="notice notice--info">契約はまだありません。</div>';
        return;
      }
      target.innerHTML = contracts.map((item) => `
        <article class="contract-overview-row">
          <div>
            <p class="eyebrow">${esc(item.contract_number)}</p>
            <h3>${esc(item.clients?.client_name || "利用者")}</h3>
            <p>${esc(dateText(item.start_date))}～${esc(dateText(item.end_date))}｜${esc(item.contract_type)}</p>
          </div>
          <div class="contract-overview-row__actions">
            <span class="status ${statusClass(item.status)}">${esc(statusLabel[item.status] || item.status)}</span>
            <button type="button" class="button button--secondary button--small open-contract" data-contract-id="${esc(item.id)}">開く</button>
          </div>
        </article>
      `).join("");
    } catch (error) {
      target.innerHTML = `<p class="error-text">${esc(error.message)}</p>`;
    }
  }

  function setupEvents() {
    q("#contract-client-search")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const button = q('button[type="submit"]', form);
      setLoading(button, true);
      showError(q("#contract-client-error"), "");
      try {
        const data = await api.request("/clients/search", {
          method: "POST",
          body: formObject(form),
        });
        renderClientCandidates(data.candidates || []);
      } catch (error) {
        showError(q("#contract-client-error"), error);
      } finally {
        setLoading(button, false);
      }
    });

    q("#contract-client-results")?.addEventListener("click", (event) => {
      const button = event.target.closest(".select-contract-client");
      if (!button) return;
      selectClient(JSON.parse(button.dataset.client));
    });

    q("#contract-plan-list")?.addEventListener("click", (event) => {
      const button = event.target.closest(".select-contract-plan");
      if (!button) return;
      selectPlan(JSON.parse(button.dataset.plan));
    });

    q("#contract-create-form")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!state.selectedPlan) return;
      const form = event.currentTarget;
      const button = q('button[type="submit"]', form);
      setLoading(button, true);
      showError(q("#contract-create-error"), "");
      try {
        const body = formObject(form);
        body.plan_id = state.selectedPlan.id;
        const data = await api.request("/admin/contracts/from-plan", {
          method: "POST",
          body,
        });
        window.DPRO?.toast("契約下書きを作成しました。");
        await setContractData(data);
        await loadRecentContracts();
      } catch (error) {
        showError(q("#contract-create-error"), error);
      } finally {
        setLoading(button, false);
      }
    });

    q("#contract-consent-form")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!state.contract?.contract) return;
      const form = event.currentTarget;
      const button = q('button[type="submit"]', form);
      setLoading(button, true);
      showError(q("#contract-consent-error"), "");
      try {
        const data = await api.request(
          `/admin/contracts/${state.contract.contract.id}/sign`,
          { method: "POST", body: formObject(form) }
        );
        window.DPRO?.toast("契約説明・同意を記録しました。");
        await setContractData(data);
        await loadRecentContracts();
      } catch (error) {
        showError(q("#contract-consent-error"), error);
      } finally {
        setLoading(button, false);
      }
    });

    q("#contract-item-list")?.addEventListener("click", async (event) => {
      const assign = event.target.closest(".assign-asset");
      if (assign) {
        const itemId = assign.dataset.itemId;
        const select = q(`[data-asset-select="${itemId}"]`);
        if (!select?.value) {
          window.DPRO?.toast("用具個体を選択してください。");
          return;
        }
        setLoading(assign, true);
        try {
          const data = await api.request(
            `/admin/contract-items/${itemId}/assign-asset`,
            {
              method: "POST",
              body: {
                asset_id: select.value,
                start_date: state.contract.contract.start_date,
                end_date: state.contract.contract.end_date,
              },
            }
          );
          window.DPRO?.toast("用具個体を予約割当しました。");
          await setContractData(data);
        } catch (error) {
          window.DPRO?.toast(error.message);
        } finally {
          setLoading(assign, false);
        }
      }

      const unassign = event.target.closest(".unassign-asset");
      if (unassign) {
        if (!confirm("この用具個体の予約割当を解除しますか？")) return;
        setLoading(unassign, true);
        try {
          const data = await api.request(
            `/admin/rental-periods/${unassign.dataset.periodId}/unassign`,
            { method: "POST", body: { reason: "納品前の割当変更" } }
          );
          window.DPRO?.toast("用具個体の割当を解除しました。");
          await setContractData(data);
        } catch (error) {
          window.DPRO?.toast(error.message);
        } finally {
          setLoading(unassign, false);
        }
      }
    });

    q("#contract-delivery-form")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!state.contract?.contract) return;
      const form = event.currentTarget;
      const button = q('button[type="submit"]', form);
      setLoading(button, true);
      showError(q("#contract-delivery-error"), "");
      try {
        const body = formObject(form);
        const toJstIso = (value) =>
          value ? new Date(`${value}:00+09:00`).toISOString() : "";
        body.start_at = toJstIso(body.start_at);
        body.end_at = toJstIso(body.end_at);
        body.staff_ids = body.staff_id ? [body.staff_id] : [];
        delete body.staff_id;
        const data = await api.request(
          `/admin/contracts/${state.contract.contract.id}/deliveries`,
          { method: "POST", body }
        );
        window.DPRO?.toast("納品予定を作成しました。");
        await setContractData(data);
      } catch (error) {
        showError(q("#contract-delivery-error"), error);
      } finally {
        setLoading(button, false);
      }
    });

    q("#reload-contract")?.addEventListener("click", () => {
      if (state.contract?.contract?.id) loadContract(state.contract.contract.id);
    });
    q("#reload-contracts")?.addEventListener("click", loadRecentContracts);
    q("#recent-contract-list")?.addEventListener("click", (event) => {
      const button = event.target.closest(".open-contract");
      if (button) loadContract(button.dataset.contractId);
    });
    q("#print-contract")?.addEventListener("click", () => {
      if (!state.contract?.contract?.id) return;
      window.open(
        `contract-print.html?id=${encodeURIComponent(state.contract.contract.id)}`,
        "_blank",
        "noopener"
      );
    });
  }

  async function initialize() {
    try {
      await Promise.all([loadMaster(), loadRecentContracts()]);
      const contractId = new URLSearchParams(location.search).get("id");
      if (contractId) await loadContract(contractId);
    } catch (error) {
      showError(q("#contract-detail-error"), error);
    }
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
