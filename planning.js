(() => {
  "use strict";

  const api = window.DPRO_API;
  const cfg = window.DPRO_CONFIG;
  const q = (selector, root = document) => root.querySelector(selector);
  const qa = (selector, root = document) => [...root.querySelectorAll(selector)];

  const state = {
    client: null,
    case: null,
    assessment: null,
    plan: null,
    planDetail: null,
    staff: [],
    products: [],
    workspace: null,
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
    if (!button.dataset.original) button.dataset.original = button.textContent;
    button.disabled = loading;
    button.textContent = loading ? "処理中…" : button.dataset.original;
  }

  function showError(target, error) {
    if (target) target.textContent = error?.message || String(error || "");
  }

  function toIso(localValue) {
    if (!localValue) return null;
    const date = new Date(localValue);
    return Number.isNaN(date.getTime()) ? localValue : date.toISOString();
  }

  function toLocalDateTime(value) {
    const date = value ? new Date(value) : new Date();
    if (Number.isNaN(date.getTime())) return "";
    const pad = (number) => String(number).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  function today() {
    const date = new Date();
    const pad = (number) => String(number).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}`;
  }

  function futureDate(days) {
    const date = new Date(Date.now() + days * 86400000);
    const pad = (number) => String(number).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}`;
  }

  function statusLabel(status) {
    return ({
      draft: "下書き", completed: "完了", proposed: "提案中", agreed: "同意済み",
      active: "有効", revised: "改訂済み", ended: "終了",
      inquiry: "相談", assessment: "アセスメント", selection: "選定",
      planning: "計画作成", contract: "契約", returning: "回収", closed: "終了",
    })[status] || status || "未作成";
  }

  function setStep(name, stateName) {
    const node = q(`[data-plan-step="${name}"]`);
    if (!node) return;
    node.classList.remove("is-current", "is-complete");
    if (stateName) node.classList.add(stateName);
  }

  function updateProgress() {
    setStep("client", state.client ? "is-complete" : "is-current");
    setStep("assessment", state.assessment?.status === "completed" ? "is-complete" : state.client ? "is-current" : "");
    setStep("plan", state.plan ? (state.plan.status === "active" ? "is-complete" : "is-current") : state.assessment?.status === "completed" ? "is-current" : "");
    setStep("items", state.planDetail?.items?.length ? "is-complete" : state.plan ? "is-current" : "");
    setStep("agreement", state.plan?.status === "active" ? "is-complete" : state.planDetail?.items?.length ? "is-current" : "");
  }

  function fillSelects() {
    qa("[data-planning-staff]").forEach((select) => {
      const current = select.value;
      select.innerHTML = '<option value="">選択してください</option>' +
        state.staff.map((staff) => `<option value="${esc(staff.id)}">${esc(staff.staff_name)}（${esc(staff.role)}）</option>`).join("");
      select.value = current;
    });
    qa("[data-planning-product]").forEach((select) => {
      const current = select.value;
      select.innerHTML = '<option value="">選択してください</option>' +
        state.products.map((product) => `<option value="${esc(product.id)}">${esc(product.product_code)}｜${esc(product.product_name)}${product.selection_option ? "｜貸与・販売選択制" : ""}</option>`).join("");
      select.value = current;
    });
  }

  async function loadMasterData() {
    const [staffData, productData] = await Promise.all([
      api.request("/admin/staff"),
      api.request("/admin/products?active_only=true"),
    ]);
    state.staff = staffData.staff || [];
    state.products = productData.products || [];
    fillSelects();
  }

  function renderClientCandidates(candidates) {
    const target = q("#planning-client-results");
    if (!target) return;
    if (!candidates?.length) {
      target.innerHTML = '<div class="notice notice--info">一致する利用者は見つかりませんでした。</div>';
      return;
    }
    target.innerHTML = candidates.map((client) => `
      <article class="result-card">
        <div><p class="eyebrow">${esc(client.client_number)}</p><h3>${esc(client.client_name)}</h3><p>${esc(client.birth_date || "生年月日未登録")}｜${esc(client.phone || "電話未登録")}</p><p>${esc(client.address || "住所未登録")}</p><p class="help">一致理由：${esc((client.match_reasons || []).join("・"))}</p></div>
        <button class="button button--secondary button--small select-planning-client" type="button" data-client='${esc(JSON.stringify(client))}'>この利用者を選択</button>
      </article>`).join("");
  }

  function clearState() {
    state.client = null; state.case = null; state.assessment = null; state.plan = null; state.planDetail = null; state.workspace = null;
    q("#planning-current")?.setAttribute("hidden", "");
    q("#assessment-section")?.setAttribute("hidden", "");
    q("#plan-section")?.setAttribute("hidden", "");
    q("#plan-items-section")?.setAttribute("hidden", "");
    q("#agreement-section")?.setAttribute("hidden", "");
    const badge = q("#planning-client-badge");
    if (badge) { badge.textContent = "利用者未選択"; badge.classList.remove("is-selected"); }
    updateProgress();
  }

  async function selectClient(client) {
    state.client = client;
    const badge = q("#planning-client-badge");
    if (badge) { badge.textContent = `${client.client_number} ${client.client_name}`; badge.classList.add("is-selected"); }
    q("#planning-current")?.removeAttribute("hidden");
    q("#planning-current-client").textContent = `${client.client_number} ${client.client_name} 様`;
    await loadWorkspace();
  }

  async function loadWorkspace() {
    if (!state.client) return;
    showError(q("#planning-workspace-error"), "");
    try {
      const data = await api.request(`/admin/planning/workspace?client_id=${encodeURIComponent(state.client.client_id)}`);
      state.workspace = data;
      state.client = { ...state.client, ...data.client, client_id: data.client.id };
      state.case = (data.cases || []).find((item) => item.status !== "closed") || null;
      const assessments = data.assessments || [];
      state.assessment = assessments.find((item) => item.status === "draft") || assessments.find((item) => item.status === "completed") || null;
      const plans = data.plans || [];
      state.plan = plans.find((item) => ["draft","proposed","agreed"].includes(item.status)) || plans.find((item) => item.status === "active") || plans[0] || null;
      state.planDetail = state.plan ? await api.request(`/admin/plans/${state.plan.id}`) : null;
      renderWorkspace();
    } catch (error) {
      showError(q("#planning-workspace-error"), error);
    }
  }

  function renderWorkspace() {
    q("#planning-case-status").textContent = state.case ? `${state.case.case_number}｜${statusLabel(state.case.status)}` : "未作成";
    q("#planning-assessment-status").textContent = state.assessment ? `${state.assessment.assessment_number}｜${statusLabel(state.assessment.status)}` : "未作成";
    q("#planning-plan-status").textContent = state.plan ? `${state.plan.plan_number} 第${state.plan.revision}版｜${statusLabel(state.plan.status)}` : "未作成";

    if (state.case) q("#assessment-section")?.removeAttribute("hidden"); else q("#assessment-section")?.setAttribute("hidden", "");
    populateAssessment();

    if (state.assessment?.status === "completed") q("#plan-section")?.removeAttribute("hidden"); else q("#plan-section")?.setAttribute("hidden", "");
    populatePlan();

    if (state.plan) {
      q("#plan-items-section")?.removeAttribute("hidden");
      q("#agreement-section")?.removeAttribute("hidden");
    } else {
      q("#plan-items-section")?.setAttribute("hidden", "");
      q("#agreement-section")?.setAttribute("hidden", "");
    }
    renderPlanItems();
    renderExplanationForm();
    updateProgress();
  }

  function populateAssessment() {
    const form = q("#assessment-form");
    if (!form) return;
    const a = state.assessment;
    form.reset();
    form.elements.assessed_at.value = toLocalDateTime(a?.assessed_at || new Date());
    if (a?.assessed_by) form.elements.assessed_by.value = a.assessed_by;
    for (const key of ["mobility","transfer_status","sleeping_status","bathing_status","toileting_status","caregiver_status","living_challenges","client_wishes","selection_cautions","assessment_summary"]) {
      form.elements[key].value = a?.[key] || "";
    }
    form.elements.height_cm.value = a?.body_measurements?.height_cm ?? "";
    form.elements.weight_kg.value = a?.body_measurements?.weight_kg ?? "";
    const env = a?.environment_detail || {};
    for (const key of ["entrance_step","stairs","narrow_corridor","elevator","carrying_route_issue"]) form.elements[key].checked = Boolean(env[key]);
    const risks = a?.risk_factors || {};
    for (const key of ["fall_risk","pressure_ulcer_risk","entrapment_risk","caregiver_burden","cognitive_risk"]) form.elements[key].checked = Boolean(risks[key]);
    const editable = !a || a.status === "draft";
    qa("input,textarea,select,button", form).forEach((node) => node.disabled = !editable);
    const complete = q("#complete-assessment"); if (complete) complete.disabled = !a || a.status !== "draft";
    const newButton = q("#new-assessment"); if (newButton) newButton.hidden = !a || a.status !== "completed";
  }

  function assessmentBody() {
    const form = q("#assessment-form");
    const data = formObject(form);
    return {
      client_id: state.client.client_id,
      case_id: state.case.id,
      assessed_at: toIso(data.assessed_at),
      assessed_by: data.assessed_by,
      mobility: data.mobility, transfer_status: data.transfer_status,
      sleeping_status: data.sleeping_status, bathing_status: data.bathing_status,
      toileting_status: data.toileting_status, caregiver_status: data.caregiver_status,
      body_measurements: { height_cm: data.height_cm ? Number(data.height_cm) : null, weight_kg: data.weight_kg ? Number(data.weight_kg) : null },
      environment_detail: { entrance_step:data.entrance_step, stairs:data.stairs, narrow_corridor:data.narrow_corridor, elevator:data.elevator, carrying_route_issue:data.carrying_route_issue },
      risk_factors: { fall_risk:data.fall_risk, pressure_ulcer_risk:data.pressure_ulcer_risk, entrapment_risk:data.entrapment_risk, caregiver_burden:data.caregiver_burden, cognitive_risk:data.cognitive_risk },
      adl_status: {}, home_environment: {},
      living_challenges:data.living_challenges, client_wishes:data.client_wishes,
      selection_cautions:data.selection_cautions, assessment_summary:data.assessment_summary,
    };
  }

  function populatePlan() {
    const form = q("#plan-form"); if (!form) return;
    const p = state.planDetail?.plan || state.plan;
    form.reset();
    form.elements.plan_date.value = p?.plan_date || today();
    form.elements.service_start_date.value = p?.service_start_date || today();
    form.elements.monitoring_due_date.value = p?.monitoring_due_date || futureDate(90);
    form.elements.client_wishes.value = p?.client_wishes || state.assessment?.client_wishes || "";
    form.elements.living_challenges.value = p?.living_challenges || state.assessment?.living_challenges || "";
    form.elements.goals.value = p?.goals || "";
    form.elements.service_summary.value = p?.service_summary || "";
    if (p?.created_by) form.elements.created_by.value = p.created_by;
    const editable = !p || ["draft","proposed"].includes(p.status);
    qa("input,textarea,select,button", form).forEach((node) => node.disabled = !editable);
    q("#revise-plan").hidden = p?.status !== "active";
    q("#print-plan").hidden = !p;
    qa("#plan-item-form input,#plan-item-form textarea,#plan-item-form select,#plan-item-form button").forEach((node) => node.disabled = !p || !["draft","proposed"].includes(p.status));
    qa("#selection-explanation-form input,#selection-explanation-form textarea,#selection-explanation-form select,#selection-explanation-form button").forEach((node) => node.disabled = !p || !["draft","proposed"].includes(p.status));
    qa("#activate-plan-form input,#activate-plan-form textarea,#activate-plan-form select,#activate-plan-form button").forEach((node) => node.disabled = !p || !["draft","proposed","agreed"].includes(p.status));
  }

  function renderPlanItems() {
    const target = q("#plan-item-list"); if (!target) return;
    const items = state.planDetail?.items || [];
    q("#plan-item-count").textContent = `${items.length}件`;
    if (!items.length) { target.innerHTML = '<div class="notice notice--info">用具はまだ追加されていません。</div>'; return; }
    const editable = ["draft","proposed"].includes(state.planDetail?.plan?.status);
    target.innerHTML = items.map((item) => {
      const product = item.product_models || {};
      return `<article class="plan-item-card"><div class="plan-item-card__head"><div><p class="eyebrow">${esc(product.product_code || "")}</p><h3>${esc(product.product_name || "商品")}</h3></div><div><span class="status status--info">${esc(item.service_type)}</span>${product.selection_option ? '<span class="status status--warning">選択説明必要</span>' : ''}</div></div><dl><dt>選定理由</dt><dd>${esc(item.selection_reason)}</dd><dt>期待効果</dt><dd>${esc(item.expected_effect)}</dd><dt>使用方法</dt><dd>${esc(item.usage_method)}</dd>${item.caution_note ? `<dt>注意</dt><dd>${esc(item.caution_note)}</dd>` : ""}</dl>${editable ? `<button class="button button--outline button--small delete-plan-item" data-item-id="${esc(item.id)}" type="button">計画から削除</button>` : ""}</article>`;
    }).join("");
  }

  function renderExplanationForm() {
    const select = q("#selection-plan-item"); if (!select) return;
    const items = (state.planDetail?.items || []).filter((item) => item.product_models?.selection_option);
    const current = select.value;
    select.innerHTML = '<option value="">選択してください</option>' + items.map((item) => `<option value="${esc(item.id)}">${esc(item.product_models.product_name)}</option>`).join("");
    if (items.some((item) => item.id === current)) select.value = current;
    fillExplanationForSelected();
  }

  function fillExplanationForSelected() {
    const form = q("#selection-explanation-form"); if (!form) return;
    const itemId = form.elements.plan_item_id.value;
    const explanation = (state.planDetail?.explanations || []).find((item) => item.plan_item_id === itemId);
    for (const key of ["rental_explanation","sale_explanation","cost_comparison","care_manager_opinion","choice_reason","confirmed_by_name"]) form.elements[key].value = explanation?.[key] || "";
    form.elements.client_choice.value = explanation?.client_choice || "pending";
    form.elements.agreed.checked = Boolean(explanation?.agreed);
    if (explanation?.explained_by) form.elements.explained_by.value = explanation.explained_by;
  }

  async function refreshPlanDetail() {
    if (!state.plan?.id) { state.planDetail = null; return; }
    state.planDetail = await api.request(`/admin/plans/${state.plan.id}`);
    state.plan = state.planDetail.plan;
    renderWorkspace();
  }

  function setupWorkspaceEvents() {
    q("#planning-client-search")?.addEventListener("submit", async (event) => {
      event.preventDefault(); const button=q('button[type="submit"]',event.currentTarget); setLoading(button,true); showError(q("#planning-client-error"),"");
      try { const data=await api.request("/clients/search",{method:"POST",body:formObject(event.currentTarget)}); renderClientCandidates(data.candidates||[]); }
      catch(error){showError(q("#planning-client-error"),error);} finally{setLoading(button,false);}
    });
    q("#planning-client-results")?.addEventListener("click",(event)=>{const button=event.target.closest(".select-planning-client");if(!button)return;selectClient(JSON.parse(button.dataset.client));});
    q("#planning-clear-client")?.addEventListener("click",()=>{clearState();q("#planning-client-results").innerHTML="";});
    q("#reload-workspace")?.addEventListener("click",loadWorkspace);

    q("#ensure-case")?.addEventListener("click",async(event)=>{const button=event.currentTarget;setLoading(button,true);showError(q("#planning-workspace-error"),"");try{const staffId=q('[data-planning-staff]')?.value||null;await api.request("/admin/planning/cases/ensure",{method:"POST",body:{client_id:state.client.client_id,primary_staff_id:staffId}});await loadWorkspace();window.DPRO?.toast("案件を準備しました。");}catch(error){showError(q("#planning-workspace-error"),error);}finally{setLoading(button,false);}});

    q("#assessment-form")?.addEventListener("submit",async(event)=>{event.preventDefault();const button=q('button[type="submit"]',event.currentTarget);setLoading(button,true);showError(q("#assessment-error"),"");try{if(!state.case)throw new Error("先に案件を準備してください。");const body=assessmentBody();const data=state.assessment?.status==="draft"?await api.request(`/admin/assessments/${state.assessment.id}`,{method:"PATCH",body}):await api.request("/admin/assessments",{method:"POST",body});state.assessment=data.assessment;window.DPRO?.toast("アセスメントを保存しました。");await loadWorkspace();}catch(error){showError(q("#assessment-error"),error);}finally{setLoading(button,false);}});
    q("#complete-assessment")?.addEventListener("click",async(event)=>{const button=event.currentTarget;setLoading(button,true);showError(q("#assessment-error"),"");try{if(!state.assessment?.id)throw new Error("先に下書きを保存してください。");await api.request(`/admin/assessments/${state.assessment.id}/complete`,{method:"POST",body:{}});window.DPRO?.toast("アセスメントを完了しました。");await loadWorkspace();}catch(error){showError(q("#assessment-error"),error);}finally{setLoading(button,false);}});
    q("#new-assessment")?.addEventListener("click",()=>{state.assessment=null;populateAssessment();window.DPRO?.toast("新しいアセスメントを入力できます。");});

    q("#plan-form")?.addEventListener("submit",async(event)=>{event.preventDefault();const form=event.currentTarget;const button=q('button[type="submit"]',form);setLoading(button,true);showError(q("#plan-error"),"");try{const body=formObject(form);body.client_id=state.client.client_id;body.case_id=state.case.id;body.assessment_id=state.assessment.id;const data=state.plan&&["draft","proposed"].includes(state.plan.status)?await api.request(`/admin/plans/${state.plan.id}`,{method:"PATCH",body}):await api.request("/admin/plans",{method:"POST",body});state.plan=data.plan;window.DPRO?.toast("計画を保存しました。");await refreshPlanDetail();}catch(error){showError(q("#plan-error"),error);}finally{setLoading(button,false);}});
    q("#revise-plan")?.addEventListener("click",async(event)=>{if(!state.plan?.id)return;const button=event.currentTarget;setLoading(button,true);showError(q("#plan-error"),"");try{const data=await api.request(`/admin/plans/${state.plan.id}/revise`,{method:"POST",body:{staff_id:q('[name="created_by"]',q("#plan-form"))?.value||null}});state.plan={id:data.result.plan_id,status:"draft",plan_number:data.result.plan_number,revision:data.result.revision};window.DPRO?.toast("計画の改訂版を作成しました。");await refreshPlanDetail();}catch(error){showError(q("#plan-error"),error);}finally{setLoading(button,false);}});
    q("#print-plan")?.addEventListener("click",()=>{if(state.plan?.id)window.open(`plan-print.html?plan_id=${encodeURIComponent(state.plan.id)}`,"_blank");});

    q("#plan-item-form")?.addEventListener("submit",async(event)=>{event.preventDefault();const button=q('button[type="submit"]',event.currentTarget);setLoading(button,true);showError(q("#plan-item-error"),"");try{if(!state.plan?.id)throw new Error("先に計画を保存してください。");await api.request(`/admin/plans/${state.plan.id}/items`,{method:"POST",body:formObject(event.currentTarget)});event.currentTarget.reset();event.currentTarget.elements.quantity.value="1";window.DPRO?.toast("用具を計画へ追加しました。");await refreshPlanDetail();}catch(error){showError(q("#plan-item-error"),error);}finally{setLoading(button,false);}});
    q("#plan-item-list")?.addEventListener("click",async(event)=>{const button=event.target.closest(".delete-plan-item");if(!button)return;if(!confirm("この用具を計画から削除しますか？"))return;setLoading(button,true);try{await api.request(`/admin/plan-items/${button.dataset.itemId}`,{method:"DELETE"});window.DPRO?.toast("用具を計画から削除しました。");await refreshPlanDetail();}catch(error){showError(q("#plan-item-error"),error);}finally{setLoading(button,false);}});

    q("#selection-plan-item")?.addEventListener("change",fillExplanationForSelected);
    q("#selection-explanation-form")?.addEventListener("submit",async(event)=>{event.preventDefault();const button=q('button[type="submit"]',event.currentTarget);setLoading(button,true);showError(q("#selection-explanation-error"),"");try{if(!state.plan?.id)throw new Error("計画がありません。");const body=formObject(event.currentTarget);await api.request(`/admin/plans/${state.plan.id}/selection-explanations`,{method:"POST",body});window.DPRO?.toast("貸与・販売の説明記録を保存しました。");await refreshPlanDetail();}catch(error){showError(q("#selection-explanation-error"),error);}finally{setLoading(button,false);}});

    q("#activate-plan-form")?.addEventListener("submit",async(event)=>{event.preventDefault();const button=q('button[type="submit"]',event.currentTarget);setLoading(button,true);showError(q("#activate-plan-error"),"");try{if(!state.plan?.id)throw new Error("計画がありません。");await api.request(`/admin/plans/${state.plan.id}/activate`,{method:"POST",body:formObject(event.currentTarget)});window.DPRO?.toast("計画を有効化しました。");await loadWorkspace();}catch(error){showError(q("#activate-plan-error"),error);}finally{setLoading(button,false);}});
  }

  async function loadOwnerOverview() {
    const target=q("#owner-plan-list");if(!target||!api)return;target.innerHTML='<p class="help">読み込み中…</p>';
    try{const data=await api.request("/admin/plans?limit=12");const plans=data.plans||[];if(!plans.length){target.innerHTML='<div class="notice notice--info">計画はまだありません。</div>';return;}target.innerHTML=plans.map((plan)=>`<article class="plan-overview-row"><div><p class="eyebrow">${esc(plan.plan_number)} 第${esc(plan.revision)}版</p><h3>${esc(plan.clients?.client_name||"利用者")}</h3><p>計画日 ${esc(plan.plan_date)}｜モニタリング ${esc(plan.monitoring_due_date||"未設定")}</p></div><div><span class="status ${plan.status==="active"?"status--success":plan.status==="draft"?"status--warning":"status--info"}">${esc(statusLabel(plan.status))}</span><a class="button button--outline button--small" href="planning.html">開く</a></div></article>`).join("");}catch(error){target.innerHTML=`<p class="error-text">${esc(error.message)}</p>`;}
  }

  function initializePlanning() {
    if (!q("#planning-workspace")) return;
    Promise.resolve(loadMasterData()).then(()=>{setupWorkspaceEvents();updateProgress();}).catch((error)=>showError(q("#planning-workspace-error"),error));
  }

  function initializeOwnerOverview() {
    if (!q("#owner-planning-panel")) return;
    loadOwnerOverview();
    q("#reload-owner-plans")?.addEventListener("click",loadOwnerOverview);
  }

  document.addEventListener("DOMContentLoaded",()=>{
    document.addEventListener("dpro-admin-ready",()=>{initializePlanning();initializeOwnerOverview();},{once:true});
    if(sessionStorage.getItem("dpro_welfare_admin_ok")==="1"&&api?.hasToken()){initializePlanning();initializeOwnerOverview();}
  });
})();
