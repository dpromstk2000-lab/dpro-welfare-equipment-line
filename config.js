window.DPRO_CONFIG = Object.freeze({
  systemName: "DPRO 福祉用具レンタル・販売 LINE",
  systemCode: "WELFARE-EQUIP",
  version: "WELFARE-EQUIP-10-OPERATIONS-FINAL-20260720",
  officeCode: "dpro_welfare_equipment_demo",
  officeName: "DPRO 福祉用具センター",
  adminCode: "1234",
  timezone: "Asia/Tokyo",
  demoMode: true,
  productionGuard: true,
  apiBaseUrl: "https://dpro-welfare-equipment-line-api.dpromstk2000.workers.dev",
  pages: {
    customer: "index.html",
    member: "member.html",
    owner: "owner.html",
    ipad: "owner-ipad.html",
    staff: "staff.html",
    systemCheck: "system-check.html",
    inquiry: "inquiry.html",
    planning: "planning.html",
    planPrint: "plan-print.html",
    contract: "contract.html",
    contractPrint: "contract-print.html",
    aftercare: "aftercare.html",
    billing: "billing.html",
    billingPrint: "billing-print.html",
    operations: "operations.html",
    staffLogin: "staff-login.html"
  }
});

/* DPRO TUTORIAL R3-R4 LOADER
   Tutorial-owned UI/client state only. No business API mutation. */
(() => {
  const page = (location.pathname.split("/").pop() || "index.html").toLowerCase();
  const enabledPages = new Set([
    "index.html", "member.html", "inquiry.html", "owner.html", "owner-ipad.html",
    "planning.html", "contract.html", "staff.html", "aftercare.html",
    "billing.html", "operations.html", "system-check.html"
  ]);
  if (!enabledPages.has(page)) return;

  if (!document.querySelector('link[data-dpro-tutorial-style]')) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "tutorial.css";
    link.dataset.dproTutorialStyle = "1";
    document.head.appendChild(link);
  }
  if (!document.querySelector('script[data-dpro-tutorial-script]')) {
    const script = document.createElement("script");
    script.src = "tutorial.js";
    script.defer = true;
    script.dataset.dproTutorialScript = "1";
    document.head.appendChild(script);
  }
})();
