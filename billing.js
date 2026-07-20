(() => {
  "use strict";

  const api = window.DPRO_API;
  const cfg = window.DPRO_CONFIG;
  const q = (selector, root = document) => root.querySelector(selector);
  const qa = (selector, root = document) => [...root.querySelectorAll(selector)];

  const state = {
    settings: null,
    cycles: [],
    cycleDetail: null,
    invoiceDetail: null,
    staff: [],
  };

  const labels = {
    draft: "下書き",
    validated: "検証済み",
    locked: "締め済み",
    issued: "発行済み",
    closed: "完了",
    cancelled: "取消",
    partially_paid: "一部入金",
    paid: "入金済み",
    void: "無効",
    warning: "警告",
    error: "エラー",
  };

  function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;",
      '"': "&quot;", "'": "&#039;"
    }[char]));
  }

  function yen(value) {
    return Number(value || 0).toLocaleString("ja-JP");
  }

  function monthText(value) {
    if (!value) return "－";
    const [year, month] = value.slice(0, 7).split("-");
    return `${year}年${Number(month)}月`;
  }

  function dateText(value) {
    if (!value) return "－";
    const date = new Date(value.length === 10 ? `${value}T00:00:00+09:00` : value);
    return Number.isNaN(date.getTime())
      ? value
      : new Intl.DateTimeFormat("ja-JP", {
          dateStyle: "medium",
          ...(value.length === 10 ? {} : { timeStyle: "short" }),
        }).format(date);
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

  function statusClass(status) {
    if (["validated","issued","paid","closed"].includes(status)) return "status--success";
    if (["error","cancelled","void"].includes(status)) return "status--danger";
    if (["warning","draft","locked","partially_paid"].includes(status)) return "status--warning";
    return "status--info";
  }

  function fillStaff() {
    qa("[data-billing-staff]").forEach((select) => {
      const current = select.value;
      select.innerHTML = '<option value="">未選択</option>' +
        state.staff.map((item) =>
          `<option value="${esc(item.id)}">${esc(item.staff_name)}（${esc(item.role)}）</option>`
        ).join("");
      select.value = current;
    });
  }

  async function loadStaff() {
    const data = await api.request("/admin/staff");
    state.staff = data.staff || [];
    fillStaff();
  }

  function currentMonth() {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Tokyo",
      year: "numeric",
      month: "2-digit",
    }).formatToParts(new Date());
    const values = Object.fromEntries(
      parts.map((part) => [part.type, part.value])
    );
    return `${values.year}-${values.month}`;
  }

  async function loadSummary() {
    const month = q('[name="service_month"]', q("#billing-generate-form"))?.value || currentMonth();
    const data = await api.request(`/admin/billing/summary?month=${encodeURIComponent(month)}`);
    const cycle = data.cycle || {};
    const values = {
      gross_total: cycle.gross_total || 0,
      insurance_claim_total: cycle.insurance_claim_total || 0,
      client_charge_total: cycle.client_charge_total || 0,
      unpaid_total: data.arrears?.unpaid_total || 0,
      overdue_invoice_count: data.arrears?.overdue_invoice_count || 0,
    };
    Object.entries(values).forEach(([key, value]) => {
      qa(`[data-billing-summary="${key}"]`).forEach((node) => {
        node.textContent = key.endsWith("_count") ? String(value) : yen(value);
      });
    });
  }

  async function loadSettings() {
    showError(q("#billing-settings-error"), "");
    try {
      const data = await api.request("/admin/billing/settings");
      state.settings = data.settings || {};
      const form = q("#billing-settings-form");
      const settings = state.settings;
      [
        "provider_number","default_due_day","invoice_prefix",
        "payment_prefix","default_billing_rule",
        "half_month_threshold_days","bank_transfer_note","invoice_note"
      ].forEach((name) => {
        const input = q(`[name="${name}"]`, form);
        if (input) input.value = settings[name] ?? "";
      });
    } catch (error) {
      showError(q("#billing-settings-error"), error);
    }
  }

  function renderCycles() {
    const target = q("#billing-cycle-list");
    if (!state.cycles.length) {
      target.innerHTML = '<div class="notice notice--info">月次請求はまだ作成されていません。</div>';
      return;
    }
    target.innerHTML = state.cycles.map((cycle) => `
      <article class="billing-cycle-row ${state.cycleDetail?.cycle?.id === cycle.id ? "is-selected" : ""}">
        <div>
          <p class="eyebrow">${esc(cycle.cycle_number)}</p>
          <h3>${esc(monthText(cycle.service_month))}</h3>
          <p>請求書 ${esc(cycle.invoice_count)}件｜利用者請求 ${esc(yen(cycle.client_charge_total))}円｜未収 ${esc(yen(cycle.balance_total))}円</p>
        </div>
        <div class="billing-cycle-row__actions">
          <span class="status ${statusClass(cycle.status)}">${esc(labels[cycle.status] || cycle.status)}</span>
          <button class="button button--secondary button--small open-billing-cycle" type="button" data-id="${esc(cycle.id)}">開く</button>
        </div>
      </article>
    `).join("");
  }

  async function loadCycles() {
    const data = await api.request("/admin/billing/cycles");
    state.cycles = data.cycles || [];
    renderCycles();
  }

  function renderCycleDetail() {
    const data = state.cycleDetail;
    if (!data?.cycle) return;
    const cycle = data.cycle;
    q("#billing-cycle-content").hidden = false;
    q("#billing-cycle-title").textContent =
      `${monthText(cycle.service_month)}｜${cycle.cycle_number}`;
    q("#billing-cycle-summary").innerHTML = `
      <div><span>状態</span><strong><span class="status ${statusClass(cycle.status)}">${esc(labels[cycle.status] || cycle.status)}</span></strong></div>
      <div><span>請求書</span><strong>${esc(cycle.invoice_count)}件</strong></div>
      <div><span>費用総額</span><strong>${esc(yen(cycle.gross_total))}円</strong></div>
      <div><span>保険請求</span><strong>${esc(yen(cycle.insurance_claim_total))}円</strong></div>
      <div><span>利用者請求</span><strong>${esc(yen(cycle.client_charge_total))}円</strong></div>
      <div><span>未収残高</span><strong>${esc(yen(cycle.balance_total))}円</strong></div>
      <div><span>エラー</span><strong>${esc(cycle.validation_error_count)}件</strong></div>
      <div><span>警告</span><strong>${esc(cycle.validation_warning_count)}件</strong></div>
    `;
    renderCycleActions();
    renderIssues();
    renderInvoices();
    renderCycles();
  }

  function renderCycleActions() {
    const cycle = state.cycleDetail.cycle;
    const target = q("#billing-cycle-actions");
    target.hidden = false;
    const actions = [];
    if (["draft","validated"].includes(cycle.status)) {
      actions.push(["validate","請求を検証","button--primary"]);
    }
    if (cycle.status === "validated" && cycle.validation_error_count === 0) {
      actions.push(["lock","締め処理","button--secondary"]);
    }
    if (cycle.status === "locked") {
      actions.push(["issue","請求書を発行","button--primary"]);
    }
    target.innerHTML = actions.map(([action, label, cls]) =>
      `<button class="button ${cls} billing-cycle-action" type="button" data-action="${action}">${esc(label)}</button>`
    ).join("") || '<span class="help">現在の状態で必要な処理はありません。</span>';
  }

  function renderIssues() {
    const target = q("#billing-validation-list");
    const issues = state.cycleDetail.validation_issues || [];
    if (!issues.length) {
      target.innerHTML = '<div class="notice notice--success">未解決のエラー・警告はありません。</div>';
      return;
    }
    target.innerHTML = issues.map((issue) => `
      <article class="billing-issue-row billing-issue-row--${esc(issue.severity)}">
        <span class="status ${statusClass(issue.severity)}">${esc(labels[issue.severity] || issue.severity)}</span>
        <div><strong>${esc(issue.issue_code)}</strong><p>${esc(issue.issue_message)}</p><small>${esc(issue.clients?.client_name || "事業所全体")}</small></div>
      </article>
    `).join("");
  }

  function renderInvoices() {
    const target = q("#billing-invoice-list");
    const invoices = state.cycleDetail.invoices || [];
    q("#billing-invoice-count").textContent = `${invoices.length}件`;
    if (!invoices.length) {
      target.innerHTML = '<div class="notice notice--info">請求書はありません。</div>';
      return;
    }
    target.innerHTML = invoices.map((invoice) => `
      <article class="billing-invoice-row ${state.invoiceDetail?.invoice?.id === invoice.id ? "is-selected" : ""}">
        <div>
          <p class="eyebrow">${esc(invoice.invoice_number)}</p>
          <h3>${esc(invoice.clients?.client_name || invoice.recipient_name_snapshot || "利用者")}</h3>
          <p>負担 ${esc(invoice.copay_rate_snapshot || "－")}割｜期日 ${esc(dateText(invoice.due_date))}</p>
        </div>
        <div class="billing-invoice-amounts">
          <span>利用者請求 <strong>${esc(yen(Number(invoice.client_charge_total) + Number(invoice.tax_total)))}円</strong></span>
          <span>入金 <strong>${esc(yen(invoice.paid_total))}円</strong></span>
          <span>残高 <strong>${esc(yen(invoice.balance_due))}円</strong></span>
        </div>
        <div class="billing-invoice-row__actions">
          <span class="status ${statusClass(invoice.status)}">${esc(labels[invoice.status] || invoice.status)}</span>
          <button class="button button--secondary button--small open-billing-invoice" type="button" data-id="${esc(invoice.id)}">詳細</button>
        </div>
      </article>
    `).join("");
  }

  async function loadCycle(id) {
    showError(q("#billing-cycle-error"), "");
    try {
      state.cycleDetail = await api.request(`/admin/billing/cycles/${id}`);
      renderCycleDetail();
      await loadSummary();
      q("#billing-cycle-detail-card").scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) {
      showError(q("#billing-cycle-error"), error);
    }
  }

  function renderInvoiceDetail() {
    const data = state.invoiceDetail;
    if (!data?.invoice) return;
    const invoice = data.invoice;
    q("#billing-invoice-detail").hidden = false;
    q("#billing-invoice-title").textContent =
      `${invoice.invoice_number}｜${data.client.client_name} 様`;
    q("#billing-invoice-summary").innerHTML = `
      <div><span>状態</span><strong><span class="status ${statusClass(invoice.status)}">${esc(labels[invoice.status] || invoice.status)}</span></strong></div>
      <div><span>請求月</span><strong>${esc(monthText(invoice.service_month))}</strong></div>
      <div><span>費用総額</span><strong>${esc(yen(invoice.gross_total))}円</strong></div>
      <div><span>保険請求</span><strong>${esc(yen(invoice.insurance_claim_total))}円</strong></div>
      <div><span>利用者請求</span><strong>${esc(yen(Number(invoice.client_charge_total) + Number(invoice.tax_total)))}円</strong></div>
      <div><span>入金済み</span><strong>${esc(yen(invoice.paid_total))}円</strong></div>
      <div><span>未収残高</span><strong>${esc(yen(invoice.balance_due))}円</strong></div>
      <div><span>支払期日</span><strong>${esc(dateText(invoice.due_date))}</strong></div>
    `;
    renderLines();
    renderPayments();
    fillInvoiceForms();
    renderInvoices();
  }

  function renderLines() {
    const target = q("#billing-line-list");
    target.innerHTML = (state.invoiceDetail.lines || []).map((line) => `
      <article class="billing-line-row ${line.manual_review_required ? "needs-review" : ""}">
        <div>
          <p class="eyebrow">${esc(line.line_type)}｜${esc(line.service_code || "コード未設定")}</p>
          <h3>${esc(line.item_name)}</h3>
          <p>${esc(line.quantity)}点 × ${esc(yen(line.unit_price))}円${line.service_days !== null ? `｜${esc(line.service_days)}日` : ""}</p>
          ${line.validation_message ? `<p class="billing-line-warning">${esc(line.validation_message)}</p>` : ""}
        </div>
        <div class="billing-line-amounts">
          <span>費用 ${esc(yen(line.gross_amount))}円</span>
          <span>保険 ${esc(yen(line.insurance_claim_amount))}円</span>
          <span>本人 ${esc(yen(line.client_charge_amount))}円</span>
        </div>
      </article>
    `).join("");
  }

  function renderPayments() {
    const target = q("#billing-payment-list");
    const allocations = state.invoiceDetail.payment_allocations || [];
    if (!allocations.length) {
      target.innerHTML = '<p class="help">入金記録はありません。</p>';
      return;
    }
    target.innerHTML = allocations.map((allocation) => {
      const payment = allocation.payments || {};
      return `
        <article class="billing-payment-row">
          <div><strong>${esc(payment.payment_number || "")}</strong><span>${esc(dateText(payment.received_on))}｜${esc(payment.payment_method || "")}</span></div>
          <div><strong>${esc(yen(allocation.allocated_amount))}円</strong><span class="status ${payment.status === "posted" ? "status--success" : "status--danger"}">${payment.status === "posted" ? "入金済み" : "取消済み"}</span></div>
          ${payment.status === "posted" ? `<button class="button button--outline button--small reverse-payment" type="button" data-id="${esc(payment.id)}">入金取消</button>` : ""}
        </article>
      `;
    }).join("");
  }

  async function loadClientProfile() {
    const data = state.invoiceDetail;
    if (!data?.client) return;
    try {
      const result = await api.request(
        `/admin/billing/clients/${data.client.id}/profile`
      );
      const profile = result.profile || {};
      const form = q("#client-billing-profile-form");
      [
        "insurer_number","copay_rate_override","payment_method",
        "sale_benefit_method","invoice_recipient_name",
        "invoice_address","billing_note"
      ].forEach((name) => {
        const input = q(`[name="${name}"]`, form);
        if (input) input.value = profile[name] ?? "";
      });
    } catch (error) {
      showError(q("#client-billing-profile-error"), error);
    }
  }

  function fillInvoiceForms() {
    const invoice = state.invoiceDetail.invoice;
    const paymentForm = q("#billing-payment-form");
    q('[name="received_on"]', paymentForm).value =
      new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Tokyo", year: "numeric",
        month: "2-digit", day: "2-digit",
      }).format(new Date());
    q('[name="amount"]', paymentForm).value =
      invoice.balance_due > 0 ? invoice.balance_due : "";
    q('button[type="submit"]', paymentForm).disabled =
      !["issued","partially_paid"].includes(invoice.status) ||
      Number(invoice.balance_due) <= 0;

    const adjustmentForm = q("#billing-adjustment-form");
    q('button[type="submit"]', adjustmentForm).disabled =
      invoice.status !== "draft";

    q("#print-billing-receipt").disabled =
      Number(invoice.paid_total) <= 0;

    loadClientProfile();
  }

  async function loadInvoice(id) {
    showError(q("#billing-invoice-error"), "");
    try {
      state.invoiceDetail = await api.request(`/admin/billing/invoices/${id}`);
      renderInvoiceDetail();
      q("#billing-invoice-detail").scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) {
      showError(q("#billing-invoice-error"), error);
    }
  }

  async function cycleAction(action, button) {
    const cycle = state.cycleDetail?.cycle;
    if (!cycle) return;
    if (action === "lock" && !confirm("この請求月を締めます。明細を直接変更できなくなります。よろしいですか？")) return;
    if (action === "issue" && !confirm("利用者請求書を発行します。よろしいですか？")) return;
    setLoading(button, true);
    try {
      const body = {};
      if (action === "issue") {
        body.issue_date = new Intl.DateTimeFormat("en-CA", {
          timeZone: "Asia/Tokyo", year: "numeric",
          month: "2-digit", day: "2-digit",
        }).format(new Date());
      }
      const result = await api.request(
        `/admin/billing/cycles/${cycle.id}/${action}`,
        { method: "POST", body }
      );
      state.cycleDetail = result;
      window.DPRO?.toast(
        action === "validate" ? "請求検証が完了しました。" :
        action === "lock" ? "請求月を締めました。" :
        "請求書を発行しました。"
      );
      renderCycleDetail();
      await Promise.all([loadCycles(), loadSummary()]);
    } catch (error) {
      showError(q("#billing-cycle-error"), error);
    } finally {
      setLoading(button, false);
    }
  }

  async function downloadClaimCsv() {
    const cycle = state.cycleDetail?.cycle;
    if (!cycle) return;
    const button = q("#download-claim-csv");
    setLoading(button, true);
    try {
      const response = await fetch(
        `${String(cfg.apiBaseUrl).replace(/\/+$/, "")}/admin/billing/cycles/${cycle.id}/claim-review.csv`,
        {
          headers: {
            Authorization: `Bearer ${api.getToken()}`,
            "X-Office-Code": cfg.officeCode,
          },
        }
      );
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error?.message || "CSV出力に失敗しました。");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `dpro-claim-review-${cycle.service_month.slice(0, 7)}.csv`;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      showError(q("#billing-cycle-error"), error);
    } finally {
      setLoading(button, false);
    }
  }

  function setupEvents() {
    q("#billing-generate-form")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const button = q('button[type="submit"]', form);
      setLoading(button, true);
      showError(q("#billing-generate-error"), "");
      try {
        const result = await api.request("/admin/billing/cycles/generate", {
          method: "POST",
          body: formObject(form),
        });
        state.cycleDetail = result;
        window.DPRO?.toast("月次請求を生成しました。");
        renderCycleDetail();
        await Promise.all([loadCycles(), loadSummary()]);
      } catch (error) {
        showError(q("#billing-generate-error"), error);
      } finally {
        setLoading(button, false);
      }
    });

    q("#billing-settings-form")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const button = q('button[type="submit"]', form);
      setLoading(button, true);
      showError(q("#billing-settings-error"), "");
      try {
        await api.request("/admin/billing/settings", {
          method: "PATCH",
          body: formObject(form),
        });
        window.DPRO?.toast("請求設定を保存しました。");
        await loadSettings();
      } catch (error) {
        showError(q("#billing-settings-error"), error);
      } finally {
        setLoading(button, false);
      }
    });

    q("#reload-billing-settings")?.addEventListener("click", loadSettings);
    q("#reload-billing-cycles")?.addEventListener("click", loadCycles);

    q("#billing-cycle-list")?.addEventListener("click", (event) => {
      const button = event.target.closest(".open-billing-cycle");
      if (button) loadCycle(button.dataset.id);
    });

    q("#billing-cycle-actions")?.addEventListener("click", (event) => {
      const button = event.target.closest(".billing-cycle-action");
      if (button) cycleAction(button.dataset.action, button);
    });

    q("#billing-invoice-list")?.addEventListener("click", (event) => {
      const button = event.target.closest(".open-billing-invoice");
      if (button) loadInvoice(button.dataset.id);
    });

    q("#download-claim-csv")?.addEventListener("click", downloadClaimCsv);

    q("#client-billing-profile-form")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!state.invoiceDetail?.client) return;
      const form = event.currentTarget;
      const button = q('button[type="submit"]', form);
      setLoading(button, true);
      showError(q("#client-billing-profile-error"), "");
      try {
        await api.request(
          `/admin/billing/clients/${state.invoiceDetail.client.id}/profile`,
          { method: "PATCH", body: formObject(form) }
        );
        window.DPRO?.toast("利用者請求設定を保存しました。");
      } catch (error) {
        showError(q("#client-billing-profile-error"), error);
      } finally {
        setLoading(button, false);
      }
    });

    q("#billing-adjustment-form")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!state.invoiceDetail?.invoice) return;
      const form = event.currentTarget;
      const button = q('button[type="submit"]', form);
      setLoading(button, true);
      showError(q("#billing-adjustment-error"), "");
      try {
        const result = await api.request(
          `/admin/billing/invoices/${state.invoiceDetail.invoice.id}/adjustments`,
          { method: "POST", body: formObject(form) }
        );
        state.invoiceDetail = result;
        form.reset();
        window.DPRO?.toast("調整明細を追加しました。");
        renderInvoiceDetail();
        await loadCycle(state.invoiceDetail.invoice.billing_cycle_id);
      } catch (error) {
        showError(q("#billing-adjustment-error"), error);
      } finally {
        setLoading(button, false);
      }
    });

    q("#billing-payment-form")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!state.invoiceDetail?.invoice) return;
      const form = event.currentTarget;
      const button = q('button[type="submit"]', form);
      setLoading(button, true);
      showError(q("#billing-payment-error"), "");
      try {
        const result = await api.request(
          `/admin/billing/invoices/${state.invoiceDetail.invoice.id}/payments`,
          { method: "POST", body: formObject(form) }
        );
        state.invoiceDetail = result;
        window.DPRO?.toast("入金を登録しました。");
        renderInvoiceDetail();
        await Promise.all([
          loadCycle(state.invoiceDetail.invoice.billing_cycle_id),
          loadSummary(),
        ]);
      } catch (error) {
        showError(q("#billing-payment-error"), error);
      } finally {
        setLoading(button, false);
      }
    });

    q("#billing-payment-list")?.addEventListener("click", async (event) => {
      const button = event.target.closest(".reverse-payment");
      if (!button) return;
      const reason = prompt("入金取消理由を入力してください。");
      if (!reason) return;
      setLoading(button, true);
      try {
        await api.request(`/admin/billing/payments/${button.dataset.id}/reverse`, {
          method: "POST",
          body: { reason },
        });
        await loadInvoice(state.invoiceDetail.invoice.id);
        await Promise.all([
          loadCycle(state.invoiceDetail.invoice.billing_cycle_id),
          loadSummary(),
        ]);
      } catch (error) {
        showError(q("#billing-payment-error"), error);
      } finally {
        setLoading(button, false);
      }
    });

    q("#print-billing-invoice")?.addEventListener("click", () => {
      const id = state.invoiceDetail?.invoice?.id;
      if (id) window.open(`billing-print.html?id=${encodeURIComponent(id)}&type=invoice`, "_blank", "noopener");
    });
    q("#print-billing-receipt")?.addEventListener("click", () => {
      const id = state.invoiceDetail?.invoice?.id;
      if (id) window.open(`billing-print.html?id=${encodeURIComponent(id)}&type=receipt`, "_blank", "noopener");
    });

    q('[name="service_month"]', q("#billing-generate-form"))?.addEventListener("change", loadSummary);
  }

  async function initialize() {
    const monthInput = q('[name="service_month"]', q("#billing-generate-form"));
    monthInput.value = currentMonth();
    await Promise.all([
      loadStaff(),
      loadSettings(),
      loadCycles(),
      loadSummary(),
    ]);
    if (state.cycles.length) await loadCycle(state.cycles[0].id);
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
