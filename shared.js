(() => {
  "use strict";

  const cfg = window.DPRO_CONFIG;

  const demo = Object.freeze({
    summary: {
      newInquiries: 4,
      todayVisits: 7,
      monitoringDue: 6,
      openRepairs: 2,
      rentalAssets: 126,
      readyAssets: 38
    },
    clients: [
      { id: "CL-0001", name: "山田 花子", careLevel: "要介護2", manager: "佐藤 美咲", status: "貸与中" },
      { id: "CL-0002", name: "田中 一郎", careLevel: "要支援2", manager: "中村 健", status: "選定中" },
      { id: "CL-0003", name: "鈴木 春江", careLevel: "要介護3", manager: "佐藤 美咲", status: "モニタリング予定" }
    ],
    equipment: [
      { asset: "AS-1048", name: "自走式車いす", model: "WAVIT+", status: "貸与中", next: "2026-08-05" },
      { asset: "AS-2081", name: "特殊寝台", model: "楽匠プラス", status: "貸与中", next: "2026-08-05" },
      { asset: "AS-3014", name: "歩行器", model: "シンフォニーSP", status: "貸与中", next: "2026-09-12" }
    ],
    visits: [
      { time: "09:30", client: "山田 花子", type: "モニタリング", staff: "佐藤" },
      { time: "11:00", client: "田中 一郎", type: "試用・適合確認", staff: "中村" },
      { time: "13:30", client: "鈴木 春江", type: "納品・設置", staff: "佐藤 / 高橋" },
      { time: "15:30", client: "井上 勇", type: "回収", staff: "高橋" }
    ]
  });

  function q(selector, root = document) {
    return root.querySelector(selector);
  }

  function qa(selector, root = document) {
    return [...root.querySelectorAll(selector)];
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
    }[char]));
  }

  function formatDateJP(value) {
    const date = new Date(`${value}T00:00:00+09:00`);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat("ja-JP", {
      month: "numeric", day: "numeric", weekday: "short", timeZone: cfg.timezone
    }).format(date);
  }

  function setOfficeName() {
    qa("[data-office-name]").forEach((node) => {
      node.textContent = cfg.officeName;
    });
    qa("[data-system-version]").forEach((node) => {
      node.textContent = cfg.version;
    });
  }

  function setupMobileNav() {
    const button = q("[data-nav-toggle]");
    const nav = q("[data-main-nav]");
    const header = button?.closest(".site-header");
    const headerInner = header?.querySelector(".header-inner");
    if (!button || !nav || !header || !headerInner) return;

    const closeMenu = () => {
      nav.classList.remove("is-open");
      button.setAttribute("aria-expanded", "false");
      button.setAttribute("aria-label", "メニューを開く");
    };

    const evaluateNavigation = () => {
      closeMenu();

      // 920px以下は既存のスマートフォン・タブレット用CSSを使用します。
      if (window.matchMedia("(max-width: 920px)").matches) {
        header.classList.remove("nav-compact");
        return;
      }

      // 一度通常表示に戻し、実際にリンクが2段へ折り返すかを測定します。
      header.classList.remove("nav-compact");

      window.requestAnimationFrame(() => {
        const links = qa("a", nav);
        const linkRows = new Set(
          links.map((link) => Math.round(link.getBoundingClientRect().top))
        );

        const headerRect = headerInner.getBoundingClientRect();
        const brandRect = headerInner.querySelector(".brand")?.getBoundingClientRect();
        const navRect = nav.getBoundingClientRect();

        const wrapped = linkRows.size > 1;
        const overlapsBrand = Boolean(
          brandRect &&
          navRect.left < brandRect.right + 12
        );
        const exceedsHeader =
          navRect.right > headerRect.right + 1 ||
          nav.scrollWidth > nav.clientWidth + 1;

        header.classList.toggle(
          "nav-compact",
          wrapped || overlapsBrand || exceedsHeader
        );
      });
    };

    button.addEventListener("click", () => {
      const open = nav.classList.toggle("is-open");
      button.setAttribute("aria-expanded", String(open));
      button.setAttribute(
        "aria-label",
        open ? "メニューを閉じる" : "メニューを開く"
      );
    });

    nav.addEventListener("click", (event) => {
      if (event.target.closest("a")) closeMenu();
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeMenu();
    });

    let resizeTimer = 0;
    window.addEventListener("resize", () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(evaluateNavigation, 80);
    });

    window.addEventListener("load", evaluateNavigation, { once: true });
    document.fonts?.ready?.then(evaluateNavigation);
    evaluateNavigation();
  }

  function setupTabs() {
    qa("[data-tabs]").forEach((container) => {
      const buttons = qa("[data-tab]", container);
      const panels = qa("[data-panel]", container);
      buttons.forEach((button) => {
        button.addEventListener("click", () => {
          const target = button.dataset.tab;
          buttons.forEach((item) => item.classList.toggle("is-active", item === button));
          panels.forEach((panel) => panel.hidden = panel.dataset.panel !== target);
        });
      });
    });
  }

  function setupAdminGate() {
    const gate = q("[data-admin-gate]");
    if (!gate) return;

    const input = q("[data-admin-code]", gate);
    const login = q("[data-admin-login]", gate);
    const clear = q("[data-admin-clear]", gate);
    const error = q("[data-admin-error]", gate);
    const protectedArea = q("[data-protected-area]");

    const unlock = () => {
      protectedArea?.removeAttribute("hidden");
      gate.setAttribute("hidden", "");
      sessionStorage.setItem("dpro_welfare_admin_ok", "1");
      document.dispatchEvent(new CustomEvent("dpro-admin-ready"));
    };

    if (
      sessionStorage.getItem("dpro_welfare_admin_ok") === "1" &&
      window.DPRO_API?.hasToken()
    ) {
      unlock();
      return;
    }

    login?.addEventListener("click", async () => {
      const code = (input?.value || "").trim();
      if (!code) {
        error.textContent = "管理コードを入力してください。";
        input?.focus();
        return;
      }

      login.disabled = true;
      login.textContent = "確認中…";
      error.textContent = "";

      try {
        if (window.DPRO_API) {
          await window.DPRO_API.login(code);
        } else if (code !== cfg.adminCode) {
          throw new Error("管理コードが一致しません。");
        }
        unlock();
      } catch (apiError) {
        error.textContent =
          apiError?.message || "管理コードを確認できませんでした。";
        input?.focus();
      } finally {
        login.disabled = false;
        login.textContent = "開く";
      }
    });

    input?.addEventListener("keydown", (event) => {
      if (event.key === "Enter") login?.click();
    });

    clear?.addEventListener("click", () => {
      if (input) input.value = "";
      if (error) error.textContent = "";
      input?.focus();
    });
  }

  function toast(message) {
    let node = q(".toast");
    if (!node) {
      node = document.createElement("div");
      node.className = "toast";
      node.setAttribute("role", "status");
      document.body.appendChild(node);
    }
    node.textContent = message;
    node.classList.add("is-show");
    window.setTimeout(() => node.classList.remove("is-show"), 2400);
  }

  function setupDemoActions() {
    qa("[data-demo-action]").forEach((button) => {
      button.addEventListener("click", () => {
        toast(button.dataset.demoAction || "デモ操作を受け付けました。");
      });
    });
  }

  function normalizePhone(value) {
    let normalized = String(value ?? "")
      .normalize("NFKC")
      .replace(/[‐‑‒–—―ーｰ−﹣－]/g, "-")
      .replace(/\s+/g, "")
      .replace(/[^\d+]/g, "");

    // +81 90... / ＋８１ ９０... → 090...
    // +81 (0)90... → 090...
    if (normalized.startsWith("+810")) {
      normalized = normalized.slice(3);
    } else if (normalized.startsWith("+81")) {
      normalized = `0${normalized.slice(3)}`;
    } else if (normalized.startsWith("00810")) {
      normalized = normalized.slice(4);
    } else if (normalized.startsWith("0081")) {
      normalized = `0${normalized.slice(4)}`;
    }

    return normalized.replace(/\D/g, "");
  }

  function renderEquipment() {
    const target = q("[data-equipment-list]");
    if (!target) return;
    target.innerHTML = demo.equipment.map((item) => `
      <article class="item-card">
        <div>
          <p class="eyebrow">${escapeHtml(item.asset)}</p>
          <h3>${escapeHtml(item.name)}</h3>
          <p>${escapeHtml(item.model)}</p>
        </div>
        <div class="item-card__meta">
          <span class="status status--success">${escapeHtml(item.status)}</span>
          <span>次回確認 ${escapeHtml(formatDateJP(item.next))}</span>
        </div>
      </article>
    `).join("");
  }

  function renderVisits() {
    qa("[data-visit-list]").forEach((target) => {
      target.innerHTML = demo.visits.map((visit) => `
        <article class="schedule-row">
          <time>${escapeHtml(visit.time)}</time>
          <div>
            <strong>${escapeHtml(visit.client)}</strong>
            <span>${escapeHtml(visit.type)}</span>
          </div>
          <span class="schedule-row__staff">${escapeHtml(visit.staff)}</span>
        </article>
      `).join("");
    });
  }

  function renderDashboard() {
    Object.entries(demo.summary).forEach(([key, value]) => {
      qa(`[data-summary="${key}"]`).forEach((node) => node.textContent = String(value));
    });
  }

  function setupPhoneDemo() {
    const input = q("[data-phone-input]");
    const result = q("[data-phone-result]");
    if (!input || !result) return;
    const run = () => {
      const normalized = normalizePhone(input.value);
      result.textContent = normalized || "電話番号を入力してください。";
      result.classList.toggle("text-danger", normalized.length > 0 && normalized.length < 10);
    };
    input.addEventListener("input", run);
    run();
  }

  document.addEventListener("DOMContentLoaded", () => {
    setOfficeName();
    setupMobileNav();
    setupTabs();
    setupAdminGate();
    setupDemoActions();
    setupPhoneDemo();
    renderEquipment();
    renderVisits();
    renderDashboard();
  });

  window.DPRO = Object.freeze({
    config: cfg,
    demo,
    normalizePhone,
    formatDateJP,
    toast
  });
})();
