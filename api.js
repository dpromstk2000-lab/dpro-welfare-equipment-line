(() => {
  "use strict";

  const cfg = window.DPRO_CONFIG;
  const tokenKey = `dpro_admin_token_${cfg.officeCode}`;
  const actorKey = `dpro_actor_${cfg.officeCode}`;
  const baseUrl = String(cfg.apiBaseUrl || "").replace(/\/+$/, "");

  class DproApiError extends Error {
    constructor(message, code = "API_ERROR", status = 0, details = null) {
      super(message);
      this.name = "DproApiError";
      this.code = code;
      this.status = status;
      this.details = details;
    }
  }

  function getToken() {
    return sessionStorage.getItem(tokenKey) || "";
  }

  function decodeTokenPayload(token) {
    try {
      const encoded = String(token || "").split(".")[0];
      if (!encoded) return null;
      const normalized = encoded.replace(/-/g, "+").replace(/_/g, "/");
      const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
      const bytes = Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
      return JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      return null;
    }
  }

  function getActor() {
    try {
      const stored = sessionStorage.getItem(actorKey);
      if (stored) return JSON.parse(stored);
    } catch {
      // Ignore malformed session storage.
    }
    return decodeTokenPayload(getToken());
  }

  function setToken(token, actor = null) {
    if (token) {
      sessionStorage.setItem(tokenKey, token);
      const resolvedActor = actor || decodeTokenPayload(token);
      if (resolvedActor) {
        sessionStorage.setItem(actorKey, JSON.stringify(resolvedActor));
      }
    } else {
      sessionStorage.removeItem(tokenKey);
      sessionStorage.removeItem(actorKey);
    }
  }

  async function request(path, options = {}) {
    if (!baseUrl) {
      throw new DproApiError(
        "API URLが設定されていません。",
        "API_URL_MISSING"
      );
    }

    const headers = {
      "Content-Type": "application/json",
      "X-Office-Code": cfg.officeCode,
      ...(options.headers || {}),
    };

    if (options.admin !== false) {
      const token = getToken();
      if (token) headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(`${baseUrl}${path}`, {
      method: options.method || "GET",
      headers,
      body:
        options.body === undefined
          ? undefined
          : JSON.stringify(options.body),
    });

    let data = null;
    try {
      data = await response.json();
    } catch {
      data = null;
    }

    if (!response.ok || data?.ok === false) {
      if (response.status === 401 && options.admin !== false) {
        setToken("");
        sessionStorage.removeItem("dpro_welfare_admin_ok");
      }
      throw new DproApiError(
        data?.error?.message || "API通信に失敗しました。",
        data?.error?.code || "HTTP_ERROR",
        response.status,
        data?.error?.details || null
      );
    }
    return data;
  }

  async function login(adminCode) {
    const data = await request("/admin/login", {
      method: "POST",
      admin: false,
      body: {
        office_code: cfg.officeCode,
        admin_code: adminCode,
      },
    });
    setToken(data.token, data.actor || null);
    return data;
  }

  async function staffLogin(staffCode, pin) {
    const data = await request("/staff/login", {
      method: "POST",
      admin: false,
      body: {
        office_code: cfg.officeCode,
        staff_code: staffCode,
        pin,
      },
    });
    setToken(data.token, data.actor || null);
    return data;
  }

  function logout() {
    setToken("");
    sessionStorage.removeItem("dpro_welfare_admin_ok");
  }

  window.DPRO_API = Object.freeze({
    request,
    login,
    staffLogin,
    logout,
    getToken,
    getActor,
    setToken,
    hasToken: () => Boolean(getToken()),
    errorClass: DproApiError,
  });
})();
