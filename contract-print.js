(() => {
  "use strict";
  const api = window.DPRO_API;
  const q = (selector) => document.querySelector(selector);

  function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
    }[char]));
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

  function yen(value) {
    return value === null || value === undefined
      ? "－"
      : `${Number(value).toLocaleString("ja-JP")}円`;
  }

  function render(data) {
    const c = data.contract;
    const consent = data.consent;
    const periods = data.rental_periods || [];
    q("#contract-print-content").innerHTML = `
      <section class="print-meta-grid">
        <div><span>契約番号</span><strong>${esc(c.contract_number)}</strong></div>
        <div><span>契約区分</span><strong>${esc(c.contract_type)}</strong></div>
        <div><span>契約日</span><strong>${esc(dateText(c.contracted_on))}</strong></div>
        <div><span>契約期間</span><strong>${esc(dateText(c.start_date))}～${esc(dateText(c.end_date))}</strong></div>
      </section>

      <section class="print-section">
        <h2>利用者</h2>
        <table class="print-table">
          <tr><th>氏名</th><td>${esc(data.client.client_name)}</td><th>利用者番号</th><td>${esc(data.client.client_number)}</td></tr>
          <tr><th>住所</th><td colspan="3">${esc(data.client.address || "")}</td></tr>
          <tr><th>電話番号</th><td>${esc(data.client.phone || "")}</td><th>要介護度</th><td>${esc(data.client.care_level || "")}</td></tr>
        </table>
      </section>

      <section class="print-section">
        <h2>契約明細</h2>
        <table class="print-table">
          <thead><tr><th>提供区分</th><th>商品</th><th>数量</th><th>価格</th><th>用具管理番号</th></tr></thead>
          <tbody>
            ${(data.items || []).map((item) => {
              const assigned = periods
                .filter((period) => period.contract_item_id === item.id)
                .map((period) => period.rental_assets?.asset_number)
                .filter(Boolean)
                .join("、");
              return `<tr>
                <td>${esc(item.service_type)}</td>
                <td>${esc(item.item_name_snapshot || item.product_models?.product_name || "")}</td>
                <td>${esc(item.quantity)}</td>
                <td>${esc(yen(item.unit_price))}</td>
                <td>${esc(assigned || "納品前")}</td>
              </tr>`;
            }).join("")}
          </tbody>
        </table>
      </section>

      <section class="print-section">
        <h2>契約説明・同意</h2>
        <table class="print-table">
          <tr><th>署名者</th><td>${esc(consent?.signer_name || c.signed_by_name || "")}</td><th>区分・続柄</th><td>${esc([consent?.signer_role, consent?.signer_relationship].filter(Boolean).join("・"))}</td></tr>
          <tr><th>同意方法</th><td>${esc(consent?.agreement_method || c.agreement_method || "")}</td><th>同意日時</th><td>${esc(dateText(consent?.signed_at || c.signed_at))}</td></tr>
          <tr><th>確認項目</th><td colspan="3">重要事項・個人情報・変更解約・貸与条件・販売条件・契約控え交付</td></tr>
          <tr><th>同意メモ</th><td colspan="3">${esc(consent?.consent_note || c.contract_note || "")}</td></tr>
        </table>
      </section>

      <section class="print-section">
        <h2>納品・設置状況</h2>
        ${(data.deliveries || []).length
          ? (data.deliveries || []).map((delivery) => `
            <div class="print-delivery-row">
              <strong>${esc(delivery.delivery_number)}</strong>
              <span>${esc(delivery.status)}</span>
              <span>完了：${esc(dateText(delivery.completed_at))}</span>
              <span>受領者：${esc(delivery.recipient_name || "未完了")}</span>
            </div>`).join("")
          : '<p>納品予定はまだ作成されていません。</p>'}
      </section>

      <section class="print-signature-grid">
        <div><span>利用者・家族確認</span><strong>${esc(consent?.signer_name || c.signed_by_name || "")}</strong></div>
        <div><span>事業所確認</span><strong data-office-name>DPRO 福祉用具センター</strong></div>
      </section>

      <p class="print-note">この確認書は契約・同意・用具個体割当・納品状況をまとめた業務確認用書面です。</p>
    `;
  }

  async function initialize() {
    const id = new URLSearchParams(location.search).get("id");
    const error = q("#contract-print-error");
    if (!id) {
      error.hidden = false;
      error.textContent = "契約IDが指定されていません。";
      return;
    }
    try {
      const data = await api.request(`/admin/contracts/${encodeURIComponent(id)}`);
      render(data);
    } catch (err) {
      error.hidden = false;
      error.textContent = err.message;
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    q("#contract-print-button")?.addEventListener("click", () => window.print());
    initialize();
  });
})();
