(() => {
  "use strict";
  const api = window.DPRO_API;
  const cfg = window.DPRO_CONFIG;
  const q = (selector) => document.querySelector(selector);

  function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
    }[char]));
  }

  function dateText(value) {
    if (!value) return "－";
    const date = new Date(`${value}T00:00:00+09:00`);
    if (Number.isNaN(date.getTime())) return esc(value);
    return new Intl.DateTimeFormat("ja-JP", { year:"numeric",month:"long",day:"numeric" }).format(date);
  }

  function datetimeText(value) {
    if (!value) return "－";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? esc(value) : new Intl.DateTimeFormat("ja-JP", { dateStyle:"long",timeStyle:"short" }).format(date);
  }

  function yen(value) {
    return value === null || value === undefined ? "－" : `${Number(value).toLocaleString("ja-JP")}円`;
  }

  function choiceLabel(value) {
    return ({ rental:"貸与", sale:"販売", not_applicable:"対象外", pending:"検討中" })[value] || value || "－";
  }

  function itemRows(data) {
    const explanations = new Map((data.explanations || []).map((item) => [item.plan_item_id, item]));
    return (data.items || []).map((item, index) => {
      const product = item.product_models || {};
      const explanation = explanations.get(item.id);
      return `<tr>
        <td>${index + 1}</td>
        <td><strong>${esc(product.product_name || "")}</strong><br><span>${esc(product.manufacturer || "")} ${esc(product.model_number || "")}</span><br><small>${esc(product.product_categories?.category_name || "")}</small></td>
        <td>${esc(item.service_type === "rental" ? "貸与" : item.service_type === "sale" ? "販売" : "自費")}</td>
        <td>${esc(item.selection_reason)}</td>
        <td>${esc(item.expected_effect)}</td>
        <td>${esc(item.usage_method)}</td>
        <td>${esc(item.caution_note || "－")}</td>
        <td>${product.selection_option ? `${choiceLabel(explanation?.client_choice)}<br><small>${esc(explanation?.choice_reason || "")}</small>` : "対象外"}</td>
      </tr>`;
    }).join("");
  }

  function render(data) {
    const { plan, client, assessment, care_manager: careManager, creator } = data;
    const draft = plan.status !== "active";
    q("#plan-document").innerHTML = `
      <section class="plan-print-sheet">
        ${draft ? '<div class="plan-draft-watermark">下書き・未発行</div>' : ""}
        <header class="plan-print-header">
          <div><p class="plan-print-brand">DPRO 福祉用具センター</p><h1>福祉用具サービス計画書</h1></div>
          <div class="plan-number-box"><span>計画番号</span><strong>${esc(plan.plan_number)}</strong><span>第${esc(plan.revision)}版</span></div>
        </header>

        <table class="plan-info-table"><tbody>
          <tr><th>利用者氏名</th><td>${esc(client.client_name)} 様</td><th>利用者番号</th><td>${esc(client.client_number)}</td></tr>
          <tr><th>生年月日</th><td>${dateText(client.birth_date)}</td><th>要介護度</th><td>${esc(client.care_level || "－")}</td></tr>
          <tr><th>住所</th><td colspan="3">${esc(client.address || "－")}</td></tr>
          <tr><th>ケアマネジャー</th><td>${esc(careManager?.manager_name || "－")}</td><th>作成担当</th><td>${esc(creator?.staff_name || "－")}${creator?.license_number ? `<br><small>${esc(creator.license_number)}</small>` : ""}</td></tr>
          <tr><th>計画日</th><td>${dateText(plan.plan_date)}</td><th>利用開始日</th><td>${dateText(plan.service_start_date)}</td></tr>
          <tr><th>次回モニタリング</th><td>${dateText(plan.monitoring_due_date)}</td><th>発行日時</th><td>${datetimeText(plan.issued_at)}</td></tr>
        </tbody></table>

        <section class="plan-print-section"><h2>アセスメントに基づく課題と希望</h2>
          <dl class="plan-print-dl"><dt>生活上の課題</dt><dd>${esc(plan.living_challenges || assessment?.living_challenges || "－")}</dd><dt>利用者・家族の希望</dt><dd>${esc(plan.client_wishes || assessment?.client_wishes || "－")}</dd><dt>計画目標</dt><dd>${esc(plan.goals || "－")}</dd><dt>サービス内容</dt><dd>${esc(plan.service_summary || "－")}</dd></dl>
        </section>

        <section class="plan-print-section"><h2>選定した福祉用具と支援内容</h2>
          <table class="plan-item-table"><thead><tr><th>No.</th><th>商品</th><th>区分</th><th>選定理由</th><th>期待効果</th><th>使用方法</th><th>注意事項</th><th>選択制説明</th></tr></thead><tbody>${itemRows(data) || '<tr><td colspan="8">用具未登録</td></tr>'}</tbody></table>
        </section>

        <section class="plan-print-section plan-agreement-print"><h2>説明・同意</h2>
          <p>上記の計画内容、福祉用具の使用方法、安全上の注意、費用および貸与・販売選択制の対象用具について説明を受けました。</p>
          <div class="agreement-lines"><div><span>同意者氏名</span><strong>${esc(plan.agreed_by_name || "未確認")}</strong></div><div><span>本人との関係</span><strong>${esc(plan.agreed_role || "－")}</strong></div><div><span>同意日時</span><strong>${datetimeText(plan.agreed_at)}</strong></div></div>
          ${plan.agreement_note ? `<p class="agreement-note">補足：${esc(plan.agreement_note)}</p>` : ""}
        </section>

        <footer class="plan-print-footer"><span>${esc(cfg.officeName)}</span><span>${esc(plan.plan_number)} 第${esc(plan.revision)}版</span></footer>
      </section>`;
  }

  async function load() {
    const planId = new URLSearchParams(location.search).get("plan_id");
    if (!planId) {
      q("#plan-document").innerHTML = '<p class="error-text">計画IDが指定されていません。</p>';
      return;
    }
    if (!api?.hasToken()) {
      q("#plan-document").innerHTML = '<div class="notice notice--danger">管理認証がありません。計画画面から「計画書を印刷」を押してください。</div>';
      return;
    }
    try {
      const data = await api.request(`/admin/plans/${encodeURIComponent(planId)}`);
      render(data);
    } catch (error) {
      q("#plan-document").innerHTML = `<p class="error-text">${esc(error.message)}</p>`;
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    q("#print-document")?.addEventListener("click", () => window.print());
    load();
  });
})();
