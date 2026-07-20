(() => {
  "use strict";

  const api = window.DPRO_API;
  const cfg = window.DPRO_CONFIG;
  const q = (selector, root = document) => root.querySelector(selector);
  const qa = (selector, root = document) => [...root.querySelectorAll(selector)];

  const weekdays = [
    ["mon", "月曜日"],
    ["tue", "火曜日"],
    ["wed", "水曜日"],
    ["thu", "木曜日"],
    ["fri", "金曜日"],
    ["sat", "土曜日"],
    ["sun", "日曜日"],
  ];

  const state = {
    summary: null,
    staff: [],
    permissionCatalog: [],
    rolePermissions: [],
    templates: [],
    queue: [],
    documents: null,
    auditLogs: [],
  };

  function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;",
      '"': "&quot;", "'": "&#039;",
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
    if (!value) return "－";
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? value
      : new Intl.DateTimeFormat("ja-JP", {
          dateStyle: "medium",
          timeStyle: "short",
          timeZone: "Asia/Tokyo",
        }).format(date);
  }

  function roleLabel(role) {
    return {
      owner: "管理者",
      manager: "管理責任者",
      specialist: "福祉用具専門相談員",
      delivery: "配送・設置",
      office: "事務",
      viewer: "閲覧",
    }[role] || role;
  }

  function statusClass(ok) {
    return ok ? "status--success" : "status--danger";
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(String(text || ""));
      window.DPRO?.toast("文面をコピーしました。");
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = String(text || "");
      document.body.append(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
      window.DPRO?.toast("文面をコピーしました。");
    }
  }

  function buildBusinessHoursGrid(hours = {}) {
    const target = q("#business-hours-grid");
    target.innerHTML = weekdays.map(([key, label]) => {
      const item = hours?.[key];
      const enabled = Array.isArray(item)
        ? true
        : Boolean(item?.enabled);
      const open = Array.isArray(item)
        ? item[0] || "09:00"
        : item?.open || "09:00";
      const close = Array.isArray(item)
        ? item[1] || "18:00"
        : item?.close || "18:00";
      return `
        <div class="business-hour-row">
          <label><input type="checkbox" name="business_${key}_enabled" ${enabled ? "checked" : ""}> ${esc(label)}</label>
          <input type="time" name="business_${key}_open" value="${esc(open)}" step="1800">
          <span>～</span>
          <input type="time" name="business_${key}_close" value="${esc(close)}" step="1800">
        </div>
      `;
    }).join("");
  }

  function renderLaunchCheck(check) {
    const title = q("#launch-ready-title");
    const message = q("#launch-ready-message");
    const badge = q("#launch-ready-badge");
    const critical = check?.critical || [];
    const warnings = check?.warnings || [];
    const counts = check?.counts || {};

    q("#launch-critical-count").textContent = String(check?.critical_count ?? "－");
    q("#launch-warning-count").textContent = String(check?.warning_count ?? "－");
    q("#launch-staff-count").textContent = String(counts.active_staff ?? "－");
    q("#launch-template-count").textContent = String(
      counts.notification_templates ?? "－"
    );

    if (check?.ok) {
      title.textContent = "営業開始できる状態です";
      message.textContent =
        warnings.length
          ? "重大な不足はありません。確認事項は運用方針に合わせて対応してください。"
          : "重大項目・確認事項ともにありません。";
      badge.textContent = "運用可能";
      badge.className = "status status--success";
    } else {
      title.textContent = "営業開始前に修正が必要です";
      message.textContent = "重大項目を修正して、もう一度最終チェックを実行してください。";
      badge.textContent = "要修正";
      badge.className = "status status--danger";
    }

    const target = q("#launch-check-list");
    const rows = [
      ...critical.map((item) => ({
        type: "critical",
        label: item.label,
        code: item.code,
      })),
      ...warnings.map((item) => ({
        type: "warning",
        label: item.label,
        code: item.code,
      })),
    ];

    if (!rows.length) {
      target.innerHTML =
        '<div class="notice notice--success">すべての最終運用項目が整っています。</div>';
      return;
    }

    target.innerHTML = rows.map((item) => `
      <article class="launch-check-row launch-check-row--${esc(item.type)}">
        <span class="status ${item.type === "critical" ? "status--danger" : "status--warning"}">
          ${item.type === "critical" ? "重大" : "確認"}
        </span>
        <div>
          <strong>${esc(item.label)}</strong>
          <small>${esc(item.code)}</small>
        </div>
      </article>
    `).join("");
  }

  function fillOfficeForm(data) {
    const office = data.office || {};
    const settings = data.settings || {};
    const form = q("#operations-office-form");

    for (const name of [
      "office_name","office_code","phone","fax","email",
      "registration_number","postal_code","address",
      "contact_person_name","line_official_account_name",
      "default_visit_minutes","timezone",
    ]) {
      const input = q(`[name="${name}"]`, form);
      if (input) input.value = office[name] ?? "";
    }

    buildBusinessHoursGrid(settings.business_hours || {});

    q('[name="closed_dates"]', form).value = Array.isArray(settings.closed_dates)
      ? settings.closed_dates.join("\n")
      : "";

    const notification = settings.notification_settings || {};
    for (const name of [
      "line_enabled","manual_copy_enabled",
      "visit_reminder_enabled","payment_reminder_enabled",
    ]) {
      const input = q(`[name="${name}"]`, form);
      if (input) input.checked = Boolean(notification[name]);
    }

    const documents = settings.document_settings || {};
    for (const name of [
      "show_office_number","show_staff_name","show_signature_box",
    ]) {
      const input = q(`[name="${name}"]`, form);
      if (input) input.checked = Boolean(documents[name]);
    }
  }

  async function loadSummary() {
    const data = await api.request("/admin/operations/summary");
    state.summary = data;
    renderLaunchCheck(data.launch_check || {});
    fillOfficeForm(data);
  }

  async function runLaunchCheck(button = q("#run-launch-check")) {
    setLoading(button, true);
    try {
      const data = await api.request("/admin/operations/launch-check", {
        method: "POST",
        body: { save_run: true },
      });
      renderLaunchCheck(data.launch_check || {});
      window.DPRO?.toast("最終運用チェックを保存しました。");
    } catch (error) {
      // The API may return a business-rule result as details.
      showError(q("#operations-office-error"), error);
      await loadSummary().catch(() => {});
    } finally {
      setLoading(button, false);
    }
  }

  function resetStaffForm() {
    const form = q("#operations-staff-form");
    form.reset();
    q('[name="staff_id"]', form).value = "";
    q('[name="display_order"]', form).value = "100";
    q('[name="is_active"]', form).checked = true;
    q('[name="can_receive_notifications"]', form).checked = true;
    q('[name="require_pin_change"]', form).checked = true;
    q("#staff-form-title").textContent = "スタッフを追加";
  }

  function fillStaffForm(staff) {
    const form = q("#operations-staff-form");
    for (const name of [
      "staff_id","staff_code","staff_name","role","job_title",
      "phone","email","license_number","display_order",
    ]) {
      const input = q(`[name="${name}"]`, form);
      if (input) input.value = staff[name] ?? "";
    }
    q('[name="pin"]', form).value = "";
    q('[name="is_active"]', form).checked = Boolean(staff.is_active);
    q('[name="can_receive_notifications"]', form).checked =
      Boolean(staff.can_receive_notifications);
    q('[name="require_pin_change"]', form).checked =
      Boolean(staff.access_account?.require_pin_change);
    q("#staff-form-title").textContent = `${staff.staff_name}を編集`;
    form.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function renderStaff() {
    const target = q("#operations-staff-list");
    if (!state.staff.length) {
      target.innerHTML = '<div class="notice notice--warning">スタッフが登録されていません。</div>';
      return;
    }

    target.innerHTML = state.staff.map((staff) => {
      const account = staff.access_account;
      const locked = account?.locked_until &&
        new Date(account.locked_until).getTime() > Date.now();
      return `
        <article class="operations-staff-card">
          <div class="operations-staff-card__head">
            <div>
              <p class="eyebrow">${esc(staff.staff_code)}｜${esc(staff.role)}</p>
              <h3>${esc(staff.staff_name)}</h3>
              <p>${esc(staff.job_title || roleLabel(staff.role))}</p>
            </div>
            <span class="status ${staff.is_active ? "status--success" : "status--danger"}">
              ${staff.is_active ? "有効" : "停止"}
            </span>
          </div>
          <div class="operations-staff-meta">
            <span>ログイン：${account?.login_enabled ? (locked ? "一時ロック" : "有効") : "未設定"}</span>
            <span>権限：${esc(staff.permissions?.length || 0)}件</span>
            <span>最終ログイン：${esc(dateTimeText(account?.last_login_at || staff.last_login_at))}</span>
          </div>
          <div class="button-row button-row--compact">
            <button class="button button--secondary button--small edit-operation-staff" type="button" data-id="${esc(staff.id)}">編集</button>
            <button class="button button--outline button--small reset-operation-pin" type="button" data-id="${esc(staff.id)}" data-name="${esc(staff.staff_name)}">PIN変更</button>
          </div>
        </article>
      `;
    }).join("");
  }

  async function loadStaff() {
    const data = await api.request("/admin/operations/staff");
    state.staff = data.staff || [];
    renderStaff();
  }

  function permissionsForRole(role) {
    return new Set(
      state.rolePermissions
        .filter((item) => item.role === role && item.is_allowed)
        .map((item) => item.permission_key)
    );
  }

  function renderPermissions() {
    const form = q("#role-permission-form");
    const role = q('[name="role"]', form).value;
    const allowed = permissionsForRole(role);
    const grouped = new Map();

    state.permissionCatalog.forEach((item) => {
      if (!grouped.has(item.category)) grouped.set(item.category, []);
      grouped.get(item.category).push(item);
    });

    q("#permission-catalog").innerHTML = [...grouped.entries()].map(
      ([category, items]) => `
        <fieldset class="permission-group">
          <legend>${esc(category)}</legend>
          ${items.map((item) => `
            <label class="permission-item">
              <input type="checkbox" name="permission_key" value="${esc(item.permission_key)}"
                ${allowed.has(item.permission_key) ? "checked" : ""}
                ${role === "owner" && item.permission_key === "staff.manage" ? "disabled" : ""}>
              <span><strong>${esc(item.permission_name)}</strong><small>${esc(item.description || item.permission_key)}</small></span>
            </label>
          `).join("")}
        </fieldset>
      `
    ).join("");
  }

  async function loadPermissions() {
    const data = await api.request("/admin/operations/permissions");
    state.permissionCatalog = data.catalog || [];
    state.rolePermissions = data.role_permissions || [];
    renderPermissions();
  }

  function renderTemplateList() {
    const target = q("#notification-template-list");
    target.innerHTML = state.templates.map((template) => `
      <form class="notification-template-card" data-template-id="${esc(template.id)}">
        <div class="notification-template-card__head">
          <div>
            <p class="eyebrow">${esc(template.template_key)}</p>
            <input name="template_name" value="${esc(template.template_name)}" aria-label="テンプレート名">
          </div>
          <label><input type="checkbox" name="enabled" ${template.enabled ? "checked" : ""}> 有効</label>
        </div>
        <textarea name="message_body">${esc(template.message_body)}</textarea>
        <div class="form-grid">
          <div class="field"><label>送信方法</label><select name="channel"><option value="line" ${template.channel === "line" ? "selected" : ""}>LINE</option><option value="manual_copy" ${template.channel === "manual_copy" ? "selected" : ""}>文面コピー</option><option value="email" ${template.channel === "email" ? "selected" : ""}>メール</option></select></div>
          <div class="field"><label>通知先</label><select name="target_type"><option value="client" ${template.target_type === "client" ? "selected" : ""}>利用者</option><option value="family" ${template.target_type === "family" ? "selected" : ""}>家族</option><option value="care_manager" ${template.target_type === "care_manager" ? "selected" : ""}>ケアマネ</option><option value="staff" ${template.target_type === "staff" ? "selected" : ""}>スタッフ</option><option value="other" ${template.target_type === "other" ? "selected" : ""}>その他</option></select></div>
        </div>
        <button class="button button--outline button--small" type="submit">文面を保存</button>
      </form>
    `).join("");

    const select = q('[name="template_key"]', q("#notification-preview-form"));
    const current = select.value;
    select.innerHTML = state.templates
      .filter((item) => item.enabled)
      .map((item) =>
        `<option value="${esc(item.template_key)}">${esc(item.template_name)}</option>`
      ).join("");
    if (current) select.value = current;
  }

  async function loadTemplates() {
    const data = await api.request("/admin/notifications/templates");
    state.templates = data.templates || [];
    renderTemplateList();
  }

  function renderQueue() {
    const target = q("#notification-queue-list");
    if (!state.queue.length) {
      target.innerHTML = '<div class="notice notice--info">通知キューはありません。</div>';
      return;
    }

    target.innerHTML = state.queue.map((item) => `
      <article class="notification-queue-row">
        <div>
          <p class="eyebrow">${esc(item.notification_templates?.template_name || item.event_type)}</p>
          <h3>${esc(item.target_name || "通知先未設定")}</h3>
          <p>${esc(item.rendered_body)}</p>
          ${item.last_error ? `<small class="error-text">${esc(item.last_error)}</small>` : ""}
        </div>
        <div class="notification-queue-actions">
          <span class="status ${item.status === "sent" ? "status--success" : item.status === "failed" ? "status--danger" : "status--warning"}">${esc(item.status)}</span>
          <button class="button button--outline button--small copy-notification" type="button" data-body="${esc(item.rendered_body)}">コピー</button>
          ${!["sent","cancelled"].includes(item.status)
            ? `<button class="button button--secondary button--small send-notification" type="button" data-id="${esc(item.id)}">送信処理</button>`
            : ""}
        </div>
      </article>
    `).join("");
  }

  async function loadQueue() {
    const data = await api.request("/admin/notifications/queue");
    state.queue = data.queue || [];
    renderQueue();
  }

  function renderDocumentList(targetSelector, items, type) {
    const target = q(targetSelector);
    if (!items?.length) {
      target.innerHTML = '<p class="help">対象データはありません。</p>';
      return;
    }
    target.innerHTML = items.slice(0, 10).map((item) => {
      let url = "#";
      let number = "";
      let client = item.clients?.client_name || "";
      if (type === "plan") {
        url = `plan-print.html?id=${encodeURIComponent(item.id)}`;
        number = `${item.plan_number} 第${item.revision}版`;
      } else if (type === "contract") {
        url = `contract-print.html?id=${encodeURIComponent(item.id)}`;
        number = item.contract_number;
      } else {
        url = `billing-print.html?id=${encodeURIComponent(item.id)}&type=invoice`;
        number = item.invoice_number;
      }
      return `
        <a class="document-record-link" href="${esc(url)}" target="_blank" rel="noopener">
          <strong>${esc(number)}</strong>
          <span>${esc(client)}｜${esc(item.status)}</span>
        </a>
      `;
    }).join("");
  }

  function renderDocuments() {
    const data = state.documents || {};
    q("#document-registry-list").innerHTML = (data.registry || []).map((doc) => `
      <article class="document-registry-card">
        <div>
          <p class="eyebrow">${esc(doc.document_category)}｜${esc(doc.output_format)}</p>
          <h3>${esc(doc.document_name)}</h3>
          <p>${esc(doc.note || "")}</p>
        </div>
        ${doc.requires_record_id
          ? '<span class="status status--info">対象データから出力</span>'
          : `<a class="button button--outline button--small" href="${esc(doc.page_url || "#")}">開く</a>`}
      </article>
    `).join("");
    renderDocumentList("#document-plan-list", data.recent?.plans, "plan");
    renderDocumentList("#document-contract-list", data.recent?.contracts, "contract");
    renderDocumentList("#document-invoice-list", data.recent?.invoices, "invoice");
  }

  async function loadDocuments() {
    state.documents = await api.request("/admin/operations/documents");
    renderDocuments();
  }

  function renderAudit() {
    const target = q("#audit-log-list");
    if (!state.auditLogs.length) {
      target.innerHTML = '<div class="notice notice--info">監査ログはまだありません。</div>';
      return;
    }
    target.innerHTML = state.auditLogs.map((item) => `
      <article class="audit-log-row">
        <time>${esc(dateTimeText(item.created_at))}</time>
        <div>
          <strong>${esc(item.action_name)}</strong>
          <span>${esc(item.actor_name || item.actor_type)}｜${esc(item.actor_role || "")}</span>
          <small>${esc(item.request_id || "")}</small>
        </div>
        <span class="status ${item.result_status === "success" ? "status--success" : item.result_status === "denied" ? "status--warning" : "status--danger"}">${esc(item.result_status)}</span>
      </article>
    `).join("");
  }

  async function loadAudit() {
    const data = await api.request("/admin/operations/audit?limit=150");
    state.auditLogs = data.audit_logs || [];
    renderAudit();
  }

  async function downloadAuditCsv() {
    const button = q("#download-audit-csv");
    setLoading(button, true);
    try {
      const response = await fetch(
        `${String(cfg.apiBaseUrl).replace(/\/+$/, "")}/admin/operations/audit.csv`,
        {
          headers: {
            Authorization: `Bearer ${api.getToken()}`,
            "X-Office-Code": cfg.officeCode,
          },
        }
      );
      if (!response.ok) throw new Error("監査ログCSVを出力できませんでした。");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `dpro-welfare-equipment-audit.csv`;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      window.DPRO?.toast(error.message);
    } finally {
      setLoading(button, false);
    }
  }

  function setupEvents() {
    q("#run-launch-check")?.addEventListener("click", (event) =>
      runLaunchCheck(event.currentTarget)
    );
    q("#reload-operations-summary")?.addEventListener("click", loadSummary);

    q("#operations-office-form")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const button = q('button[type="submit"]', form);
      setLoading(button, true);
      showError(q("#operations-office-error"), "");

      try {
        const raw = formObject(form);
        const businessHours = {};
        weekdays.forEach(([key]) => {
          businessHours[key] = {
            enabled: Boolean(raw[`business_${key}_enabled`]),
            open: raw[`business_${key}_open`] || "09:00",
            close: raw[`business_${key}_close`] || "18:00",
          };
        });

        const closedDates = String(raw.closed_dates || "")
          .split(/\r?\n/)
          .map((item) => item.trim())
          .filter(Boolean);

        const body = {
          office_name: raw.office_name,
          phone: raw.phone,
          fax: raw.fax,
          email: raw.email,
          registration_number: raw.registration_number,
          postal_code: raw.postal_code,
          address: raw.address,
          contact_person_name: raw.contact_person_name,
          line_official_account_name: raw.line_official_account_name,
          default_visit_minutes: Number(raw.default_visit_minutes),
          timezone: raw.timezone,
          business_hours: businessHours,
          closed_dates: closedDates,
          notification_settings: {
            line_enabled: Boolean(raw.line_enabled),
            manual_copy_enabled: Boolean(raw.manual_copy_enabled),
            visit_reminder_enabled: Boolean(raw.visit_reminder_enabled),
            payment_reminder_enabled: Boolean(raw.payment_reminder_enabled),
            send_window_start: "09:00",
            send_window_end: "18:00",
          },
          document_settings: {
            show_office_number: Boolean(raw.show_office_number),
            show_staff_name: Boolean(raw.show_staff_name),
            show_signature_box: Boolean(raw.show_signature_box),
            paper_size: "A4",
          },
          settings_version: 10,
        };

        await api.request("/admin/settings", {
          method: "PATCH",
          body,
        });
        window.DPRO?.toast("事業所設定を保存しました。");
        await loadSummary();
      } catch (error) {
        showError(q("#operations-office-error"), error);
      } finally {
        setLoading(button, false);
      }
    });

    q("#reload-operations-staff")?.addEventListener("click", loadStaff);
    q("#clear-staff-form")?.addEventListener("click", resetStaffForm);

    q("#operations-staff-list")?.addEventListener("click", async (event) => {
      const edit = event.target.closest(".edit-operation-staff");
      if (edit) {
        const staff = state.staff.find((item) => item.id === edit.dataset.id);
        if (staff) fillStaffForm(staff);
      }

      const pinButton = event.target.closest(".reset-operation-pin");
      if (pinButton) {
        const pin = prompt(`${pinButton.dataset.name}の新しいPIN（4～8桁）を入力してください。`);
        if (!pin) return;
        try {
          await api.request(
            `/admin/operations/staff/${pinButton.dataset.id}/pin`,
            {
              method: "POST",
              body: { pin, require_pin_change: true },
            }
          );
          window.DPRO?.toast("スタッフPINを変更しました。");
          await loadStaff();
        } catch (error) {
          showError(q("#operations-staff-error"), error);
        }
      }
    });

    q("#operations-staff-form")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const button = q('button[type="submit"]', form);
      const body = formObject(form);
      const staffId = body.staff_id;
      delete body.staff_id;
      if (!body.pin) delete body.pin;
      body.display_order = Number(body.display_order || 100);
      setLoading(button, true);
      showError(q("#operations-staff-error"), "");
      try {
        await api.request(
          staffId
            ? `/admin/operations/staff/${staffId}`
            : "/admin/operations/staff",
          {
            method: staffId ? "PATCH" : "POST",
            body,
          }
        );
        window.DPRO?.toast(staffId ? "スタッフ情報を更新しました。" : "スタッフを追加しました。");
        resetStaffForm();
        await Promise.all([loadStaff(), loadSummary()]);
      } catch (error) {
        showError(q("#operations-staff-error"), error);
      } finally {
        setLoading(button, false);
      }
    });

    q('[name="role"]', q("#role-permission-form"))?.addEventListener(
      "change",
      renderPermissions
    );

    q("#role-permission-form")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const button = q('button[type="submit"]', form);
      const role = q('[name="role"]', form).value;
      const permissionKeys = qa(
        'input[name="permission_key"]:checked',
        form
      ).map((input) => input.value);

      if (role === "owner" && !permissionKeys.includes("staff.manage")) {
        permissionKeys.push("staff.manage");
      }

      setLoading(button, true);
      showError(q("#permission-error"), "");
      try {
        const data = await api.request("/admin/operations/permissions", {
          method: "PATCH",
          body: { role, permission_keys: permissionKeys },
        });
        state.permissionCatalog = data.catalog || [];
        state.rolePermissions = data.role_permissions || [];
        renderPermissions();
        window.DPRO?.toast("ロール権限を保存しました。");
      } catch (error) {
        showError(q("#permission-error"), error);
      } finally {
        setLoading(button, false);
      }
    });

    q("#notification-template-list")?.addEventListener("submit", async (event) => {
      const form = event.target.closest(".notification-template-card");
      if (!form) return;
      event.preventDefault();
      const button = q('button[type="submit"]', form);
      setLoading(button, true);
      try {
        await api.request(
          `/admin/notifications/templates/${form.dataset.templateId}`,
          {
            method: "PATCH",
            body: formObject(form),
          }
        );
        window.DPRO?.toast("通知文面を保存しました。");
        await loadTemplates();
      } catch (error) {
        showError(q("#notification-preview-error"), error);
      } finally {
        setLoading(button, false);
      }
    });

    q("#preview-notification")?.addEventListener("click", async (event) => {
      const button = event.currentTarget;
      const form = q("#notification-preview-form");
      const raw = formObject(form);
      setLoading(button, true);
      showError(q("#notification-preview-error"), "");
      try {
        const variables = JSON.parse(raw.variables || "{}");
        const data = await api.request("/admin/notifications/preview", {
          method: "POST",
          body: { template_key: raw.template_key, variables },
        });
        q("#notification-preview").innerHTML = `
          <pre>${esc(data.rendered_body)}</pre>
          <button class="button button--outline button--small copy-preview-notification" type="button">文面をコピー</button>
        `;
        q(".copy-preview-notification")?.addEventListener("click", () =>
          copyText(data.rendered_body)
        );
      } catch (error) {
        showError(q("#notification-preview-error"), error);
      } finally {
        setLoading(button, false);
      }
    });

    q("#notification-preview-form")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const button = q('button[type="submit"]', form);
      const raw = formObject(form);
      setLoading(button, true);
      showError(q("#notification-preview-error"), "");
      try {
        const variables = JSON.parse(raw.variables || "{}");
        await api.request("/admin/notifications/queue", {
          method: "POST",
          body: {
            template_key: raw.template_key,
            target_type: "client",
            target_name: raw.target_name,
            line_user_id: raw.line_user_id,
            variables,
          },
        });
        window.DPRO?.toast("通知キューへ追加しました。");
        await loadQueue();
      } catch (error) {
        showError(q("#notification-preview-error"), error);
      } finally {
        setLoading(button, false);
      }
    });

    q("#reload-notification-queue")?.addEventListener("click", loadQueue);
    q("#notification-queue-list")?.addEventListener("click", async (event) => {
      const copyButton = event.target.closest(".copy-notification");
      if (copyButton) copyText(copyButton.dataset.body);

      const sendButton = event.target.closest(".send-notification");
      if (sendButton) {
        setLoading(sendButton, true);
        try {
          const data = await api.request(
            `/admin/notifications/queue/${sendButton.dataset.id}/send`,
            { method: "POST", body: {} }
          );
          if (data.delivery_mode === "manual_copy") {
            await copyText(data.rendered_body);
          } else {
            window.DPRO?.toast("LINE通知を送信しました。");
          }
          await loadQueue();
        } catch (error) {
          showError(q("#notification-preview-error"), error);
        } finally {
          setLoading(sendButton, false);
        }
      }
    });

    q("#reload-audit-log")?.addEventListener("click", loadAudit);
    q("#download-audit-csv")?.addEventListener("click", downloadAuditCsv);
  }

  async function initialize() {
    buildBusinessHoursGrid({});
    setupEvents();
    await Promise.all([
      loadSummary(),
      loadStaff(),
      loadPermissions(),
      loadTemplates(),
      loadQueue(),
      loadDocuments(),
      loadAudit(),
    ]);
  }

  document.addEventListener("DOMContentLoaded", () => {
    if (!api) return;
    document.addEventListener("dpro-admin-ready", initialize, { once: true });
    if (
      sessionStorage.getItem("dpro_welfare_admin_ok") === "1" &&
      api.hasToken()
    ) {
      initialize();
    }
  });
})();
