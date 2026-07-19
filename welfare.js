(() => {
  "use strict";

  const api = window.DPRO_API;
  const cfg = window.DPRO_CONFIG;
  let selectedClient = null;
  let staffOptions = [];
  let careManagerOptions = [];

  const q = (selector, root = document) => root.querySelector(selector);
  const qa = (selector, root = document) => [...root.querySelectorAll(selector)];

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

  function setLoading(button, loading, label = null) {
    if (!button) return;
    if (!button.dataset.originalLabel) {
      button.dataset.originalLabel = button.textContent;
    }
    button.disabled = loading;
    button.textContent = loading
      ? "処理中…"
      : label || button.dataset.originalLabel;
  }

  function showError(target, error) {
    if (!target) return;
    target.textContent = error?.message || String(error || "");
  }

  function selectedClientLabel() {
    return selectedClient
      ? `${selectedClient.client_number} ${selectedClient.client_name}`
      : "既存利用者は選択されていません。";
  }

  function updateSelectedClient(client) {
    selectedClient = client || null;
    const badge = q("#selected-client-badge");
    if (badge) {
      badge.textContent = selectedClientLabel();
      badge.classList.toggle("is-selected", Boolean(selectedClient));
    }
    qa("[data-linked-client-label]").forEach((node) => {
      node.textContent = selectedClient
        ? `連携先：${selectedClientLabel()}`
        : "既存利用者は選択されていません。";
    });
  }

  function setupPublicInquiry() {
    const form = q("#public-inquiry-form");
    if (!form || !api) return;

    const type = new URLSearchParams(location.search).get("type");
    const typeSelect = q("#inquiry-type", form);
    if (type && [...typeSelect.options].some((option) => option.value === type)) {
      typeSelect.value = type;
    }

    const phone = q("#inquiry-phone", form);
    const phoneHelp = q("#inquiry-phone-help");
    phone?.addEventListener("input", () => {
      const normalized = window.DPRO?.normalizePhone(phone.value) || "";
      phoneHelp.textContent = normalized
        ? `確認用：${normalized}`
        : "ハイフンあり・全角・+81形式でも入力できます。";
      phoneHelp.classList.toggle(
        "text-danger",
        normalized.length > 0 && ![10, 11].includes(normalized.length)
      );
    });

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const button = q("#inquiry-submit");
      const error = q("#inquiry-error");
      showError(error, "");
      setLoading(button, true);

      try {
        const body = formObject(form);
        body.office_code = cfg.officeCode;
        const data = await api.request("/inquiries", {
          method: "POST",
          admin: false,
          body,
        });
        q("#inquiry-number").textContent = data.inquiry.inquiry_number;
        q("#inquiry-success-message").textContent = data.message;
        q("#inquiry-success").hidden = false;
        form.reset();
        q("#inquiry-success").scrollIntoView({ behavior: "smooth", block: "start" });
      } catch (err) {
        showError(error, err);
      } finally {
        setLoading(button, false);
      }
    });
  }

  function fillSelects() {
    qa("[data-staff-select]").forEach((select) => {
      const current = select.value;
      select.innerHTML =
        '<option value="">未割当</option>' +
        staffOptions.map((staff) =>
          `<option value="${esc(staff.id)}">${esc(staff.staff_name)}（${esc(staff.role)}）</option>`
        ).join("");
      select.value = current;
    });

    qa("[data-care-manager-select]").forEach((select) => {
      const current = select.value;
      select.innerHTML =
        '<option value="">選択してください</option>' +
        careManagerOptions.map((manager) => {
          const officeName = manager.care_support_offices?.support_office_name || "";
          return `<option value="${esc(manager.id)}">${esc(manager.manager_name)}${officeName ? `｜${esc(officeName)}` : ""}</option>`;
        }).join("");
      select.value = current;
    });
  }

  async function loadOptions() {
    const [staffData, managerData] = await Promise.all([
      api.request("/admin/staff"),
      api.request("/admin/care-managers"),
    ]);
    staffOptions = staffData.staff || [];
    careManagerOptions = managerData.care_managers || [];
    fillSelects();
  }

  function renderClientCandidates(candidates, target) {
    if (!target) return;
    if (!candidates?.length) {
      target.innerHTML = '<div class="notice notice--info">一致する既存利用者は見つかりませんでした。</div>';
      return;
    }

    target.innerHTML = candidates.map((client) => `
      <article class="result-card">
        <div>
          <p class="eyebrow">${esc(client.client_number)}</p>
          <h3>${esc(client.client_name)}</h3>
          <p>${esc(client.birth_date || "生年月日未登録")}｜${esc(client.phone || "電話未登録")}</p>
          <p>${esc(client.address || "住所未登録")}</p>
          <p class="help">一致理由：${esc((client.match_reasons || []).join("・"))}</p>
        </div>
        <button class="button button--secondary button--small select-client"
          type="button"
          data-client='${esc(JSON.stringify(client))}'>この利用者を選択</button>
      </article>
    `).join("");
  }

  async function loadInquiries() {
    const target = q("#inquiry-list");
    if (!target) return;
    target.innerHTML = '<p class="help">読み込み中…</p>';

    try {
      const data = await api.request("/admin/inquiries?limit=50");
      const inquiries = data.inquiries || [];
      if (!inquiries.length) {
        target.innerHTML = '<div class="notice notice--info">未完了の相談はありません。</div>';
        return;
      }

      target.innerHTML = inquiries.map((item) => {
        const client = item.clients;
        const assigned = item.assigned_staff;
        return `
          <article class="inquiry-row" data-inquiry-id="${esc(item.id)}">
            <div class="inquiry-row__main">
              <div class="inquiry-row__head">
                <strong>${esc(item.inquiry_number)}</strong>
                <span class="status ${item.urgency === "emergency" ? "status--danger" : item.urgency === "high" ? "status--warning" : "status--info"}">${esc(item.urgency)}</span>
                <span class="status status--info">${esc(item.status)}</span>
              </div>
              <h3>${esc(item.contact_name)}｜${esc(item.inquiry_type)}</h3>
              <p>${esc(item.summary).replace(/\n/g, "<br>")}</p>
              <p class="help">
                ${esc(item.phone || "電話未登録")}　
                ${client ? `利用者：${esc(client.client_number)} ${esc(client.client_name)}` : `重複候補：${esc(item.client_candidate_count)}件`}
              </p>
            </div>
            <div class="inquiry-row__actions">
              <select class="inquiry-assignee">
                <option value="">未割当</option>
                ${staffOptions.map((staff) =>
                  `<option value="${esc(staff.id)}" ${item.assigned_staff_id === staff.id ? "selected" : ""}>${esc(staff.staff_name)}</option>`
                ).join("")}
              </select>
              <select class="inquiry-status">
                ${["open","assigned","in_progress","resolved","closed"].map((status) =>
                  `<option value="${status}" ${item.status === status ? "selected" : ""}>${status}</option>`
                ).join("")}
              </select>
              <button class="button button--outline button--small save-inquiry" type="button">更新</button>
              ${selectedClient && !item.client_id
                ? '<button class="button button--secondary button--small link-inquiry-client" type="button">選択利用者へ連携</button>'
                : ""}
              <span class="help">${assigned ? `担当：${esc(assigned.staff_name)}` : "担当未割当"}</span>
            </div>
          </article>`;
      }).join("");
    } catch (err) {
      target.innerHTML = `<p class="error-text">${esc(err.message)}</p>`;
    }
  }

  function setupOwnerManagement() {
    const panel = q("#client-inquiry-panel");
    if (!panel || !api) return;

    const initialize = async () => {
      try {
        await loadOptions();
        await loadInquiries();
      } catch (err) {
        q("#inquiry-list").innerHTML = `<p class="error-text">${esc(err.message)}</p>`;
      }
    };

    document.addEventListener("dpro-admin-ready", initialize, { once: true });
    if (
      sessionStorage.getItem("dpro_welfare_admin_ok") === "1" &&
      api.hasToken()
    ) {
      initialize();
    }

    q("#clear-client-selection")?.addEventListener("click", () => {
      updateSelectedClient(null);
      q("#client-search-results").innerHTML = "";
    });

    q("#client-search-form")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const error = q("#client-search-error");
      showError(error, "");
      const form = event.currentTarget;
      const button = q('button[type="submit"]', form);
      setLoading(button, true);
      try {
        const data = await api.request("/clients/search", {
          method: "POST",
          body: formObject(form),
        });
        renderClientCandidates(data.candidates, q("#client-search-results"));
      } catch (err) {
        showError(error, err);
      } finally {
        setLoading(button, false);
      }
    });

    q("#client-search-results")?.addEventListener("click", (event) => {
      const button = event.target.closest(".select-client");
      if (!button) return;
      try {
        updateSelectedClient(JSON.parse(button.dataset.client));
        window.DPRO?.toast("利用者を選択しました。");
        loadInquiries();
      } catch {
        showError(q("#client-search-error"), "利用者を選択できませんでした。");
      }
    });

    q("#admin-inquiry-form")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const error = q("#admin-inquiry-error");
      showError(error, "");
      const button = q('button[type="submit"]', form);
      setLoading(button, true);
      try {
        const body = formObject(form);
        if (selectedClient) body.client_id = selectedClient.client_id;
        const data = await api.request("/admin/inquiries", {
          method: "POST",
          body,
        });
        form.reset();
        fillSelects();
        window.DPRO?.toast(`受付 ${data.inquiry.inquiry_number} を登録しました。`);
        await loadInquiries();
      } catch (err) {
        showError(error, err);
      } finally {
        setLoading(button, false);
      }
    });

    q("#referral-form")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const error = q("#referral-error");
      showError(error, "");
      const button = q('button[type="submit"]', form);
      setLoading(button, true);
      try {
        const body = formObject(form);
        body.requested_categories = String(body.requested_categories || "")
          .split(/[、,]/)
          .map((item) => item.trim())
          .filter(Boolean);
        if (selectedClient) body.client_id = selectedClient.client_id;
        const data = await api.request("/admin/referrals", {
          method: "POST",
          body,
        });
        form.reset();
        fillSelects();
        window.DPRO?.toast(`紹介 ${data.referral.referral_number} を登録しました。`);
      } catch (err) {
        showError(error, err);
      } finally {
        setLoading(button, false);
      }
    });

    q("#new-client-form")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const error = q("#new-client-error");
      const candidateTarget = q("#new-client-candidates");
      showError(error, "");
      candidateTarget.innerHTML = "";
      const button = q('button[type="submit"]', form);
      setLoading(button, true);
      try {
        const data = await api.request("/clients", {
          method: "POST",
          body: formObject(form),
        });
        updateSelectedClient({
          client_id: data.client.id,
          client_number: data.client.client_number,
          client_name: data.client.client_name,
          birth_date: data.client.birth_date,
          phone: data.client.phone,
          address: data.client.address,
          match_reasons: ["新規登録"],
        });
        form.reset();
        window.DPRO?.toast("新規利用者を登録しました。");
      } catch (err) {
        showError(error, err);
        if (err.code === "CLIENT_DUPLICATE_CANDIDATES") {
          renderClientCandidates(err.details?.candidates || [], candidateTarget);
        }
      } finally {
        setLoading(button, false);
      }
    });

    q("#new-client-candidates")?.addEventListener("click", (event) => {
      const button = event.target.closest(".select-client");
      if (!button) return;
      updateSelectedClient(JSON.parse(button.dataset.client));
      window.DPRO?.toast("既存利用者を選択しました。");
    });

    q("#family-form")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const error = q("#family-error");
      showError(error, "");
      if (!selectedClient) {
        showError(error, "先に既存利用者を検索・選択してください。");
        return;
      }
      const button = q('button[type="submit"]', form);
      setLoading(button, true);
      try {
        await api.request(`/clients/${selectedClient.client_id}/family`, {
          method: "POST",
          body: formObject(form),
        });
        form.reset();
        window.DPRO?.toast("家族連絡先を追加しました。");
      } catch (err) {
        showError(error, err);
      } finally {
        setLoading(button, false);
      }
    });

    q("#reload-inquiries")?.addEventListener("click", loadInquiries);

    q("#inquiry-list")?.addEventListener("click", async (event) => {
      const row = event.target.closest("[data-inquiry-id]");
      if (!row) return;
      const inquiryId = row.dataset.inquiryId;

      if (event.target.closest(".save-inquiry")) {
        const button = event.target.closest(".save-inquiry");
        setLoading(button, true);
        try {
          await api.request(`/admin/inquiries/${inquiryId}/assign`, {
            method: "PATCH",
            body: {
              assigned_staff_id: q(".inquiry-assignee", row).value || null,
              status: q(".inquiry-status", row).value,
            },
          });
          window.DPRO?.toast("相談の担当・状態を更新しました。");
          await loadInquiries();
        } catch (err) {
          window.DPRO?.toast(err.message);
        } finally {
          setLoading(button, false);
        }
      }

      if (event.target.closest(".link-inquiry-client")) {
        if (!selectedClient) return;
        const button = event.target.closest(".link-inquiry-client");
        setLoading(button, true);
        try {
          await api.request(`/admin/inquiries/${inquiryId}/link-client`, {
            method: "PATCH",
            body: { client_id: selectedClient.client_id },
          });
          window.DPRO?.toast("相談を選択利用者へ連携しました。");
          await loadInquiries();
        } catch (err) {
          window.DPRO?.toast(err.message);
        } finally {
          setLoading(button, false);
        }
      }
    });
  }

  function setupLiveSystemCheck() {
    const target = q("#backend-checks");
    const button = q("#run-check");
    if (!target || !api || !button) return;

    const run = async () => {
      target.innerHTML = '<p class="help">Worker・Supabaseを確認中…</p>';
      try {
        const data = await api.request(
          `/system-check?admin_code=${encodeURIComponent(cfg.adminCode)}`,
          { admin: false }
        );
        const items = [
          ["Cloudflare Worker API", data.worker?.ok],
          ["Supabase・RLS・必須テーブル", data.database?.ok],
          ["非公開Storage", data.database?.tests?.private_storage_bucket],
          ["用具個体の期間重複防止", data.database?.tests?.rental_overlap_trigger],
          ["相談・紹介・利用者管理", data.inquiry_workflow?.ok],
        ];
        target.innerHTML = items.map(([label, ok]) =>
          `<div class="check-row"><span>${esc(label)}</span><span class="status ${ok ? "status--success" : "status--danger"}">${ok ? "OK" : "NG"}</span></div>`
        ).join("");
      } catch (err) {
        target.innerHTML = `<p class="error-text">${esc(err.message)}</p>`;
      }
    };

    button.addEventListener("click", run);
    run();
  }

  document.addEventListener("DOMContentLoaded", () => {
    setupPublicInquiry();
    setupOwnerManagement();
    setupLiveSystemCheck();
  });
})();
