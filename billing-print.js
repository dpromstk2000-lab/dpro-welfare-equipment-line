(() => {
  "use strict";

  const api = window.DPRO_API;
  const q = (selector) => document.querySelector(selector);

  function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;",
      '"': "&quot;", "'": "&#039;"
    }[char]));
  }

  function yen(value) {
    return `${Number(value || 0).toLocaleString("ja-JP")}円`;
  }

  function dateText(value) {
    if (!value) return "－";
    const date = new Date(value.length === 10 ? `${value}T00:00:00+09:00` : value);
    return Number.isNaN(date.getTime())
      ? value
      : new Intl.DateTimeFormat("ja-JP", {
          dateStyle: "long",
          ...(value.length === 10 ? {} : { timeStyle: "short" }),
        }).format(date);
  }

  function monthText(value) {
    if (!value) return "－";
    const [year, month] = value.slice(0, 7).split("-");
    return `${year}年${Number(month)}月分`;
  }

  function renderInvoice(data, settings) {
    const invoice = data.invoice;
    q("#billing-print-eyebrow").textContent = "INVOICE";
    q("#billing-print-heading").textContent = "請求書";
    q("#billing-print-content").innerHTML = `
      <section class="billing-print-address">
        <div>
          <p>〒${esc(invoice.recipient_postal_code_snapshot || "")}</p>
          <p>${esc(invoice.recipient_address_snapshot || "")}</p>
          <h2>${esc(invoice.recipient_name_snapshot || data.client.client_name)} 様</h2>
        </div>
        <div>
          <p><strong>請求書番号：</strong>${esc(invoice.invoice_number)}</p>
          <p><strong>発行日：</strong>${esc(dateText(invoice.issue_date || invoice.created_at))}</p>
          <p><strong>支払期日：</strong>${esc(dateText(invoice.due_date))}</p>
          <p><strong>事業所番号：</strong>${esc(settings?.provider_number || "")}</p>
        </div>
      </section>

      <section class="billing-print-total">
        <span>${esc(monthText(invoice.service_month))} ご請求額</span>
        <strong>${esc(yen(Number(invoice.client_charge_total) + Number(invoice.tax_total)))}</strong>
      </section>

      <section class="print-section">
        <table class="print-table">
          <thead>
            <tr>
              <th>内容</th><th>数量</th><th>単価</th>
              <th>費用額</th><th>保険請求</th><th>利用者負担</th>
            </tr>
          </thead>
          <tbody>
            ${(data.lines || []).map((line) => `
              <tr>
                <td>
                  ${esc(line.item_name)}
                  <small>${esc(line.note || "")}</small>
                </td>
                <td>${esc(line.quantity)}</td>
                <td>${esc(yen(line.unit_price))}</td>
                <td>${esc(yen(line.gross_amount))}</td>
                <td>${esc(yen(Number(line.insurance_claim_amount) + Number(line.public_claim_amount)))}</td>
                <td>${esc(yen(Number(line.client_charge_amount) + Number(line.tax_amount)))}</td>
              </tr>
            `).join("")}
          </tbody>
          <tfoot>
            <tr><th colspan="3">合計</th><td>${esc(yen(invoice.gross_total))}</td><td>${esc(yen(Number(invoice.insurance_claim_total) + Number(invoice.public_claim_total)))}</td><td>${esc(yen(Number(invoice.client_charge_total) + Number(invoice.tax_total)))}</td></tr>
          </tfoot>
        </table>
      </section>

      <section class="print-section billing-print-breakdown">
        <div><span>入金済み</span><strong>${esc(yen(invoice.paid_total))}</strong></div>
        <div><span>今回未収残高</span><strong>${esc(yen(invoice.balance_due))}</strong></div>
        <div><span>負担割合</span><strong>${esc(invoice.copay_rate_snapshot ? `${invoice.copay_rate_snapshot}割` : "要確認")}</strong></div>
      </section>

      <section class="print-section">
        <h2>お支払いについて</h2>
        <p>${esc(settings?.bank_transfer_note || "事業所の案内に従ってお支払いください。")}</p>
        <p>${esc(invoice.invoice_note || settings?.invoice_note || "")}</p>
      </section>

      <section class="print-signature-grid">
        <div><span>請求先</span><strong>${esc(invoice.recipient_name_snapshot || data.client.client_name)} 様</strong></div>
        <div><span>発行事業所</span><strong data-office-name>DPRO 福祉用具センター</strong></div>
      </section>
    `;
  }

  function renderReceipt(data, settings) {
    const invoice = data.invoice;
    const posted = (data.payment_allocations || [])
      .filter((item) => item.payments?.status === "posted");
    const paidTotal = posted.reduce(
      (sum, item) => sum + Number(item.allocated_amount || 0),
      0
    );

    q("#billing-print-eyebrow").textContent = "RECEIPT";
    q("#billing-print-heading").textContent = "領収書";
    q("#billing-print-content").innerHTML = `
      <section class="billing-receipt-recipient">
        <h2>${esc(invoice.recipient_name_snapshot || data.client.client_name)} 様</h2>
        <p>請求書番号：${esc(invoice.invoice_number)}</p>
      </section>

      <section class="billing-print-total billing-print-total--receipt">
        <span>領収金額</span>
        <strong>${esc(yen(paidTotal))}</strong>
      </section>

      <p class="billing-receipt-purpose">
        但し、${esc(monthText(invoice.service_month))}福祉用具レンタル・販売利用料として
      </p>

      <section class="print-section">
        <table class="print-table">
          <thead><tr><th>入金番号</th><th>入金日</th><th>方法</th><th>金額</th></tr></thead>
          <tbody>
            ${posted.map((item) => `
              <tr>
                <td>${esc(item.payments?.payment_number || "")}</td>
                <td>${esc(dateText(item.payments?.received_on))}</td>
                <td>${esc(item.payments?.payment_method || "")}</td>
                <td>${esc(yen(item.allocated_amount))}</td>
              </tr>
            `).join("") || '<tr><td colspan="4">入金記録がありません。</td></tr>'}
          </tbody>
        </table>
      </section>

      <section class="print-section billing-receipt-office">
        <div>
          <strong data-office-name>DPRO 福祉用具センター</strong>
          <p>事業所番号：${esc(settings?.provider_number || "")}</p>
        </div>
        <div class="receipt-stamp-box">印</div>
      </section>

      <p class="print-note">入金取消が行われた記録は領収金額に含みません。</p>
    `;
  }

  async function initialize() {
    const params = new URLSearchParams(location.search);
    const id = params.get("id");
    const type = params.get("type") === "receipt" ? "receipt" : "invoice";
    const error = q("#billing-print-error");

    if (!id) {
      error.hidden = false;
      error.textContent = "請求書IDが指定されていません。";
      return;
    }

    try {
      const [data, settingData] = await Promise.all([
        api.request(`/admin/billing/invoices/${encodeURIComponent(id)}`),
        api.request("/admin/billing/settings"),
      ]);
      if (type === "receipt") renderReceipt(data, settingData.settings || {});
      else renderInvoice(data, settingData.settings || {});
    } catch (err) {
      error.hidden = false;
      error.textContent = err.message;
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    q("#billing-print-button")?.addEventListener("click", () => window.print());
    initialize();
  });
})();
