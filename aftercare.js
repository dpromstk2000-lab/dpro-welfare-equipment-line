(() => {
  "use strict";

  const api = window.DPRO_API;
  const q = (selector, root = document) => root.querySelector(selector);
  const qa = (selector, root = document) => [...root.querySelectorAll(selector)];

  const state = {
    initialized: false,
    client: null,
    workspace: null,
    selectedTask: null,
    selectedRequest: null,
    staff: [],
    vehicles: [],
    processingAssets: [],
  };

  const taskLabels = {
    pending: "未予定",
    scheduled: "予定済み",
    overdue: "期限超過",
    completed: "完了",
    cancelled: "取消",
  };

  const requestLabels = {
    malfunction: "不具合",
    exchange: "交換",
    add: "追加",
    return: "返却",
    usage_question: "使用方法",
    other: "その他",
  };

  const statusLabels = {
    open: "未対応",
    assigned: "担当割当",
    in_progress: "対応中",
    resolved: "解決",
    closed: "終了",
    received: "受付",
    diagnosis: "診断中",
    parts_wait: "部品待ち",
    repairing: "修理中",
    completed: "完了",
    unrepairable: "修理不能",
    cancelled: "取消",
    planned: "予定",
    collected: "回収済み",
    returned_pending: "回収済み・消毒待ち",
    sanitizing: "消毒中",
    inspection: "点検中",
    repair: "修理中",
    available: "貸出可能",
    rented: "貸出中",
  };

  function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
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

  function dateText(value) {
    if (!value) return "未設定";
    const date = new Date(value.length === 10 ? `${value}T00:00:00+09:00` : value);
    return Number.isNaN(date.getTime())
      ? value
      : new Intl.DateTimeFormat("ja-JP", {
          dateStyle: "medium",
          ...(value.length === 10 ? {} : { timeStyle: "short" }),
        }).format(date);
  }

  function jstToday() {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Tokyo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  }

  function statusClass(value) {
    if (["completed", "resolved", "closed", "available", "collected"].includes(value)) return "status--success";
    if (["emergency", "unrepairable", "cancelled"].includes(value)) return "status--danger";
    if (["overdue", "high", "repair", "returned_pending", "sanitizing", "inspection", "in_progress", "scheduled", "planned"].includes(value)) return "status--warning";
    return "status--info";
  }

  function toIso(value) {
    return value ? new Date(value).toISOString() : "";
  }

  function toast(message) {
    window.DPRO?.toast(message);
  }

  function setupTabs() {
    qa("[data-aftercare-tab]").forEach((button) => {
      button.addEventListener("click", () => {
        const target = button.dataset.aftercareTab;
        qa("[data-aftercare-tab]").forEach((item) => item.classList.toggle("is-active", item === button));
        qa("[data-aftercare-panel]").forEach((panel) => {
          panel.hidden = panel.dataset.aftercarePanel !== target;
        });
      });
    });
  }

  async function loadSummary() {
    const data = await api.request("/admin/aftercare/summary");
    Object.entries(data.counts || {}).forEach(([key, value]) => {
      qa(`[data-aftercare-count="${key}"]`).forEach((node) => {
        node.textContent = String(value);
      });
    });
  }

  async function loadMaster() {
    const [staffData, vehicleData] = await Promise.all([
      api.request("/admin/staff"),
      api.request("/admin/vehicles"),
    ]);
    state.staff = staffData.staff || [];
    state.vehicles = vehicleData.vehicles || [];
    fillMasterSelects();
  }

  function fillMasterSelects() {
    qa("[data-aftercare-staff]").forEach((select) => {
      const current = select.value;
      select.innerHTML = '<option value="">選択してください</option>' + state.staff.map((staff) =>
        `<option value="${esc(staff.id)}">${esc(staff.staff_name)}（${esc(staff.role)}）</option>`
      ).join("");
      select.value = current;
    });

    qa("[data-aftercare-vehicle]").forEach((select) => {
      const current = select.value;
      select.innerHTML = '<option value="">未選択</option>' + state.vehicles.map((vehicle) =>
        `<option value="${esc(vehicle.id)}">${esc(vehicle.vehicle_name)}${vehicle.plate_number ? `｜${esc(vehicle.plate_number)}` : ""}</option>`
      ).join("");
      select.value = current;
    });
  }

  function renderClientCandidates(candidates) {
    const target = q("#aftercare-client-results");
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
        <button class="button button--secondary button--small select-aftercare-client" type="button" data-client='${esc(JSON.stringify(client))}'>この利用者を選択</button>
      </article>
    `).join("");
  }

  async function selectClient(client) {
    state.client = client;
    state.selectedTask = null;
    state.selectedRequest = null;
    q("#aftercare-client-badge").textContent = `${client.client_number} ${client.client_name}`;
    q("#aftercare-client-badge").classList.add("is-selected");
    q("#aftercare-workspace").hidden = false;
    await loadWorkspace();
    q("#aftercare-workspace").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function loadWorkspace() {
    if (!state.client) return;
    const clientId = state.client.client_id || state.client.id;
    const data = await api.request(`/admin/aftercare/workspace?client_id=${encodeURIComponent(clientId)}`);
    state.workspace = data;
    state.client = { ...state.client, ...data.client, client_id: data.client.id };
    q("#aftercare-client-badge").textContent = `${data.client.client_number} ${data.client.client_name}`;
    renderWorkspace();
  }

  function activeRentals() {
    return (state.workspace?.rental_periods || []).filter((item) => item.status === "active");
  }

  function renderWorkspace() {
    fillPlanSelects();
    fillRentalSelects();
    renderMonitoringTasks();
    renderMonitoringHistory();
    renderServiceRequests();
    renderRepairList();
    renderExchangeList();
    renderReturnList();
    renderReturnChecks();
    renderSelectedTask();
    renderSelectedRequest();
  }

  function fillPlanSelects() {
    qa("[data-aftercare-plan]").forEach((select) => {
      const current = select.value;
      select.innerHTML = '<option value="">選択してください</option>' + (state.workspace?.plans || []).map((plan) =>
        `<option value="${esc(plan.id)}">${esc(plan.plan_number)} 第${esc(plan.revision)}版｜期限 ${esc(dateText(plan.monitoring_due_date))}</option>`
      ).join("");
      select.value = current;
    });
  }

  function rentalLabel(period) {
    const asset = period.rental_assets || {};
    const product = asset.product_models || {};
    return `${asset.asset_number || "個体"}｜${product.product_name || "福祉用具"}`;
  }

  function fillRentalSelects() {
    const rentals = activeRentals();
    qa("[data-active-rental]").forEach((select) => {
      const current = select.value;
      const first = select.closest("#service-request-form") ? '<option value="">用具指定なし</option>' : '<option value="">選択してください</option>';
      select.innerHTML = first + rentals.map((period) =>
        `<option value="${esc(period.id)}" data-asset-id="${esc(period.asset_id)}" data-product-id="${esc(period.rental_assets?.product_model_id || "")}">${esc(rentalLabel(period))}</option>`
      ).join("");
      select.value = current;
    });
  }

  function renderMonitoringTasks() {
    const target = q("#monitoring-task-list");
    const tasks = state.workspace?.monitoring_tasks || [];
    if (!tasks.length) {
      target.innerHTML = '<div class="notice notice--info">モニタリング期限タスクはありません。下のフォームから準備できます。</div>';
      return;
    }
    target.innerHTML = tasks.map((task) => `
      <article class="monitoring-task-row ${state.selectedTask?.id === task.id ? "is-selected" : ""}">
        <div>
          <p class="eyebrow">期限 ${esc(dateText(task.due_date))}</p>
          <h3>${esc(taskLabels[task.status] || task.status)}</h3>
          <p>${task.visits?.start_at ? `訪問：${esc(dateText(task.visits.start_at))}` : "訪問予定未設定"}｜担当：${esc(task.staff?.staff_name || "未割当")}</p>
          <p class="help">${esc(task.note || "")}</p>
        </div>
        <div class="monitoring-task-row__actions">
          <span class="status ${statusClass(task.status)}">${esc(taskLabels[task.status] || task.status)}</span>
          ${["pending", "scheduled", "overdue"].includes(task.status) ? `<button class="button button--secondary button--small select-monitoring-task" type="button" data-task='${esc(JSON.stringify(task))}'>選択</button>` : ""}
        </div>
      </article>
    `).join("");
  }

  function renderSelectedTask() {
    const task = state.selectedTask;
    const scheduleForm = q("#monitoring-schedule-form");
    const completeForm = q("#monitoring-complete-form");
    q("#selected-monitoring-task-label").textContent = task
      ? `期限 ${dateText(task.due_date)}｜${taskLabels[task.status] || task.status}`
      : "タスクを選択してください。";
    q("#monitoring-complete-label").textContent = task
      ? `対象期限：${dateText(task.due_date)}｜現在状態：${taskLabels[task.status] || task.status}`
      : "完了するタスクを選択してください。";
    scheduleForm.hidden = !task || task.status === "scheduled";
    completeForm.hidden = !task;
    if (task && scheduleForm) {
      q('[name="address"]', scheduleForm).value = state.client?.address || "";
    }
    renderMonitoringItems();
  }

  function renderMonitoringItems() {
    const target = q("#monitoring-item-list");
    if (!state.selectedTask) {
      target.innerHTML = "";
      return;
    }
    const rentals = activeRentals();
    if (!rentals.length) {
      target.innerHTML = '<div class="notice notice--warning">貸与中の用具がありません。</div>';
      return;
    }
    target.innerHTML = rentals.map((period) => `
      <article class="monitoring-item-card" data-period-id="${esc(period.id)}">
        <div class="monitoring-item-card__head"><div><p class="eyebrow">${esc(period.rental_assets?.asset_number || "")}</p><h3>${esc(period.rental_assets?.product_models?.product_name || "福祉用具")}</h3></div><span class="status status--info">貸与中</span></div>
        <div class="form-grid">
          <div class="field"><label>利用状況</label><input data-field="usage_status" placeholder="毎日使用・週数回など"></div>
          <div class="field"><label>適合状況</label><input data-field="fit_status" placeholder="適合・調整必要など"></div>
          <div class="field checkbox-field"><label><input type="checkbox" data-field="issue_found"> 問題あり</label></div>
          <div class="field checkbox-field"><label><input type="checkbox" data-field="adjustment_needed"> 調整が必要</label></div>
          <div class="field checkbox-field"><label><input type="checkbox" data-field="continued_use" checked> 継続使用可能</label></div>
          <div class="field field--full"><label>問題の詳細</label><textarea data-field="issue_detail"></textarea></div>
          <div class="field field--full"><label>対応・安全確保</label><textarea data-field="action"></textarea></div>
        </div>
      </article>
    `).join("");
  }

  function monitoringItemsPayload() {
    return qa("#monitoring-item-list [data-period-id]").map((card) => ({
      rental_period_id: card.dataset.periodId,
      usage_status: q('[data-field="usage_status"]', card)?.value || "",
      fit_status: q('[data-field="fit_status"]', card)?.value || "",
      issue_found: q('[data-field="issue_found"]', card)?.checked || false,
      adjustment_needed: q('[data-field="adjustment_needed"]', card)?.checked || false,
      continued_use: q('[data-field="continued_use"]', card)?.checked !== false,
      issue_detail: q('[data-field="issue_detail"]', card)?.value || "",
      action: q('[data-field="action"]', card)?.value || "",
    }));
  }

  function renderMonitoringHistory() {
    const target = q("#monitoring-history");
    const rows = state.workspace?.monitorings || [];
    if (!rows.length) {
      target.innerHTML = '<div class="notice notice--info">モニタリング履歴はありません。</div>';
      return;
    }
    target.innerHTML = rows.map((item) => `
      <article class="history-row">
        <div><strong>${esc(dateText(item.monitored_on))}｜${esc(item.monitoring_type)}</strong><span>${esc(item.staff?.staff_name || "担当未登録")}</span></div>
        <div><span class="status ${item.decision === "continue" ? "status--success" : "status--warning"}">${esc(item.decision)}</span><span>次回 ${esc(dateText(item.next_due_date))}</span></div>
        <p>${esc(item.note || item.goal_status || "")}</p>
      </article>
    `).join("");
  }

  function requestCard(item) {
    const asset = item.rental_assets || {};
    const product = asset.product_models || {};
    return `
      <article class="service-request-row ${state.selectedRequest?.id === item.id ? "is-selected" : ""}">
        <div>
          <div class="service-request-row__head"><strong>${esc(item.request_number)}</strong><span class="status ${statusClass(item.urgency)}">${esc(item.urgency)}</span><span class="status ${statusClass(item.status)}">${esc(statusLabels[item.status] || item.status)}</span></div>
          <h3>${esc(requestLabels[item.request_type] || item.request_type)}｜${esc(product.product_name || "用具指定なし")}</h3>
          <p>${esc(item.summary)}</p>
          <p class="help">${esc(asset.asset_number || "")}｜受付 ${esc(dateText(item.created_at))}｜担当 ${esc(item.assigned_staff?.staff_name || "未割当")}</p>
          ${item.injury_or_fall ? '<div class="notice notice--danger">転倒・けがあり：使用中止と安全確保を確認してください。</div>' : ""}
        </div>
        <button class="button button--secondary button--small select-service-request" type="button" data-request='${esc(JSON.stringify(item))}'>対応を選択</button>
      </article>`;
  }

  function renderServiceRequests() {
    const target = q("#service-request-list");
    const rows = state.workspace?.service_requests || [];
    if (!rows.length) {
      target.innerHTML = '<div class="notice notice--info">対応依頼はありません。</div>';
      return;
    }
    target.innerHTML = rows.map(requestCard).join("");
  }

  function renderSelectedRequest() {
    const request = state.selectedRequest;
    q("#selected-request-badge").textContent = request ? request.request_number : "未選択";
    q("#selected-request-badge").className = `status ${request ? "status--warning" : "status--info"}`;
    const repair = q("#repair-start-form");
    if (repair && request) {
      q('[name="issue_detail"]', repair).value = request.summary || "";
    }
    const exchange = q("#exchange-form");
    const returnForm = q("#return-form");
    if (exchange && request) q('[name="address"]', exchange).value = state.client?.address || "";
    if (returnForm && request) {
      q('[name="address"]', returnForm).value = state.client?.address || "";
      q('[name="requested_by_name"]', returnForm).value = request.reported_by_name || state.client?.client_name || "";
      q('[name="reason"]', returnForm).value = request.summary || "";
    }
  }

  function renderReturnChecks() {
    const target = q("#return-rental-checks");
    const rentals = activeRentals();
    if (!rentals.length) {
      target.innerHTML = '<div class="notice notice--info">貸与中用具はありません。</div>';
      return;
    }
    target.innerHTML = rentals.map((period) => `
      <label><input type="checkbox" value="${esc(period.id)}"> ${esc(rentalLabel(period))}</label>
    `).join("");
  }

  function renderRepairList() {
    const target = q("#repair-list");
    const rows = state.workspace?.repairs || [];
    if (!rows.length) {
      target.innerHTML = '<div class="notice notice--info">修理記録はありません。</div>';
      return;
    }
    target.innerHTML = rows.map((repair) => `
      <form class="repair-progress-card" data-repair-id="${esc(repair.id)}">
        <div class="split-heading"><div><p class="eyebrow">${esc(repair.repair_number)}</p><h3>${esc(repair.rental_assets?.product_models?.product_name || "福祉用具")}｜${esc(repair.rental_assets?.asset_number || "")}</h3></div><span class="status ${statusClass(repair.status)}">${esc(statusLabels[repair.status] || repair.status)}</span></div>
        ${["completed", "unrepairable", "cancelled"].includes(repair.status) ? `<p>${esc(repair.repair_detail || repair.final_result || "完了")}</p>` : `
        <div class="form-grid">
          <div class="field"><label>次の状態</label><select name="status">${repairStatusOptions(repair.status)}</select></div>
          <div class="field"><label>費用</label><input name="cost" type="number" min="0" value="${esc(repair.cost ?? "")}"></div>
          <div class="field field--full"><label>診断内容</label><textarea name="diagnosis_detail">${esc(repair.diagnosis_detail || "")}</textarea></div>
          <div class="field field--full"><label>修理内容</label><textarea name="repair_detail">${esc(repair.repair_detail || "")}</textarea></div>
          <div class="field"><label>担当</label><select name="staff_id" class="repair-staff-select">${staffOptionsHtml()}</select></div>
          <div class="field field--full"><button class="button button--outline button--small" type="submit">修理進捗を更新</button></div>
        </div>`}
      </form>
    `).join("");
  }

  function repairStatusOptions(current) {
    const map = {
      received: ["diagnosis", "repairing", "cancelled"],
      diagnosis: ["parts_wait", "repairing", "completed", "unrepairable", "cancelled"],
      parts_wait: ["repairing", "unrepairable", "cancelled"],
      repairing: ["completed", "unrepairable", "cancelled"],
    };
    return (map[current] || []).map((value) => `<option value="${value}">${statusLabels[value] || value}</option>`).join("");
  }

  function staffOptionsHtml() {
    return '<option value="">選択してください</option>' + state.staff.map((staff) => `<option value="${esc(staff.id)}">${esc(staff.staff_name)}</option>`).join("");
  }

  function renderExchangeList() {
    const target = q("#exchange-list");
    const rows = state.workspace?.exchanges || [];
    if (!rows.length) {
      target.innerHTML = '<div class="notice notice--info">交換予定はありません。</div>';
      return;
    }
    target.innerHTML = rows.map((item) => `
      <article class="exchange-card">
        <div class="split-heading"><div><p class="eyebrow">${esc(item.exchange_number)}</p><h3>${esc(item.old_asset?.asset_number || "旧用具")} → ${esc(item.new_asset?.asset_number || "新用具")}</h3></div><span class="status ${statusClass(item.status)}">${esc(statusLabels[item.status] || item.status)}</span></div>
        <p>${esc(item.reason)}</p><p class="help">予定：${esc(dateText(item.visits?.start_at))}</p>
        ${item.status === "planned" ? `
          <form class="exchange-complete-form form-grid" data-exchange-id="${esc(item.id)}">
            <div class="field field--full"><label>旧用具の状態</label><textarea name="old_condition_note" required></textarea></div>
            <div class="field field--full"><label>付属品確認</label><input name="accessories_note" required></div>
            <div class="field checkbox-field"><label><input type="checkbox" name="damage_found"> 破損あり</label></div>
            <div class="field"><label>利用者・家族確認者</label><input name="confirmed_by_name" required></div>
            <div class="field"><label>完了担当</label><select name="staff_id" required>${staffOptionsHtml()}</select></div>
            <div class="field field--full"><button class="button button--primary button--small" type="submit">交換を完了</button></div>
          </form>` : `<p>完了：${esc(dateText(item.completed_at))}</p>`}
      </article>
    `).join("");
  }

  function renderReturnList() {
    const target = q("#return-list");
    const rows = state.workspace?.returns || [];
    if (!rows.length) {
      target.innerHTML = '<div class="notice notice--info">回収予定はありません。</div>';
      return;
    }
    target.innerHTML = rows.map((item) => `
      <article class="return-card">
        <div class="split-heading"><div><p class="eyebrow">${esc(item.return_number)}</p><h3>${esc(item.return_type)}｜${esc(item.reason || "回収")}</h3></div><span class="status ${statusClass(item.status)}">${esc(statusLabels[item.status] || item.status)}</span></div>
        <p class="help">予定：${esc(dateText(item.visits?.start_at || item.scheduled_at))}</p>
        ${item.status === "scheduled" ? `
          <form class="return-complete-form" data-return-id="${esc(item.id)}">
            <div class="field"><label>回収確認者</label><input name="pickup_confirmed_by" required></div>
            <div class="return-item-complete-list">${(item.return_items || []).map((ri) => `
              <article data-return-item-id="${esc(ri.id)}">
                <h4>${esc(ri.rental_assets?.asset_number || "用具")}｜${esc(ri.rental_assets?.product_models?.product_name || "")}</h4>
                <div class="form-grid">
                  <div class="field field--full"><label>用具状態</label><textarea data-field="condition_note" required></textarea></div>
                  <div class="field field--full"><label>付属品確認</label><input data-field="accessory_check" required></div>
                  <div class="field checkbox-field"><label><input type="checkbox" data-field="accessories_complete"> 付属品すべてあり</label></div>
                  <div class="field checkbox-field"><label><input type="checkbox" data-field="damage_found"> 破損あり</label></div>
                  <div class="field checkbox-field"><label><input type="checkbox" data-field="contamination_found"> 汚染あり</label></div>
                  <div class="field"><label>回収後処理</label><select data-field="next_action"><option value="sanitize">消毒</option><option value="repair">修理</option><option value="inspect">点検</option><option value="retire">廃棄</option></select></div>
                </div>
              </article>`).join("")}</div>
            <div class="field"><label>完了担当</label><select name="staff_id" required>${staffOptionsHtml()}</select></div>
            <button class="button button--primary button--small" type="submit">回収を完了</button>
          </form>` : `<p>回収完了：${esc(dateText(item.completed_at))}｜確認者 ${esc(item.pickup_confirmed_by || "")}</p>`}
      </article>
    `).join("");
  }

  async function loadProcessingAssets() {
    const target = q("#processing-asset-list");
    target.innerHTML = '<p class="help">読み込み中…</p>';
    try {
      const data = await api.request("/admin/aftercare/processing-assets");
      state.processingAssets = data.assets || [];
      renderProcessingAssets();
    } catch (error) {
      target.innerHTML = `<p class="error-text">${esc(error.message)}</p>`;
    }
  }

  function renderProcessingAssets() {
    const target = q("#processing-asset-list");
    if (!state.processingAssets.length) {
      target.innerHTML = '<div class="notice notice--success">回収後の未処理用具はありません。</div>';
      return;
    }
    target.innerHTML = state.processingAssets.map((asset) => {
      const product = asset.product_models || {};
      let actions = "";
      if (asset.status === "returned_pending") {
        actions = `<button class="button button--primary button--small processing-action" data-action="start-sanitize" data-id="${esc(asset.id)}" type="button">消毒開始</button>`;
      } else if (asset.status === "sanitizing") {
        actions = `<button class="button button--primary button--small processing-action" data-action="sanitize-pass" data-id="${esc(asset.id)}" type="button">消毒合格</button><button class="button button--outline button--small processing-action" data-action="sanitize-fail" data-id="${esc(asset.id)}" type="button">不合格・修理</button>`;
      } else if (asset.status === "inspection") {
        actions = `<button class="button button--primary button--small processing-action" data-action="inspection-pass" data-id="${esc(asset.id)}" type="button">点検合格</button><button class="button button--outline button--small processing-action" data-action="inspection-fail" data-id="${esc(asset.id)}" type="button">不合格・修理</button>`;
      } else if (asset.status === "repair") {
        actions = '<span class="help">修理進捗から修理完了を登録してください。</span>';
      }
      return `
        <article class="processing-asset-row">
          <div><p class="eyebrow">${esc(asset.asset_number)}</p><h3>${esc(product.product_name || "福祉用具")}</h3><p>${esc(product.manufacturer || "")} ${esc(product.model_number || "")}｜${esc(asset.condition_note || "")}</p></div>
          <div class="processing-asset-row__actions"><span class="status ${statusClass(asset.status)}">${esc(statusLabels[asset.status] || asset.status)}</span>${actions}</div>
        </article>`;
    }).join("");
  }

  async function processingAction(action, assetId, button) {
    const staffId = state.staff[0]?.id || null;
    setLoading(button, true);
    try {
      if (action === "start-sanitize") {
        await api.request(`/admin/assets/${assetId}/sanitization/start`, { method: "POST", body: { method: "標準洗浄・消毒", staff_id: staffId } });
      } else if (action === "sanitize-pass" || action === "sanitize-fail") {
        await api.request(`/admin/assets/${assetId}/sanitization/complete`, { method: "POST", body: { result: action === "sanitize-pass" ? "passed" : "failed", note: "STEP 8 回収後処理", staff_id: staffId } });
      } else if (action === "inspection-pass" || action === "inspection-fail") {
        await api.request(`/admin/assets/${assetId}/inspection`, { method: "POST", body: { result: action === "inspection-pass" ? "passed" : "failed", detail: "STEP 8 定期点検", staff_id: staffId } });
      }
      toast("用具の処理状態を更新しました。");
      await Promise.all([loadProcessingAssets(), loadSummary(), state.client ? loadWorkspace() : Promise.resolve()]);
    } catch (error) {
      toast(error.message);
    } finally {
      setLoading(button, false);
    }
  }

  async function loadAftercareVisits() {
    const form = q("#aftercare-visit-filter");
    const date = q('[name="date_from"]', form)?.value || jstToday();
    const target = q("#aftercare-visit-list");
    target.innerHTML = '<p class="help">読み込み中…</p>';
    try {
      const data = await api.request(`/admin/aftercare/visits?date_from=${encodeURIComponent(date)}&date_to=${encodeURIComponent(date)}`);
      const visits = data.visits || [];
      if (!visits.length) {
        target.innerHTML = '<div class="notice notice--info">指定日の訪問予定はありません。</div>';
        return;
      }
      target.innerHTML = visits.map((visit) => `
        <article class="aftercare-visit-row">
          <div><strong>${esc(dateText(visit.start_at))}｜${esc(visit.clients?.client_name || "利用者")}</strong><span>${esc(visit.visit_type)}｜${esc(visit.address || visit.clients?.address || "")}</span></div>
          <div><span class="status ${statusClass(visit.status)}">${esc(visit.status)}</span><span>${esc((visit.visit_assignments || []).map((a) => a.staff?.staff_name).filter(Boolean).join("・") || "担当未割当")}</span></div>
        </article>
      `).join("");
    } catch (error) {
      target.innerHTML = `<p class="error-text">${esc(error.message)}</p>`;
    }
  }

  async function loadExchangeAssets(periodId) {
    const target = q("#exchange-new-asset");
    const period = activeRentals().find((item) => item.id === periodId);
    if (!period) {
      target.innerHTML = '<option value="">交換元を選択してください</option>';
      return;
    }
    target.innerHTML = '<option value="">読み込み中…</option>';
    try {
      const productId = period.rental_assets?.product_model_id;
      const data = await api.request(`/admin/contract-assets/available?product_model_id=${encodeURIComponent(productId)}`);
      target.innerHTML = '<option value="">交換先個体を選択</option>' + (data.assets || []).map((asset) => `<option value="${esc(asset.id)}">${esc(asset.asset_number)}｜${esc(asset.current_location || "保管場所未設定")}｜点検期限 ${esc(dateText(asset.inspection_due_date))}</option>`).join("");
    } catch (error) {
      target.innerHTML = `<option value="">${esc(error.message)}</option>`;
    }
  }

  function setupEvents() {
    q("#aftercare-client-search")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const button = q('button[type="submit"]', form);
      setLoading(button, true);
      showError(q("#aftercare-client-error"), "");
      try {
        const data = await api.request("/clients/search", { method: "POST", body: formObject(form) });
        renderClientCandidates(data.candidates || []);
      } catch (error) {
        showError(q("#aftercare-client-error"), error);
      } finally {
        setLoading(button, false);
      }
    });

    q("#aftercare-client-results")?.addEventListener("click", (event) => {
      const button = event.target.closest(".select-aftercare-client");
      if (button) selectClient(JSON.parse(button.dataset.client));
    });

    q("#reload-aftercare")?.addEventListener("click", () => state.client && loadWorkspace());

    q("#monitoring-task-form")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const button = q('button[type="submit"]', form);
      setLoading(button, true);
      showError(q("#monitoring-task-error"), "");
      try {
        await api.request("/admin/monitoring-tasks/ensure", { method: "POST", body: formObject(form) });
        toast("モニタリング期限タスクを準備しました。");
        await Promise.all([loadWorkspace(), loadSummary()]);
      } catch (error) {
        showError(q("#monitoring-task-error"), error);
      } finally {
        setLoading(button, false);
      }
    });

    q("#monitoring-task-list")?.addEventListener("click", (event) => {
      const button = event.target.closest(".select-monitoring-task");
      if (!button) return;
      state.selectedTask = JSON.parse(button.dataset.task);
      renderMonitoringTasks();
      renderSelectedTask();
      q("#monitoring-schedule-card")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });

    q("#monitoring-schedule-form")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!state.selectedTask) return;
      const form = event.currentTarget;
      const button = q('button[type="submit"]', form);
      setLoading(button, true);
      showError(q("#monitoring-schedule-error"), "");
      try {
        const body = formObject(form);
        body.start_at = toIso(body.start_at);
        body.end_at = toIso(body.end_at);
        body.staff_ids = body.staff_id ? [body.staff_id] : [];
        delete body.staff_id;
        await api.request(`/admin/monitoring-tasks/${state.selectedTask.id}/schedule`, { method: "POST", body });
        toast("モニタリング訪問を設定しました。");
        state.selectedTask = null;
        await Promise.all([loadWorkspace(), loadSummary(), loadAftercareVisits()]);
      } catch (error) {
        showError(q("#monitoring-schedule-error"), error);
      } finally {
        setLoading(button, false);
      }
    });

    q("#monitoring-complete-form")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!state.selectedTask) return;
      const form = event.currentTarget;
      const button = q('button[type="submit"]', form);
      setLoading(button, true);
      showError(q("#monitoring-complete-error"), "");
      try {
        const body = formObject(form);
        body.items = monitoringItemsPayload();
        const emergencyIssueMissingAction = body.monitoring_type === "emergency" && body.items.some((item) => item.issue_found && !item.action.trim());
        if (emergencyIssueMissingAction) throw new Error("緊急モニタリングで問題がある用具は、安全確保・初動対応を入力してください。");
        await api.request(`/admin/monitoring-tasks/${state.selectedTask.id}/complete`, { method: "POST", body });
        toast("モニタリングを完了しました。");
        state.selectedTask = null;
        form.reset();
        await Promise.all([loadWorkspace(), loadSummary(), loadAftercareVisits()]);
      } catch (error) {
        showError(q("#monitoring-complete-error"), error);
      } finally {
        setLoading(button, false);
      }
    });

    q("#service-request-form")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!state.client) return;
      const form = event.currentTarget;
      const button = q('button[type="submit"]', form);
      setLoading(button, true);
      showError(q("#service-request-error"), "");
      try {
        const body = formObject(form);
        const period = activeRentals().find((item) => item.id === body.rental_period_id);
        body.client_id = state.client.client_id;
        body.asset_id = period?.asset_id || null;
        body.occurred_at = body.occurred_at ? toIso(body.occurred_at) : null;
        body.due_at = body.due_at ? toIso(body.due_at) : null;
        await api.request("/admin/service-requests", { method: "POST", body });
        toast("対応依頼を登録しました。");
        form.reset();
        await Promise.all([loadWorkspace(), loadSummary()]);
      } catch (error) {
        showError(q("#service-request-error"), error);
      } finally {
        setLoading(button, false);
      }
    });

    q("#service-request-list")?.addEventListener("click", (event) => {
      const button = event.target.closest(".select-service-request");
      if (!button) return;
      state.selectedRequest = JSON.parse(button.dataset.request);
      renderServiceRequests();
      renderSelectedRequest();
      qa('[data-aftercare-tab]').find((item) => item.dataset.aftercareTab === "operations")?.click();
    });

    q("#repair-start-form")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!state.selectedRequest) return toast("先に対応依頼を選択してください。");
      const form = event.currentTarget;
      const button = q('button[type="submit"]', form);
      setLoading(button, true);
      showError(q("#repair-start-error"), "");
      try {
        await api.request(`/admin/service-requests/${state.selectedRequest.id}/repairs`, { method: "POST", body: formObject(form) });
        toast("修理記録を開始しました。");
        await Promise.all([loadWorkspace(), loadSummary(), loadProcessingAssets()]);
      } catch (error) {
        showError(q("#repair-start-error"), error);
      } finally {
        setLoading(button, false);
      }
    });

    q("#repair-list")?.addEventListener("submit", async (event) => {
      const form = event.target.closest(".repair-progress-card");
      if (!form) return;
      event.preventDefault();
      const button = q('button[type="submit"]', form);
      setLoading(button, true);
      try {
        await api.request(`/admin/repairs/${form.dataset.repairId}`, { method: "PATCH", body: formObject(form) });
        toast("修理進捗を更新しました。");
        await Promise.all([loadWorkspace(), loadSummary(), loadProcessingAssets()]);
      } catch (error) {
        toast(error.message);
      } finally {
        setLoading(button, false);
      }
    });

    q('[name="old_rental_period_id"]', q("#exchange-form"))?.addEventListener("change", (event) => loadExchangeAssets(event.target.value));

    q("#exchange-form")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!state.selectedRequest) return toast("先に対応依頼を選択してください。");
      const form = event.currentTarget;
      const button = q('button[type="submit"]', form);
      setLoading(button, true);
      showError(q("#exchange-error"), "");
      try {
        const body = formObject(form);
        body.start_at = toIso(body.start_at);
        body.end_at = toIso(body.end_at);
        body.staff_ids = body.staff_id ? [body.staff_id] : [];
        delete body.staff_id;
        await api.request(`/admin/service-requests/${state.selectedRequest.id}/exchanges`, { method: "POST", body });
        toast("代替交換予定を作成しました。");
        await Promise.all([loadWorkspace(), loadSummary(), loadAftercareVisits()]);
      } catch (error) {
        showError(q("#exchange-error"), error);
      } finally {
        setLoading(button, false);
      }
    });

    q("#exchange-list")?.addEventListener("submit", async (event) => {
      const form = event.target.closest(".exchange-complete-form");
      if (!form) return;
      event.preventDefault();
      const button = q('button[type="submit"]', form);
      setLoading(button, true);
      try {
        await api.request(`/admin/exchanges/${form.dataset.exchangeId}/complete`, { method: "POST", body: formObject(form) });
        toast("代替交換を完了しました。");
        await Promise.all([loadWorkspace(), loadSummary(), loadProcessingAssets(), loadAftercareVisits()]);
      } catch (error) {
        toast(error.message);
      } finally {
        setLoading(button, false);
      }
    });

    q("#return-form")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!state.selectedRequest) return toast("先に対応依頼を選択してください。");
      const form = event.currentTarget;
      const button = q('button[type="submit"]', form);
      setLoading(button, true);
      showError(q("#return-error"), "");
      try {
        const body = formObject(form);
        body.rental_period_ids = qa('#return-rental-checks input[type="checkbox"]:checked').map((input) => input.value);
        body.start_at = toIso(body.start_at);
        body.end_at = toIso(body.end_at);
        body.staff_ids = body.staff_id ? [body.staff_id] : [];
        delete body.staff_id;
        await api.request(`/admin/service-requests/${state.selectedRequest.id}/returns`, { method: "POST", body });
        toast("回収予定を作成しました。");
        await Promise.all([loadWorkspace(), loadSummary(), loadAftercareVisits()]);
      } catch (error) {
        showError(q("#return-error"), error);
      } finally {
        setLoading(button, false);
      }
    });

    q("#return-list")?.addEventListener("submit", async (event) => {
      const form = event.target.closest(".return-complete-form");
      if (!form) return;
      event.preventDefault();
      const button = q('button[type="submit"]', form);
      setLoading(button, true);
      try {
        const body = formObject(form);
        body.items = qa("[data-return-item-id]", form).map((card) => ({
          return_item_id: card.dataset.returnItemId,
          condition_note: q('[data-field="condition_note"]', card)?.value || "",
          accessory_check: q('[data-field="accessory_check"]', card)?.value || "",
          accessories_complete: q('[data-field="accessories_complete"]', card)?.checked || false,
          damage_found: q('[data-field="damage_found"]', card)?.checked || false,
          contamination_found: q('[data-field="contamination_found"]', card)?.checked || false,
          next_action: q('[data-field="next_action"]', card)?.value || "sanitize",
        }));
        await api.request(`/admin/returns/${form.dataset.returnId}/complete`, { method: "POST", body });
        toast("回収を完了しました。");
        await Promise.all([loadWorkspace(), loadSummary(), loadProcessingAssets(), loadAftercareVisits()]);
      } catch (error) {
        toast(error.message);
      } finally {
        setLoading(button, false);
      }
    });

    q("#processing-asset-list")?.addEventListener("click", (event) => {
      const button = event.target.closest(".processing-action");
      if (button) processingAction(button.dataset.action, button.dataset.id, button);
    });
    q("#reload-processing")?.addEventListener("click", loadProcessingAssets);

    q("#aftercare-visit-filter")?.addEventListener("submit", (event) => {
      event.preventDefault();
      loadAftercareVisits();
    });
    q("#reload-aftercare-visits")?.addEventListener("click", loadAftercareVisits);
  }

  async function initialize() {
    if (state.initialized) return;
    state.initialized = true;
    q('[name="date_from"]', q("#aftercare-visit-filter")).value = jstToday();
    try {
      await Promise.all([loadSummary(), loadMaster(), loadProcessingAssets(), loadAftercareVisits()]);
    } catch (error) {
      toast(error.message);
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    if (!api) return;
    setupTabs();
    setupEvents();
    document.addEventListener("dpro-admin-ready", initialize, { once: true });
    if (sessionStorage.getItem("dpro_welfare_admin_ok") === "1" && api.hasToken()) initialize();
  });
})();
