/**
 * SkyCompute — Frontend Client
 * Demonstrates cross-origin resource sharing (CORS) with Django REST framework
 * running on http://127.0.0.1:8000/api/v1/
 */

const API_BASE = 'http://127.0.0.1:8000/api/v1';

// Application State
const state = {
  search: '',
  category: '',
  datacenter_id: '',
  vendor_id: '',
  sort: '',
  page: 1,
  limit: 6,
  total: 0,
};

// DOM Elements
const elements = {
  apiStatus: document.getElementById('api-status'),
  statInstances: document.getElementById('stat-instances'),
  statDatacenters: document.getElementById('stat-datacenters'),
  statVendors: document.getElementById('stat-vendors'),
  searchInput: document.getElementById('search-input'),
  searchClear: document.getElementById('search-clear'),
  categoryTabs: document.getElementById('category-tabs'),
  datacenterSelect: document.getElementById('datacenter-select'),
  vendorSelect: document.getElementById('vendor-select'),
  sortSelect: document.getElementById('sort-select'),
  resetFilters: document.getElementById('reset-filters'),
  resultsCount: document.getElementById('results-count'),
  activeFiltersInfo: document.getElementById('active-filters-info'),
  instancesGrid: document.getElementById('instances-grid'),
  loadingSpinner: document.getElementById('loading-spinner'),
  emptyState: document.getElementById('empty-state'),
  emptyResetBtn: document.getElementById('empty-reset-btn'),
  errorBox: document.getElementById('error-box'),
  errorStatus: document.getElementById('error-status'),
  errorCode: document.getElementById('error-code'),
  errorMessage: document.getElementById('error-message'),
  errorDetails: document.getElementById('error-details'),
  retryBtn: document.getElementById('retry-btn'),
  pagination: document.getElementById('pagination'),
  prevPage: document.getElementById('prev-page'),
  nextPage: document.getElementById('next-page'),
  pageInfo: document.getElementById('page-info'),
  // Modal
  modalBackdrop: document.getElementById('modal-backdrop'),
  modalClose: document.getElementById('modal-close'),
  modalCloseFooter: document.getElementById('modal-close-footer'),
  modalCategory: document.getElementById('modal-category'),
  modalName: document.getElementById('modal-name'),
  modalDescription: document.getElementById('modal-description'),
  modalVcpu: document.getElementById('modal-vcpu'),
  modalRam: document.getElementById('modal-ram'),
  modalGpu: document.getElementById('modal-gpu'),
  modalStorage: document.getElementById('modal-storage'),
  modalNetwork: document.getElementById('modal-network'),
  modalPrice: document.getElementById('modal-price'),
  modalDcName: document.getElementById('modal-dc-name'),
  modalDcLocation: document.getElementById('modal-dc-location'),
  modalVendorName: document.getElementById('modal-vendor-name'),
  modalVendorArch: document.getElementById('modal-vendor-arch'),
  modalAvailability: document.getElementById('modal-availability'),
  // Demo
  demoOutputContainer: document.getElementById('demo-output-container'),
  demoRequestInfo: document.getElementById('demo-request-info'),
  demoStatusPill: document.getElementById('demo-status-pill'),
  demoResponseJson: document.getElementById('demo-response-json'),
};

// Category human labels
const categoryLabels = {
  general: 'General-Purpose',
  compute_optimized: 'Compute-Optimized',
  accelerator_optimized: 'Accelerator / GPU',
};

// --- API Helpers -----------------------------------------------------------

async function apiRequest(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  const response = await fetch(url, {
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  });

  const isJson = response.headers.get('content-type')?.includes('application/json');
  const data = isJson ? await response.json() : null;

  return {
    ok: response.ok,
    status: response.status,
    data,
  };
}

// --- Status & Statistics ----------------------------------------------------

async function checkApiConnection() {
  try {
    const res = await apiRequest('/instances?limit=1');
    if (res.ok) {
      elements.apiStatus.className = 'status-badge connected';
      elements.apiStatus.querySelector('.status-text').textContent = 'API Підключено (CORS 200 OK)';
    } else {
      elements.apiStatus.className = 'status-badge error';
      elements.apiStatus.querySelector('.status-text').textContent = `Помилка API (${res.status})`;
    }
  } catch (err) {
    elements.apiStatus.className = 'status-badge error';
    elements.apiStatus.querySelector('.status-text').textContent = 'API недоступне (:8000)';
  }
}

async function loadMetadata() {
  try {
    const [dcRes, vendorRes] = await Promise.all([
      apiRequest('/datacenters'),
      apiRequest('/vendors'),
    ]);

    if (dcRes.ok && Array.isArray(dcRes.data)) {
      elements.statDatacenters.textContent = dcRes.data.length;
      dcRes.data.forEach((dc) => {
        const opt = document.createElement('option');
        opt.value = dc.id;
        opt.textContent = `${dc.city} (${dc.name})`;
        elements.datacenterSelect.appendChild(opt);
      });
    }

    if (vendorRes.ok && Array.isArray(vendorRes.data)) {
      elements.statVendors.textContent = vendorRes.data.length;
      vendorRes.data.forEach((v) => {
        const opt = document.createElement('option');
        opt.value = v.id;
        opt.textContent = v.name;
        elements.vendorSelect.appendChild(opt);
      });
    }
  } catch (e) {
    console.error('Failed to load metadata:', e);
  }
}

// --- Fetch & Render Instances -----------------------------------------------

async function loadInstances() {
  showLoading(true);
  hideError();
  elements.emptyState.classList.add('hidden');
  elements.instancesGrid.innerHTML = '';

  const params = new URLSearchParams();
  if (state.search.trim()) params.append('search', state.search.trim());
  if (state.category) params.append('category', state.category);
  if (state.datacenter_id) params.append('datacenter_id', state.datacenter_id);
  if (state.vendor_id) params.append('vendor_id', state.vendor_id);
  if (state.sort) params.append('sort', state.sort);
  params.append('page', state.page);
  params.append('limit', state.limit);

  try {
    const res = await apiRequest(`/instances?${params.toString()}`);
    showLoading(false);

    if (res.ok) {
      state.total = res.data.total;
      elements.statInstances.textContent = state.total;
      renderMetaText();
      renderInstances(res.data.results);
      renderPagination(res.data.total, res.data.page, res.data.limit);
    } else {
      showError(res.status, res.data?.error);
    }
  } catch (err) {
    showLoading(false);
    showError(0, {
      code: 'network_error',
      message: 'Не вдалося зʼєднатися з сервером API. Переконайтесь, що Django бекенд запущений на порту 8000.',
      details: { hint: 'Запустіть: python manage.py runserver у бекенд-репозиторії' },
    });
  }
}

function renderMetaText() {
  elements.resultsCount.textContent = `Знайдено серверів: ${state.total}`;

  const filters = [];
  if (state.search) filters.push(`«${state.search}»`);
  if (state.category) filters.push(categoryLabels[state.category] || state.category);
  if (state.datacenter_id) {
    const text = elements.datacenterSelect.options[elements.datacenterSelect.selectedIndex]?.text;
    if (text) filters.push(text);
  }
  if (state.vendor_id) {
    const text = elements.vendorSelect.options[elements.vendorSelect.selectedIndex]?.text;
    if (text) filters.push(text);
  }

  elements.activeFiltersInfo.textContent = filters.length ? `Фільтри: ${filters.join(' • ')}` : '';
}

function renderInstances(instances) {
  if (!instances || instances.length === 0) {
    elements.emptyState.classList.remove('hidden');
    elements.pagination.classList.add('hidden');
    return;
  }

  elements.emptyState.classList.add('hidden');
  elements.instancesGrid.innerHTML = instances
    .map((item) => {
      const gpuText = item.gpu_model
        ? `${item.gpu_count} × ${item.gpu_model}`
        : 'Немає (CPU)';
      const gpuClass = item.gpu_model ? 'gpu-val' : '';
      const catClass = `badge-${item.category}`;
      const catLabel = categoryLabels[item.category] || item.category;
      const availClass = item.is_available ? 'badge-available' : 'badge-unavailable';
      const availLabel = item.is_available ? 'Доступний' : 'Орендовано';

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
    .join('');

  // Attach click listeners to cards
  elements.instancesGrid.querySelectorAll('.btn-details').forEach((btn) => {
    btn.addEventListener('click', () => {
      openDetailModal(btn.dataset.id);
    });
  });
}

function renderPagination(total, page, limit) {
  const totalPages = Math.ceil(total / limit) || 1;
  if (totalPages <= 1) {
    elements.pagination.classList.add('hidden');
    return;
  }

  elements.pagination.classList.remove('hidden');
  elements.pageInfo.textContent = `Сторінка ${page} з ${totalPages}`;
  elements.prevPage.disabled = page <= 1;
  elements.nextPage.disabled = page >= totalPages;
}

// --- Modal Details ---------------------------------------------------------

async function openDetailModal(id) {
  try {
    const res = await apiRequest(`/instances/${id}`);
    if (!res.ok) {
      alert(`Не вдалося завантажити деталі сервера: ${res.data?.error?.message || 'Помилка'}`);
      return;
    }

    const item = res.data;
    elements.modalCategory.textContent = categoryLabels[item.category] || item.category;
    elements.modalName.textContent = item.name;
    elements.modalDescription.textContent = item.description || 'Опис конфігурації сервера відсутній.';
    elements.modalVcpu.textContent = `${item.vcpu} ядер`;
    elements.modalRam.textContent = `${item.ram_gb} GB`;
    elements.modalGpu.textContent = item.gpu_model
      ? `${item.gpu_count} × ${item.gpu_model}`
      : 'Відсутній (CPU only)';
    elements.modalStorage.textContent = `${item.storage_size_gb} GB (${item.storage_type})`;
    elements.modalNetwork.textContent = `${item.network_bandwidth_gbps} Gbps`;
    elements.modalPrice.textContent = `$${item.hourly_price} / год`;

    elements.modalDcName.textContent = item.datacenter.name;
    elements.modalDcLocation.textContent = `${item.datacenter.city}, ${item.datacenter.country} (${item.datacenter.region_code})`;

    elements.modalVendorName.textContent = item.vendor.name;
    elements.modalVendorArch.textContent = item.vendor.architecture;

    if (item.is_available) {
      elements.modalAvailability.innerHTML = '<span class="badge badge-available">Вільний для бронювання</span>';
    } else {
      elements.modalAvailability.innerHTML = '<span class="badge badge-unavailable">Тимчасово недоступний</span>';
    }

    elements.modalBackdrop.classList.remove('hidden');
  } catch (err) {
    console.error('Failed to open modal:', err);
  }
}

function closeModal() {
  elements.modalBackdrop.classList.add('hidden');
}

// --- Loading & Error UI ----------------------------------------------------

function showLoading(show) {
  if (show) {
    elements.loadingSpinner.classList.remove('hidden');
    elements.instancesGrid.classList.add('hidden');
  } else {
    elements.loadingSpinner.classList.add('hidden');
    elements.instancesGrid.classList.remove('hidden');
  }
}

function showError(status, errorObj) {
  elements.errorBox.classList.remove('hidden');
  elements.errorStatus.textContent = status ? `HTTP ${status}` : 'NETWORK ERROR';
  elements.errorCode.textContent = errorObj?.code || 'error';
  elements.errorMessage.textContent = errorObj?.message || 'Виникла непередбачена помилка.';

  if (errorObj?.details && Object.keys(errorObj.details).length > 0) {
    elements.errorDetails.classList.remove('hidden');
    elements.errorDetails.textContent = JSON.stringify(errorObj.details, null, 2);
  } else {
    elements.errorDetails.classList.add('hidden');
  }
}

function hideError() {
  elements.errorBox.classList.add('hidden');
}

// --- Interactive CORS Demo -------------------------------------------------

async function runDemo(demoType) {
  elements.demoOutputContainer.classList.remove('hidden');
  elements.demoResponseJson.textContent = 'Виконується HTTP запит...';
  elements.demoStatusPill.textContent = 'WAIT';
  elements.demoStatusPill.className = 'status-tag';

  let reqMethod = 'GET';
  let reqPath = '';
  let options = {};

  if (demoType === 'conflict') {
    // 409 Conflict: trying to delete datacenter #1 which has instances
    reqMethod = 'DELETE';
    reqPath = '/datacenters/1';
    options = { method: 'DELETE' };
    elements.demoRequestInfo.textContent = 'DELETE /api/v1/datacenters/1';
  } else if (demoType === 'validation') {
    // 400 Bad Request: SLA > 100
    reqMethod = 'POST';
    reqPath = '/datacenters';
    options = {
      method: 'POST',
      body: JSON.stringify({
        name: 'test-dc-invalid',
        region_code: 'eu-west-1',
        city: 'Kyiv',
        country: 'Ukraine',
        sla_percent: '150.00',
      }),
    };
    elements.demoRequestInfo.textContent = 'POST /api/v1/datacenters (sla_percent=150.00)';
  } else if (demoType === 'notfound') {
    // 404 Not Found
    reqMethod = 'GET';
    reqPath = '/instances/9999';
    options = { method: 'GET' };
    elements.demoRequestInfo.textContent = 'GET /api/v1/instances/9999';
  }

  try {
    const res = await apiRequest(reqPath, options);
    elements.demoStatusPill.textContent = `HTTP ${res.status}`;

    if (res.status === 409) {
      elements.demoStatusPill.className = 'status-tag pill-409';
    } else if (res.status === 400) {
      elements.demoStatusPill.className = 'status-tag pill-400';
    } else if (res.status === 404) {
      elements.demoStatusPill.className = 'status-tag pill-404';
    } else {
      elements.demoStatusPill.className = 'status-tag';
    }

    elements.demoResponseJson.textContent = JSON.stringify(res.data, null, 2);
  } catch (err) {
    elements.demoStatusPill.textContent = 'NETWORK FAIL';
    elements.demoStatusPill.className = 'status-tag pill-400';
    elements.demoResponseJson.textContent = `Помилка запиту: ${err.message}`;
  }
}

// --- Event Handlers --------------------------------------------------------

function setupEvents() {
  // Search with debounce
  let searchTimeout;
  elements.searchInput.addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    const value = e.target.value;
    elements.searchClear.classList.toggle('hidden', !value);
    searchTimeout = setTimeout(() => {
      state.search = value;
      state.page = 1;
      loadInstances();
    }, 300);
  });

  elements.searchClear.addEventListener('click', () => {
    elements.searchInput.value = '';
    elements.searchClear.classList.add('hidden');
    state.search = '';
    state.page = 1;
    loadInstances();
  });

  // Category Tabs
  elements.categoryTabs.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      elements.categoryTabs.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      state.category = btn.dataset.category;
      state.page = 1;
      loadInstances();
    });
  });

  // Select Filters
  elements.datacenterSelect.addEventListener('change', (e) => {
    state.datacenter_id = e.target.value;
    state.page = 1;
    loadInstances();
  });

  elements.vendorSelect.addEventListener('change', (e) => {
    state.vendor_id = e.target.value;
    state.page = 1;
    loadInstances();
  });

  elements.sortSelect.addEventListener('change', (e) => {
    state.sort = e.target.value;
    state.page = 1;
    loadInstances();
  });

  // Reset Filters
  function resetAllFilters() {
    state.search = '';
    state.category = '';
    state.datacenter_id = '';
    state.vendor_id = '';
    state.sort = '';
    state.page = 1;

    elements.searchInput.value = '';
    elements.searchClear.classList.add('hidden');
    elements.categoryTabs.querySelectorAll('.tab-btn').forEach((b, idx) => {
      b.classList.toggle('active', idx === 0);
    });
    elements.datacenterSelect.value = '';
    elements.vendorSelect.value = '';
    elements.sortSelect.value = '';

    loadInstances();
  }

  elements.resetFilters.addEventListener('click', resetAllFilters);
  elements.emptyResetBtn.addEventListener('click', resetAllFilters);
  elements.retryBtn.addEventListener('click', loadInstances);

  // Pagination
  elements.prevPage.addEventListener('click', () => {
    if (state.page > 1) {
      state.page--;
      loadInstances();
      window.scrollTo({ top: 300, behavior: 'smooth' });
    }
  });

  elements.nextPage.addEventListener('click', () => {
    const totalPages = Math.ceil(state.total / state.limit);
    if (state.page < totalPages) {
      state.page++;
      loadInstances();
      window.scrollTo({ top: 300, behavior: 'smooth' });
    }
  });

  // Modal Close
  elements.modalClose.addEventListener('click', closeModal);
  elements.modalCloseFooter.addEventListener('click', closeModal);
  elements.modalBackdrop.addEventListener('click', (e) => {
    if (e.target === elements.modalBackdrop) closeModal();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !elements.modalBackdrop.classList.contains('hidden')) {
      closeModal();
    }
  });

  // Demo Buttons
  document.querySelectorAll('.btn-demo').forEach((btn) => {
    btn.addEventListener('click', () => {
      runDemo(btn.dataset.demo);
    });
  });
}

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// --- Initialization --------------------------------------------------------

async function init() {
  setupEvents();
  await checkApiConnection();
  await loadMetadata();
  await loadInstances();
}

init();
