(() => {
  "use strict";

  const api = window.DPRO_API;
  const q = (selector, root = document) => root.querySelector(selector);

  function setLoading(button, loading) {
    if (!button.dataset.label) button.dataset.label = button.textContent;
    button.disabled = loading;
    button.textContent = loading ? "確認中…" : button.dataset.label;
  }

  function fillDemo(staffCode, pin) {
    const form = q("#staff-login-form");
    q('[name="staff_code"]', form).value = staffCode;
    q('[name="pin"]', form).value = pin;
    q('[name="pin"]', form).focus();
  }

  document.addEventListener("DOMContentLoaded", () => {
    const form = q("#staff-login-form");
    const error = q("#staff-login-error");

    document.querySelectorAll("[data-demo-staff]").forEach((button) => {
      button.addEventListener("click", () => {
        fillDemo(button.dataset.demoStaff, button.dataset.demoPin);
      });
    });

    form?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const button = q('button[type="submit"]', form);
      const data = new FormData(form);
      setLoading(button, true);
      error.textContent = "";

      try {
        const result = await api.staffLogin(
          String(data.get("staff_code") || "").trim(),
          String(data.get("pin") || "").trim()
        );
        sessionStorage.setItem("dpro_welfare_admin_ok", "1");

        if (result.actor?.require_pin_change) {
          window.DPRO?.toast(
            "デモPINでログインしました。本番導入時は運用設定からPINを変更してください。"
          );
        }

        const destination = String(data.get("destination") || "staff.html");
        window.location.href = destination;
      } catch (loginError) {
        error.textContent =
          loginError?.message || "スタッフログインに失敗しました。";
      } finally {
        setLoading(button, false);
      }
    });
  });
})();
