/**
 * SkyCompute — Frontend Client
 * Implements SPA routing, registration, JWT login/logout, role-based pages,
 * and automatic access token refresh via the refresh token.
 */

const API_BASE = "http://127.0.0.1:8000/api/v1";

const STORAGE_KEYS = {
  access: "skycompute_access_token",
  refresh: "skycompute_refresh_token",
  user: "skycompute_user",
};

const state = {
  search: "",
  category: "",
  datacenter_id: "",
  vendor_id: "",
  sort: "",
  page: 1,
  limit: 6,
  total: 0,
  datacenters: [],
  vendors: [],
  redirectAfterLogin: null,
};

const categoryLabels = {
  general: "General-Purpose",
  compute_optimized: "Compute-Optimized",
  accelerator_optimized: "Accelerator / GPU",
};

// --- Token & Session Storage -----------------------------------------------

function getAccessToken() {
  return localStorage.getItem(STORAGE_KEYS.access);
}

function getRefreshToken() {
  return localStorage.getItem(STORAGE_KEYS.refresh);
}

function getCurrentUser() {
  const raw = localStorage.getItem(STORAGE_KEYS.user);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function isAuthenticated() {
  return Boolean(getAccessToken() || getRefreshToken());
}

function setAuthSession(access, refresh, user) {
  if (access) localStorage.setItem(STORAGE_KEYS.access, access);
  if (refresh) localStorage.setItem(STORAGE_KEYS.refresh, refresh);
  if (user) localStorage.setItem(STORAGE_KEYS.user, JSON.stringify(user));
  updateNavbarAuthUI();
  updateTokenPreviewUI();
}

function clearAuthSession() {
  localStorage.removeItem(STORAGE_KEYS.access);
  localStorage.removeItem(STORAGE_KEYS.refresh);
  localStorage.removeItem(STORAGE_KEYS.user);
  updateNavbarAuthUI();
  updateTokenPreviewUI();
}

function parseJwtPayload(token) {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(base64));
  } catch {
    return null;
  }
}

function isJwtExpired(token) {
  const payload = parseJwtPayload(token);
  if (!payload || !payload.exp) return true;
  // Refresh if token expires within 5 seconds
  return payload.exp * 1000 <= Date.now() + 5000;
}

// --- API Client with Automatic Token Refresh -------------------------------

let refreshPromise = null;

async function refreshAccessToken() {
  const refresh = getRefreshToken();
  if (!refresh) return null;

  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    try {
      const response = await fetch(`${API_BASE}/auth/refresh`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          refresh
        }),
      });
      const data = await response.json();
      if (response.ok && data.access) {
        localStorage.setItem(STORAGE_KEYS.access, data.access);
        updateTokenPreviewUI();
        return data.access;
      }
      clearAuthSession();
      return null;
    } catch {
      return null;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

async function apiRequest(endpoint, options = {}) {
  const {
    auth = false, ...fetchOptions
  } = options;
  const headers = {
    Accept: "application/json",
    "Content-Type": "application/json",
    ...(fetchOptions.headers || {}),
  };

  let refreshedAutomatically = false;

  if (auth) {
    let access = getAccessToken();
    if ((!access || isJwtExpired(access)) && getRefreshToken()) {
      const newAccess = await refreshAccessToken();
      if (newAccess) {
        access = newAccess;
        refreshedAutomatically = true;
      }
    }
    if (access) {
      headers.Authorization = `Bearer ${access}`;
    }
  }

  let response = await fetch(`${API_BASE}${endpoint}`, {
    ...fetchOptions,
    headers,
  });

  // If the server returned 401 and we have a refresh token, refresh and retry once
  if (auth && response.status === 401 && getRefreshToken()) {
    const newAccess = await refreshAccessToken();
    if (newAccess) {
      refreshedAutomatically = true;
      headers.Authorization = `Bearer ${newAccess}`;
      response = await fetch(`${API_BASE}${endpoint}`, {
        ...fetchOptions,
        headers,
      });
    }
  }

  const isJson = response.headers
    .get("content-type")
    ?.includes("application/json");
  const data = isJson ? await response.json() : null;

  return {
    ok: response.ok,
    status: response.status,
    data,
    refreshedAutomatically,
  };
}

// --- UI Banner & Navbar Updates --------------------------------------------

function showRouteBanner(message) {
  const banner = document.getElementById("route-banner");
  const text = document.getElementById("route-banner-text");
  text.textContent = message;
  banner.classList.remove("hidden");
}

function hideRouteBanner() {
  document.getElementById("route-banner").classList.add("hidden");
}

function formatUserDisplayName(user) {
  if (!user) return "";
  const fullName = [user.first_name, user.last_name]
    .filter(Boolean)
    .join(" ")
    .trim();
  return fullName ? `${fullName} (@${user.username})` : `@${user.username}`;
}

function updateNavbarAuthUI() {
  const guestBox = document.getElementById("nav-guest");
  const userBox = document.getElementById("nav-user");
  const nameEl = document.getElementById("nav-user-name");
  const roleEl = document.getElementById("nav-user-role");

  const user = getCurrentUser();
  if (isAuthenticated() && user) {
    guestBox.classList.add("hidden");
    userBox.classList.remove("hidden");
    nameEl.textContent = formatUserDisplayName(user);
    roleEl.textContent = user.role === "admin" ? "admin" : "user";
    roleEl.className =
      user.role === "admin" ? "role-badge role-admin" : "role-badge";
  } else {
    guestBox.classList.remove("hidden");
    userBox.classList.add("hidden");
    nameEl.textContent = "";
    roleEl.textContent = "";
  }
}

function updateTokenPreviewUI() {
  const accessEl = document.getElementById("token-access-preview");
  const refreshEl = document.getElementById("token-refresh-preview");
  if (!accessEl || !refreshEl) return;

  const access = getAccessToken();
  const refresh = getRefreshToken();
  accessEl.textContent = access ?
    `${access.slice(0, 28)}...${access.slice(-12)}` :
    "відсутній";
  refreshEl.textContent = refresh ?
    `${refresh.slice(0, 28)}...${refresh.slice(-12)}` :
    "відсутній";
}

// --- Client-Side Router with Auth Guards -----------------------------------

const ROUTES = {
  "/": "page-catalog",
  "/catalog": "page-catalog",
  "/login": "page-login",
  "/register": "page-register",
  "/workspace": "page-workspace",
  "/admin-panel": "page-admin",
};

const PROTECTED_ROUTES = new Set(["/workspace", "/admin-panel"]);
const GUEST_ONLY_ROUTES = new Set(["/login", "/register"]);

function normalizePath(rawPath) {
  const path = (rawPath || "/catalog").split("?")[0];
  if (path === "/" || !ROUTES[path]) return "/catalog";
  return path;
}

async function navigateTo(targetUrl, {
  replace = false,
  banner = null
} = {}) {
  const urlObj = new URL(targetUrl, window.location.origin);
  const path = normalizePath(urlObj.pathname);

  // Rule 1: Unauthenticated user opening a protected route -> redirect to /login
  if (PROTECTED_ROUTES.has(path) && !isAuthenticated()) {
    state.redirectAfterLogin = path;
    const loginUrl = `/login?next=${encodeURIComponent(path)}`;
    window.history.replaceState({}, "", loginUrl);
    renderRoute("/login");
    showRouteBanner(
      `Сторінка «${path}» доступна лише авторизованим користувачам. Увійдіть в акаунт — після входу вас автоматично поверне на «${path}».`
    );
    return;
  }

  // Rule 2: Authenticated user trying to open /login or /register -> redirect to content page
  if (GUEST_ONLY_ROUTES.has(path) && isAuthenticated()) {
    window.history.replaceState({}, "", "/workspace");
    renderRoute("/workspace");
    showRouteBanner(
      "Ви вже авторизовані, тому сторінка входу недоступна — вас перенаправлено до кабінету."
    );
    return;
  }

  if (replace) {
    window.history.replaceState({}, "", urlObj.pathname + urlObj.search);
  } else if (window.location.pathname + window.location.search !== urlObj.pathname + urlObj.search) {
    window.history.pushState({}, "", urlObj.pathname + urlObj.search);
  }

  if (banner) {
    showRouteBanner(banner);
  } else {
    hideRouteBanner();
  }

  await renderRoute(path);
}

async function renderRoute(path) {
  Object.values(ROUTES).forEach((pageId) => {
    document.getElementById(pageId)?.classList.add("hidden");
  });

  const activePageId = ROUTES[path] || "page-catalog";
  document.getElementById(activePageId)?.classList.remove("hidden");

  document.querySelectorAll(".main-nav .nav-link").forEach((link) => {
    link.classList.toggle("active", link.dataset.route === path);
  });

  if (path === "/login") {
    const nextParam =
      new URLSearchParams(window.location.search).get("next") ||
      state.redirectAfterLogin;
    const hint = document.getElementById("login-redirect-hint");
    if (nextParam) {
      hint.textContent = `Після успішного входу вас буде автоматично перенаправлено на сторінку «${nextParam}».`;
    } else {
      hint.textContent =
        "Увійдіть, щоб керувати серверами та переглядати особистий кабінет.";
    }
  } else if (path === "/workspace") {
    updateTokenPreviewUI();
    await loadCurrentUserProfile();
  } else if (path === "/admin-panel") {
    await renderAdminPanel();
  }
}

// --- Registration & Login Forms --------------------------------------------

function clearFormErrors(form) {
  form.querySelectorAll(".field-error").forEach((el) => {
    el.textContent = "";
  });
}

function showFieldErrors(prefix, details) {
  if (!details || typeof details !== "object") return;
  const fieldMap = {
    username: `${prefix}-username`,
    email: `${prefix}-email`,
    first_name: `${prefix}-first-name`,
    last_name: `${prefix}-last-name`,
    password: `${prefix}-password`,
    password_confirmation: `${prefix}-password-confirm`,
  };
  Object.entries(details).forEach(([field, messages]) => {
    const targetId = fieldMap[field];
    if (!targetId) return;
    const errEl = document.querySelector(`[data-error-for="${targetId}"]`);
    if (errEl) {
      errEl.textContent = Array.isArray(messages) ?
        messages.join(" ") :
        String(messages);
    }
  });
}

function setupAuthForms() {
  const loginForm = document.getElementById("login-form");
  const loginAlert = document.getElementById("login-error-alert");

  document.getElementById("fill-user-btn").addEventListener("click", () => {
    document.getElementById("login-username").value = "developer";
    document.getElementById("login-password").value = "DevPass123!";
  });

  document.getElementById("fill-admin-btn").addEventListener("click", () => {
    document.getElementById("login-username").value = "admin";
    document.getElementById("login-password").value = "AdminPass123!";
  });

  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearFormErrors(loginForm);
    loginAlert.classList.add("hidden");

    const username = document.getElementById("login-username").value.trim();
    const password = document.getElementById("login-password").value;

    try {
      const res = await apiRequest("/auth/login", {
        method: "POST",
        body: JSON.stringify({
          username,
          password
        }),
      });

      if (res.ok) {
        setAuthSession(res.data.access, res.data.refresh, res.data.user);
        loginForm.reset();

        const nextUrl =
          new URLSearchParams(window.location.search).get("next") ||
          state.redirectAfterLogin ||
          "/workspace";
        state.redirectAfterLogin = null;
        await navigateTo(nextUrl, {
          replace: true,
          banner: `Вітаємо, ${formatUserDisplayName(res.data.user)}! Ви успішно увійшли в акаунт.`,
        });
      } else {
        const err = res.data?.error;
        showFieldErrors("login", err?.details);
        loginAlert.textContent =
          err?.message || "Не вдалося виконати вхід. Перевірте облікові дані.";
        loginAlert.classList.remove("hidden");
      }
    } catch {
      loginAlert.textContent =
        "Сервер API недоступний. Переконайтеся, що Django запущено на порту 8000.";
      loginAlert.classList.remove("hidden");
    }
  });

  // Registration Form
  const registerForm = document.getElementById("register-form");
  const registerError = document.getElementById("register-error-alert");
  const registerSuccess = document.getElementById("register-success-alert");

  registerForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearFormErrors(registerForm);
    registerError.classList.add("hidden");
    registerSuccess.classList.add("hidden");

    const payload = {
      username: document.getElementById("reg-username").value.trim(),
      first_name: document.getElementById("reg-first-name").value.trim(),
      last_name: document.getElementById("reg-last-name").value.trim(),
      email: document.getElementById("reg-email").value.trim(),
      password: document.getElementById("reg-password").value,
      password_confirmation: document.getElementById("reg-password-confirm").value,
    };

    try {
      const res = await apiRequest("/auth/register", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        // Automatically log the newly registered user in
        const loginRes = await apiRequest("/auth/login", {
          method: "POST",
          body: JSON.stringify({
            username: payload.username,
            password: payload.password,
          }),
        });
        registerForm.reset();
        if (loginRes.ok) {
          setAuthSession(
            loginRes.data.access,
            loginRes.data.refresh,
            loginRes.data.user
          );
          await navigateTo("/workspace", {
            replace: true,
            banner: `Акаунт @${payload.username} успішно зареєстровано! Пароль збережено у захешованому вигляді.`,
          });
        } else {
          await navigateTo("/login", {
            banner: "Реєстрація успішна! Тепер увійдіть у свій акаунт.",
          });
        }
      } else {
        const err = res.data?.error;
        showFieldErrors("reg", err?.details);
        registerError.textContent =
          err?.message || "Виправте помилки у формі реєстрації.";
        registerError.classList.remove("hidden");
      }
    } catch {
      registerError.textContent =
        "Не вдалося з'єднатися з сервером API (:8000).";
      registerError.classList.remove("hidden");
    }
  });

  // Logout Button
  document.getElementById("logout-btn").addEventListener("click", async () => {
    clearAuthSession();
    const currentPath = normalizePath(window.location.pathname);
    if (PROTECTED_ROUTES.has(currentPath)) {
      await navigateTo("/login", {
        replace: true,
        banner: "Ви вийшли з акаунта. Токени видалено з браузера.",
      });
    } else {
      showRouteBanner("Ви вийшли з акаунта. Токени видалено з браузера.");
    }
  });
}

// --- Protected Workspace: Profile, Token Refresh & Create Instance ---------

async function loadCurrentUserProfile() {
  const res = await apiRequest("/users/me", {
    auth: true
  });
  if (!res.ok) {
    if (res.status === 401) {
      clearAuthSession();
      await navigateTo("/login?next=/workspace", {
        replace: true,
        banner: "Сесія завершилась. Будь ласка, увійдіть повторно.",
      });
    }
    return;
  }

  const user = res.data;
  localStorage.setItem(STORAGE_KEYS.user, JSON.stringify(user));
  updateNavbarAuthUI();

  document.getElementById("prof-username-role").value =
    `@${user.username} — роль: ${user.role} (${user.is_staff ? "Адміністратор" : "Розробник"})`;
  document.getElementById("prof-email").value = user.email || "";
  document.getElementById("prof-first-name").value = user.first_name || "";
  document.getElementById("prof-last-name").value = user.last_name || "";
}

function setupWorkspaceActions() {
  const profileForm = document.getElementById("profile-form");
  const profileAlert = document.getElementById("profile-alert");

  profileForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    profileAlert.classList.add("hidden");

    const payload = {
      email: document.getElementById("prof-email").value.trim(),
      first_name: document.getElementById("prof-first-name").value.trim(),
      last_name: document.getElementById("prof-last-name").value.trim(),
    };

    const res = await apiRequest("/users/me", {
      method: "PATCH",
      auth: true,
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      localStorage.setItem(STORAGE_KEYS.user, JSON.stringify(res.data));
      updateNavbarAuthUI();
      profileAlert.className = "form-alert alert-success";
      profileAlert.textContent = "Профіль успішно оновлено!";
      profileAlert.classList.remove("hidden");
    } else {
      const err = res.data?.error;
      profileAlert.className = "form-alert alert-error";
      profileAlert.textContent = err?.message || "Помилка оновлення профілю.";
      profileAlert.classList.remove("hidden");
    }
  });

  // Simulate Expired Access Token + Auto Refresh
  const logOutput = document.getElementById("refresh-log-output");

  document
    .getElementById("simulate-expired-access-btn")
    .addEventListener("click", async () => {
      const steps = [];
      steps.push("1. Підміняємо поточний access-токен на прострочений у localStorage...");
      localStorage.setItem(STORAGE_KEYS.access, "expired.access.token");
      updateTokenPreviewUI();

      steps.push("2. Виконуємо захищений запит GET /api/v1/users/me...");
      const res = await apiRequest("/users/me", {
        auth: true
      });

      if (res.ok && res.refreshedAutomatically) {
        steps.push(
          "3. Перехоплено закінчення дії access-токена → автоматично викликано POST /api/v1/auth/refresh із refresh-токеном (200 OK)."
        );
        steps.push(
          `4. Отримано новий access-токен і повторено запит GET /api/v1/users/me → статус ${res.status} OK!`
        );
        steps.push(
          `5. Дані користувача отримано без повторного логіну: @${res.data.username} (${res.data.email})`
        );
      } else {
        steps.push(`Запит завершився зі статусом ${res.status}.`);
      }

      logOutput.textContent = steps.join("\n");
    });

  document
    .getElementById("manual-refresh-btn")
    .addEventListener("click", async () => {
      const newAccess = await refreshAccessToken();
      if (newAccess) {
        logOutput.textContent = `POST /api/v1/auth/refresh → 200 OK\nНовий access-токен успішно збережено:\n${newAccess}`;
      } else {
        logOutput.textContent =
          "Не вдалося оновити токен (refresh-токен відсутній або недійсний).";
      }
    });

  // Create Instance Form
  const createForm = document.getElementById("create-instance-form");
  const createAlert = document.getElementById("create-instance-alert");

  createForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    createAlert.classList.add("hidden");

    const gpuModelRaw = document.getElementById("inst-gpu-model").value.trim();
    const payload = {
      name: document.getElementById("inst-name").value.trim(),
      category: document.getElementById("inst-category").value,
      description: document.getElementById("inst-description").value.trim(),
      vcpu: Number(document.getElementById("inst-vcpu").value),
      ram_gb: Number(document.getElementById("inst-ram").value),
      gpu_model: gpuModelRaw || null,
      gpu_count: Number(document.getElementById("inst-gpu-count").value || 0),
      storage_type: document.getElementById("inst-storage-type").value,
      storage_size_gb: Number(document.getElementById("inst-storage-size").value),
      network_bandwidth_gbps: Number(
        document.getElementById("inst-bandwidth").value
      ),
      hourly_price: document.getElementById("inst-price").value,
      datacenter_id: Number(document.getElementById("inst-datacenter").value),
      vendor_id: Number(document.getElementById("inst-vendor").value),
    };

    const res = await apiRequest("/instances", {
      method: "POST",
      auth: true,
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      createAlert.className = "form-alert alert-success";
      createAlert.textContent = `Сервер «${res.data.name}» (id=${res.data.id}) успішно створено!`;
      createAlert.classList.remove("hidden");
      createForm.reset();
      await loadInstances();
    } else {
      const err = res.data?.error;
      const detailsText = err?.details ?
        " " + JSON.stringify(err.details) :
        "";
      createAlert.className = "form-alert alert-error";
      createAlert.textContent = `${err?.message || "Помилка створення сервера."}${detailsText}`;
      createAlert.classList.remove("hidden");
    }
  });
}

// --- Admin Infrastructure Panel --------------------------------------------

async function renderAdminPanel() {
  const user = getCurrentUser();
  const roleNotice = document.getElementById("admin-role-notice");
  if (user?.is_staff) {
    roleNotice.className = "form-alert alert-success";
    roleNotice.textContent = `Ви увійшли як адміністратор (@${user.username}, role=admin). Вам доступні всі операції керування датацентрами та видалення серверів.`;
  } else {
    roleNotice.className = "form-alert alert-error";
    roleNotice.textContent = `Ви увійшли зі звичайною роллю (@${user?.username || "user"}, role=user). Спроба створити датацентр або видалити сервер поверне статус 403 Forbidden від бекенду.`;
  }
  roleNotice.classList.remove("hidden");

  const listEl = document.getElementById("admin-instances-list");
  const res = await apiRequest("/instances?limit=20");
  if (!res.ok) return;

  listEl.innerHTML = res.data.results
    .map(
      (inst) => `
      <div class="admin-list-item">
        <div class="admin-item-info">
          <strong>${escapeHtml(inst.name)}</strong>
          <span>ID: ${inst.id} • ${inst.vcpu} vCPU / ${inst.ram_gb} GB RAM • $${inst.hourly_price}/год</span>
        </div>
        <button type="button" class="btn btn-danger-outline btn-sm btn-delete-instance" data-id="${inst.id}" data-name="${escapeHtml(inst.name)}">
          Видалити (DELETE)
        </button>
      </div>
    `
    )
    .join("");

  const deleteAlert = document.getElementById("admin-delete-alert");
  listEl.querySelectorAll(".btn-delete-instance").forEach((btn) => {
    btn.addEventListener("click", async () => {
      deleteAlert.classList.add("hidden");
      const id = btn.dataset.id;
      const name = btn.dataset.name;
      const delRes = await apiRequest(`/instances/${id}`, {
        method: "DELETE",
        auth: true,
      });

      if (delRes.status === 204) {
        deleteAlert.className = "form-alert alert-success";
        deleteAlert.textContent = `Сервер «${name}» (id=${id}) успішно видалено (204 No Content).`;
        deleteAlert.classList.remove("hidden");
        await renderAdminPanel();
        await loadInstances();
      } else {
        deleteAlert.className = "form-alert alert-error";
        deleteAlert.textContent = `HTTP ${delRes.status}: ${delRes.data?.error?.message || "Помилка видалення."}`;
        deleteAlert.classList.remove("hidden");
      }
    });
  });
}

function setupAdminForm() {
  const dcForm = document.getElementById("admin-dc-form");
  const dcAlert = document.getElementById("admin-dc-alert");

  dcForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    dcAlert.classList.add("hidden");

    const payload = {
      name: document.getElementById("dc-name").value.trim(),
      region_code: document.getElementById("dc-region").value.trim(),
      city: document.getElementById("dc-city").value.trim(),
      country: document.getElementById("dc-country").value.trim(),
      sla_percent: "99.99",
    };

    const res = await apiRequest("/datacenters", {
      method: "POST",
      auth: true,
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      dcAlert.className = "form-alert alert-success";
      dcAlert.textContent = `Датацентр «${res.data.name}» (${res.data.city}) успішно створено!`;
      dcAlert.classList.remove("hidden");
      dcForm.reset();
      await loadMetadata();
    } else {
      dcAlert.className = "form-alert alert-error";
      dcAlert.textContent = `HTTP ${res.status}: ${res.data?.error?.message || "Відмовлено в доступі."}`;
      dcAlert.classList.remove("hidden");
    }
  });
}

// --- Public Catalog Logic --------------------------------------------------

async function checkApiConnection() {
  const apiStatus = document.getElementById("api-status");
  try {
    const res = await apiRequest("/instances?limit=1");
    if (res.ok) {
      apiStatus.className = "status-badge connected";
      apiStatus.querySelector(".status-text").textContent = "API 200 OK";
    } else {
      apiStatus.className = "status-badge error";
      apiStatus.querySelector(".status-text").textContent = `API (${res.status})`;
    }
  } catch {
    apiStatus.className = "status-badge error";
    apiStatus.querySelector(".status-text").textContent = "API недоступне";
  }
}

async function loadMetadata() {
  try {
    const [dcRes, vendorRes] = await Promise.all([
      apiRequest("/datacenters"),
      apiRequest("/vendors"),
    ]);

    const dcSelect = document.getElementById("datacenter-select");
    const instDcSelect = document.getElementById("inst-datacenter");
    if (dcRes.ok && Array.isArray(dcRes.data)) {
      state.datacenters = dcRes.data;
      document.getElementById("stat-datacenters").textContent = dcRes.data.length;
      dcSelect.innerHTML = '<option value="">Всі датацентри</option>';
      instDcSelect.innerHTML = "";
      dcRes.data.forEach((dc) => {
        const opt = document.createElement("option");
        opt.value = dc.id;
        opt.textContent = `${dc.city} (${dc.name})`;
        dcSelect.appendChild(opt);
        instDcSelect.appendChild(opt.cloneNode(true));
      });
    }

    const vendorSelect = document.getElementById("vendor-select");
    const instVendorSelect = document.getElementById("inst-vendor");
    if (vendorRes.ok && Array.isArray(vendorRes.data)) {
      state.vendors = vendorRes.data;
      document.getElementById("stat-vendors").textContent = vendorRes.data.length;
      vendorSelect.innerHTML = '<option value="">Всі вендори</option>';
      instVendorSelect.innerHTML = "";
      vendorRes.data.forEach((v) => {
        const opt = document.createElement("option");
        opt.value = v.id;
        opt.textContent = v.name;
        vendorSelect.appendChild(opt);
        instVendorSelect.appendChild(opt.cloneNode(true));
      });
    }
  } catch (e) {
    console.error("Failed to load metadata:", e);
  }
}

async function loadInstances() {
  const spinner = document.getElementById("loading-spinner");
  const grid = document.getElementById("instances-grid");
  const emptyState = document.getElementById("empty-state");
  const errorBox = document.getElementById("error-box");

  spinner.classList.remove("hidden");
  grid.classList.add("hidden");
  errorBox.classList.add("hidden");
  emptyState.classList.add("hidden");

  const params = new URLSearchParams();
  if (state.search.trim()) params.append("search", state.search.trim());
  if (state.category) params.append("category", state.category);
  if (state.datacenter_id) params.append("datacenter_id", state.datacenter_id);
  if (state.vendor_id) params.append("vendor_id", state.vendor_id);
  if (state.sort) params.append("sort", state.sort);
  params.append("page", state.page);
  params.append("limit", state.limit);

  try {
    const res = await apiRequest(`/instances?${params.toString()}`);
    spinner.classList.add("hidden");
    grid.classList.remove("hidden");

    if (res.ok) {
      state.total = res.data.total;
      document.getElementById("stat-instances").textContent = state.total;
      document.getElementById("results-count").textContent =
        `Знайдено серверів: ${state.total}`;
      renderInstances(res.data.results);
      renderPagination(res.data.total, res.data.page, res.data.limit);
    } else {
      showCatalogError(res.status, res.data?.error);
    }
  } catch {
    spinner.classList.add("hidden");
    showCatalogError(0, {
      code: "network_error",
      message: "Не вдалося з'єднатися з сервером API (:8000). Переконайтесь, що бекенд запущений.",
      details: {},
    });
  }
}

function renderInstances(instances) {
  const grid = document.getElementById("instances-grid");
  const emptyState = document.getElementById("empty-state");
  const pagination = document.getElementById("pagination");

  if (!instances || instances.length === 0) {
    grid.innerHTML = "";
    emptyState.classList.remove("hidden");
    pagination.classList.add("hidden");
    return;
  }

  emptyState.classList.add("hidden");
  grid.innerHTML = instances
    .map((item) => {
      const gpuText = item.gpu_model ?
        `${item.gpu_count} × ${item.gpu_model}` :
        "Немає (CPU)";
      const gpuClass = item.gpu_model ? "gpu-val" : "";
      const catClass = `badge-${item.category}`;
      const catLabel = categoryLabels[item.category] || item.category;
      const availClass = item.is_available ?
        "badge-available" :
        "badge-unavailable";
      const availLabel = item.is_available ? "Доступний" : "Орендовано";

      return `
        <article class="instance-card">
          <div>
            <div class="card-header">
              <div>
                <span class="badge ${catClass}">${catLabel}</span>
                <h3 class="instance-name" style="margin-top: 8px;">${escapeHtml(item.name)}</h3>
              </div>
              <span class="badge ${availClass}">${availLabel}</span>
            </div>

            <div class="specs-list">
              <div class="spec-item">
                <span class="spec-k">vCPU</span>
                <span class="spec-v">${item.vcpu} ядра</span>
              </div>
              <div class="spec-item">
                <span class="spec-k">RAM</span>
                <span class="spec-v">${item.ram_gb} GB</span>
              </div>
              <div class="spec-item" style="grid-column: span 2;">
                <span class="spec-k">Прискорювач</span>
                <span class="spec-v ${gpuClass}">${escapeHtml(gpuText)}</span>
              </div>
            </div>

            <div class="card-location">
              <span class="location-dot"></span>
              <span>${escapeHtml(item.datacenter.city)} • ${escapeHtml(item.vendor.name)}</span>
            </div>
          </div>

          <div class="card-footer">
            <div class="price-container">
              <span class="price-label">Тариф оренди</span>
              <div>
                <span class="price-amount">$${item.hourly_price}</span>
                <span class="price-unit"> / год</span>
              </div>
            </div>
            <button class="btn btn-primary btn-details" data-id="${item.id}">
              Деталі →
            </button>
          </div>
        </article>
      `;
    })
    .join("");

  grid.querySelectorAll(".btn-details").forEach((btn) => {
    btn.addEventListener("click", () => openDetailModal(btn.dataset.id));
  });
}

function renderPagination(total, page, limit) {
  const pagination = document.getElementById("pagination");
  const totalPages = Math.ceil(total / limit) || 1;
  if (totalPages <= 1) {
    pagination.classList.add("hidden");
    return;
  }

  pagination.classList.remove("hidden");
  document.getElementById("page-info").textContent =
    `Сторінка ${page} з ${totalPages}`;
  document.getElementById("prev-page").disabled = page <= 1;
  document.getElementById("next-page").disabled = page >= totalPages;
}

function showCatalogError(status, errorObj) {
  const box = document.getElementById("error-box");
  box.classList.remove("hidden");
  document.getElementById("error-status").textContent = status ?
    `HTTP ${status}` :
    "NETWORK ERROR";
  document.getElementById("error-code").textContent = errorObj?.code || "error";
  document.getElementById("error-message").textContent =
    errorObj?.message || "Виникла помилка.";
  const detailsEl = document.getElementById("error-details");
  if (errorObj?.details && Object.keys(errorObj.details).length > 0) {
    detailsEl.classList.remove("hidden");
    detailsEl.textContent = JSON.stringify(errorObj.details, null, 2);
  } else {
    detailsEl.classList.add("hidden");
  }
}

async function openDetailModal(id) {
  const res = await apiRequest(`/instances/${id}`);
  if (!res.ok) return;

  const item = res.data;
  document.getElementById("modal-category").textContent =
    categoryLabels[item.category] || item.category;
  document.getElementById("modal-name").textContent = item.name;
  document.getElementById("modal-description").textContent =
    item.description || "Опис конфігурації сервера відсутній.";
  document.getElementById("modal-vcpu").textContent = `${item.vcpu} ядер`;
  document.getElementById("modal-ram").textContent = `${item.ram_gb} GB`;
  document.getElementById("modal-gpu").textContent = item.gpu_model ?
    `${item.gpu_count} × ${item.gpu_model}` :
    "Відсутній (CPU only)";
  document.getElementById("modal-storage").textContent =
    `${item.storage_size_gb} GB (${item.storage_type})`;
  document.getElementById("modal-network").textContent =
    `${item.network_bandwidth_gbps} Gbps`;
  document.getElementById("modal-price").textContent = `$${item.hourly_price} / год`;
  document.getElementById("modal-dc-name").textContent = item.datacenter.name;
  document.getElementById("modal-dc-location").textContent =
    `${item.datacenter.city}, ${item.datacenter.country} (${item.datacenter.region_code})`;
  document.getElementById("modal-vendor-name").textContent = item.vendor.name;
  document.getElementById("modal-vendor-arch").textContent =
    item.vendor.architecture;
  document.getElementById("modal-availability").innerHTML = item.is_available ?
    '<span class="badge badge-available">Вільний для бронювання</span>' :
    '<span class="badge badge-unavailable">Тимчасово недоступний</span>';

  document.getElementById("modal-backdrop").classList.remove("hidden");
}

function closeModal() {
  document.getElementById("modal-backdrop").classList.add("hidden");
}

function setupCatalogAndNavigationEvents() {
  // Intercept internal route links
  document.addEventListener("click", (e) => {
    const routeLink = e.target.closest("[data-route]");
    if (routeLink) {
      e.preventDefault();
      navigateTo(routeLink.getAttribute("href") || routeLink.dataset.route);
    }
  });

  window.addEventListener("popstate", () => {
    navigateTo(window.location.pathname + window.location.search, {
      replace: true,
    });
  });

  document
    .getElementById("route-banner-close")
    .addEventListener("click", hideRouteBanner);

  // Search input
  let searchTimeout;
  const searchInput = document.getElementById("search-input");
  const searchClear = document.getElementById("search-clear");

  searchInput.addEventListener("input", (e) => {
    clearTimeout(searchTimeout);
    const val = e.target.value;
    searchClear.classList.toggle("hidden", !val);
    searchTimeout = setTimeout(() => {
      state.search = val;
      state.page = 1;
      loadInstances();
    }, 300);
  });

  searchClear.addEventListener("click", () => {
    searchInput.value = "";
    searchClear.classList.add("hidden");
    state.search = "";
    state.page = 1;
    loadInstances();
  });

  document.querySelectorAll("#category-tabs .tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document
        .querySelectorAll("#category-tabs .tab-btn")
        .forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      state.category = btn.dataset.category;
      state.page = 1;
      loadInstances();
    });
  });

  document
    .getElementById("datacenter-select")
    .addEventListener("change", (e) => {
      state.datacenter_id = e.target.value;
      state.page = 1;
      loadInstances();
    });

  document.getElementById("vendor-select").addEventListener("change", (e) => {
    state.vendor_id = e.target.value;
    state.page = 1;
    loadInstances();
  });

  document.getElementById("sort-select").addEventListener("change", (e) => {
    state.sort = e.target.value;
    state.page = 1;
    loadInstances();
  });

  function resetAllFilters() {
    state.search = "";
    state.category = "";
    state.datacenter_id = "";
    state.vendor_id = "";
    state.sort = "";
    state.page = 1;
    searchInput.value = "";
    searchClear.classList.add("hidden");
    document
      .querySelectorAll("#category-tabs .tab-btn")
      .forEach((b, idx) => b.classList.toggle("active", idx === 0));
    document.getElementById("datacenter-select").value = "";
    document.getElementById("vendor-select").value = "";
    document.getElementById("sort-select").value = "";
    loadInstances();
  }

  document
    .getElementById("reset-filters")
    .addEventListener("click", resetAllFilters);
  document
    .getElementById("empty-reset-btn")
    .addEventListener("click", resetAllFilters);
  document.getElementById("retry-btn").addEventListener("click", loadInstances);

  document.getElementById("prev-page").addEventListener("click", () => {
    if (state.page > 1) {
      state.page--;
      loadInstances();
    }
  });

  document.getElementById("next-page").addEventListener("click", () => {
    const totalPages = Math.ceil(state.total / state.limit);
    if (state.page < totalPages) {
      state.page++;
      loadInstances();
    }
  });

  document.getElementById("modal-close").addEventListener("click", closeModal);
  document
    .getElementById("modal-close-footer")
    .addEventListener("click", closeModal);
  document.getElementById("modal-backdrop").addEventListener("click", (e) => {
    if (e.target.id === "modal-backdrop") closeModal();
  });
}

function escapeHtml(str) {
  if (!str) return "";
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// --- Initialization --------------------------------------------------------

async function init() {
  updateNavbarAuthUI();
  setupCatalogAndNavigationEvents();
  setupAuthForms();
  setupWorkspaceActions();
  setupAdminForm();

  await checkApiConnection();
  await loadMetadata();
  await loadInstances();

  // Resolve initial route with auth guards
  await navigateTo(window.location.pathname + window.location.search, {
    replace: true,
  });
}

init();