/* =========================================================
   US Community Resource Guide — app.js
   Fetches from /api/* — no embedded data.
   ========================================================= */

const CAT_CLS = {
  'Food & Groceries':'cc-food','Meals':'cc-meals','Shelter':'cc-shelter',
  'Housing':'cc-housing','Health Care':'cc-health','Mental Health & Recovery':'cc-mental',
  'Legal Services':'cc-legal','Employment & Job Training':'cc-emp',
  'Benefits & Financial Aid':'cc-ben','Clothing':'cc-cloth',
  'Day Services/Hygiene':'cc-day','Domestic Violence & Sexual Assault':'cc-dv',
  'Youth Services':'cc-youth','Veteran Services':'cc-vet',
  'Immigration':'cc-imm','Reentry Resources':'cc-re',
  'Transportation':'cc-trans','Harm Reduction':'cc-harm',
  'Pet Care':'cc-pet','Family & Parenting':'cc-fam',
  'Disability & Aging':'cc-dis','Rental Assistance':'cc-rent',
  'Government Services':'cc-gov','Libraries':'cc-lib',
  'STI & HIV Services':'cc-sti',
  'Safe Parking':'cc-park'
};
const CAT_CLR = {
  'Food & Groceries':'#2e7d32','Meals':'#388e3c','Shelter':'#1565c0','Housing':'#0277bd',
  'Health Care':'#c2185b','Mental Health & Recovery':'#7b1fa2','Legal Services':'#e65100',
  'Employment & Job Training':'#ef6c00','Benefits & Financial Aid':'#f57f17',
  'Clothing':'#6d4c41','Day Services/Hygiene':'#00838f',
  'Domestic Violence & Sexual Assault':'#ad1457','Youth Services':'#558b2f',
  'Veteran Services':'#283593','Immigration':'#1a6b35','Reentry Resources':'#5d4037',
  'Transportation':'#0288d1','Harm Reduction':'#bf360c','Pet Care':'#558b2f',
  'Family & Parenting':'#6a1b9a','Disability & Aging':'#00695c',
  'Rental Assistance':'#1976d2','Government Services':'#455a64',
  'Libraries':'#546e7a','STI & HIV Services':'#880e4f'
};

// ── State ──────────────────────────────────────────────────
const S = {
  query: '', state: '', county: '', category: '',
  page: 1, limit: 24, total: 0, pages: 0,
  loading: false, debounce: null, statesData: []
};

// ── DOM ────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const searchInput   = $('searchInput');
const searchClear   = $('searchClear');
const stateFilter   = $('stateFilter');
const countyFilter  = $('countyFilter');
const categoryFilter= $('categoryFilter');
const filterReset   = $('filterReset');
const cardsGrid     = $('cardsGrid');
const pagination    = $('pagination');
const pageInfo      = $('pageInfo');
const emptyState    = $('emptyState');
const loadingState  = $('loadingState');
const rsumWrap      = $('rsumWrap');
const resultsSummary= $('resultsSummary');
const hcount        = $('hcount');
const pillTrack     = $('pillTrack');
const modalOverlay  = $('modalOverlay');
const modal         = $('modal');
const modalClose    = $('modalClose');
const modalTitle    = $('modalTitle');
const modalLoc      = $('modalLoc');
const modalBadge    = $('modalBadge');
const modalActions  = $('modalActions');
const modalHours    = $('modalHours');
const modalBody     = $('modalBody');
const toast         = $('toast');

// ── Init ───────────────────────────────────────────────────
async function init() {
  // Restore saved filters from localStorage (persists across parking page navigation)
  const savedState  = localStorage.getItem('rcg_state')  || '';
  const savedCounty = localStorage.getItem('rcg_county') || '';
  const savedCat    = localStorage.getItem('rcg_cat')    || '';
  const savedQuery  = localStorage.getItem('rcg_query')  || '';

  try {
    const res = await fetch('/api/meta');
    const meta = await res.json();
    hcount.textContent = meta.total.toLocaleString();
    S.statesData = meta.states;

    // State filter
    for (const s of meta.states) {
      const opt = document.createElement('option');
      opt.value = s.name;
      opt.textContent = s.name === 'National' ? '🌐 National (All States)' : s.name;
      stateFilter.appendChild(opt);
    }

    // Category filter + pills
    for (const { name } of meta.categories) {
      const opt = document.createElement('option');
      opt.value = name;
      // Add parking icon to Safe Parking in dropdown
      opt.textContent = name === 'Safe Parking' ? '🚗 Safe Parking' : name;
      categoryFilter.appendChild(opt);

      const pill = document.createElement('button');
      if (name === 'Safe Parking') {
        // Special green pill for parking — always first
        pill.className = 'pill pill-parking';
        pill.innerHTML = '🚗 Safe Parking';
        pill.dataset.cat = name;
        pill.addEventListener('click', () => togglePill(pill, name));
        pillTrack.prepend(pill);
      } else {
        pill.className = 'pill';
        pill.textContent = name;
        pill.dataset.cat = name;
        pill.addEventListener('click', () => togglePill(pill, name));
        pillTrack.appendChild(pill);
      }
    }

    // Restore saved state
    if (savedState) {
      S.state = savedState;
      stateFilter.value = savedState;
      populateCounties(savedState);
      if (savedCounty) {
        S.county = savedCounty;
        countyFilter.value = savedCounty;
      }
    }
    if (savedCat) {
      S.category = savedCat;
      categoryFilter.value = savedCat;
      syncPills();
      if (savedCat === 'Safe Parking') updateParkingBanner();
    }
    if (savedQuery) {
      S.query = savedQuery;
      searchInput.value = savedQuery;
      searchClear.hidden = false;
    }
  } catch (e) { console.error('Meta load failed:', e); }

  fetchResources();
  bindEvents();
  loadLearnedCount();
  restoreNearMeState();
}

// Show/hide parking map banner based on active category
function updateParkingBanner() {
  const existing = document.getElementById('parkingBanner');
  if (S.category === 'Safe Parking') {
    if (!existing) {
      const banner = document.createElement('div');
      banner.id = 'parkingBanner';
      banner.style.cssText = `
        background:#1b5e20;padding:10px 14px;text-align:center;
        border-bottom:2px solid #145214;
      `;
      banner.innerHTML = `
        <a href="/parking" target="_blank" rel="noopener noreferrer"
           style="color:#fff;text-decoration:none;font-family:'Barlow Condensed',sans-serif;
                  font-size:14px;font-weight:700;letter-spacing:.04em;
                  display:inline-flex;align-items:center;gap:8px">
          🗺️ Open Interactive Parking Map
          <span style="background:rgba(255,255,255,.2);padding:2px 10px;border-radius:10px;font-size:12px">Find Near Me →</span>
        </a>
      `;
      // Insert above the grid
      const main = document.getElementById('mainContent');
      if (main) main.insertBefore(banner, main.firstChild);
    }
  } else if (existing) {
    existing.remove();
  }
}

async function loadLearnedCount() {
  try {
    const el = document.getElementById('learnedCount');
    if (!el) return;
    const res = await fetch('/api/learned');
    const data = await res.json();
    const total = data.total.toLocaleString();
    const learned = data.learned;
    if (learned > 0) {
      el.textContent = `${total} resources · 💡 ${learned} AI-learned`;
      el.title = `${learned} resources were auto-discovered by the AI assistant`;
    } else {
      el.textContent = `${total} resources · Free services only`;
    }
  } catch(e) {
    const el = document.getElementById('learnedCount');
    if (el) el.textContent = 'Free services only';
  }
}

// ── Fetch resources from API ───────────────────────────────
async function fetchResources() {
  if (S.loading) return;
  S.loading = true;
  loadingState.style.display = 'flex';
  cardsGrid.style.opacity = '0.4';
  emptyState.style.display = 'none';

  const params = new URLSearchParams({
    page: S.page, limit: S.limit
  });
  if (S.query)    params.set('q', S.query);
  if (S.state)    params.set('state', S.state);
  if (S.county)   params.set('county', S.county);
  if (S.category) params.set('category', S.category);

  try {
    const res = await fetch(`/api/resources?${params}`);
    const data = await res.json();
    S.total = data.total;
    S.pages = data.pages;
    renderCards(data.items);
    renderPager(data.page, data.pages, data.total);
    updateSummary(data.total);
  } catch (e) {
    cardsGrid.innerHTML = '<p style="color:var(--rust);padding:20px;grid-column:1/-1">Error loading resources. Please refresh.</p>';
  } finally {
    S.loading = false;
    loadingState.style.display = 'none';
    cardsGrid.style.opacity = '1';
  }
}

// ── Render cards ───────────────────────────────────────────
function renderCards(items) {
  cardsGrid.innerHTML = '';
  if (!items.length) {
    emptyState.style.display = 'block';
    pagination.innerHTML = '';
    pageInfo.style.display = 'none';
    return;
  }
  emptyState.style.display = 'none';

  const frag = document.createDocumentFragment();
  items.forEach(r => {
    const card = document.createElement('article');
    card.className = 'card ' + (CAT_CLS[r.category] || '');
    card.setAttribute('role', 'listitem');
    card.setAttribute('tabindex', '0');
    card.setAttribute('aria-label', r.name);

    // Phone/map/location footer
    let foot = '';
    if (r.phone) {
      const cp = r.phone.replace(/[^\d+]/g, '');
      if (cp.length >= 7) {
        foot += `<a href="tel:${cp}" class="cphone" onclick="event.stopPropagation()">
          <svg viewBox="0 0 16 16" fill="none"><path d="M3 2h3l1.5 3.5-1.5 1a7 7 0 003.5 3.5l1-1.5L14 10v3a1 1 0 01-1 1C6 14 2 10 2 3a1 1 0 011-1z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>
          ${esc(r.phone)}</a>`;
      }
    }
    if (r.address) {
      foot += `<a href="https://maps.google.com/?q=${encodeURIComponent(r.address)}" target="_blank" rel="noopener noreferrer" class="cmap" onclick="event.stopPropagation()">
        <svg viewBox="0 0 16 16" fill="none"><path d="M8 1a5 5 0 00-5 5c0 3.5 5 9 5 9s5-5.5 5-9a5 5 0 00-5-5zm0 7a2 2 0 110-4 2 2 0 010 4z" fill="currentColor"/></svg>Map</a>`;
    }
    const locText = r.state === 'National' ? '🌐 National'
      : r.county === 'Statewide' ? r.state
      : (r.county || '').replace(' County','').replace(' City','') + (r.state && r.state !== 'Oregon' ? ', ' + r.state.substring(0,2).toUpperCase() : '');
    foot += `<span class="cloc${r.state === 'National' ? ' nat' : ''}">${esc(locText)}</span>`;

    // Hours on card
    const hoursHtml = r.hours ? `<div class="chours">
      <svg viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="1.5"/><path d="M8 5v3l2 2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
      ${esc(r.hours)}</div>` : '';

    card.innerHTML = `
      <div class="chead">
        <h3 class="cname">${esc(r.name)}</h3>
        <span class="ccat">${esc(r.category)}</span>
      </div>
      ${r.description ? `<p class="cdesc">${esc(r.description)}</p>` : ''}
      ${hoursHtml}
      <div class="cfoot">${foot}</div>`;

    card.addEventListener('click', () => openModal(r));
    card.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openModal(r); }
    });
    frag.appendChild(card);
  });
  cardsGrid.appendChild(frag);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ── Pagination ─────────────────────────────────────────────
function renderPager(cur, tot, total) {
  pagination.innerHTML = '';
  pageInfo.style.display = 'none';

  if (tot <= 1) {
    if (total > 0) {
      pageInfo.style.display = 'block';
      pageInfo.textContent = `${total.toLocaleString()} result${total !== 1 ? 's' : ''}`;
    }
    return;
  }

  const nums = getPageNums(cur, tot);
  pagination.appendChild(mkBtn('←', cur > 1, () => goPage(cur - 1)));
  for (const p of nums) {
    if (p === '…') {
      const el = document.createElement('span');
      el.className = 'pgdot'; el.textContent = '…';
      pagination.appendChild(el);
    } else {
      const btn = mkBtn(p, true, () => goPage(p));
      if (p === cur) btn.classList.add('active');
      pagination.appendChild(btn);
    }
  }
  pagination.appendChild(mkBtn('→', cur < tot, () => goPage(cur + 1)));

  pageInfo.style.display = 'block';
  const start = (cur - 1) * S.limit + 1;
  const end = Math.min(cur * S.limit, total);
  pageInfo.textContent = `Showing ${start.toLocaleString()}–${end.toLocaleString()} of ${total.toLocaleString()} results`;
}

function getPageNums(c, t) {
  if (t <= 7) return Array.from({ length: t }, (_, i) => i + 1);
  const p = [1];
  if (c > 3) p.push('…');
  for (let i = Math.max(2, c - 1); i <= Math.min(t - 1, c + 1); i++) p.push(i);
  if (c < t - 2) p.push('…');
  p.push(t);
  return p;
}

function mkBtn(label, enabled, onClick) {
  const btn = document.createElement('button');
  btn.className = 'pgbtn'; btn.textContent = label; btn.disabled = !enabled;
  if (enabled) btn.addEventListener('click', onClick);
  return btn;
}

function goPage(p) {
  S.page = p;
  fetchResources();
}

// ── Summary ────────────────────────────────────────────────
function updateSummary(total) {
  const has = S.query || S.state || S.county || S.category;
  rsumWrap.style.display = has ? 'block' : 'none';
  if (has) {
    const parts = [];
    if (S.state) parts.push(S.state);
    if (S.county) parts.push(S.county.replace(' County', ''));
    if (S.category) parts.push(S.category);
    if (S.query) parts.push(`"${S.query}"`);
    resultsSummary.textContent = `${total.toLocaleString()} result${total !== 1 ? 's' : ''} · ${parts.join(' · ')}`;
  }
}

// ── Modal ──────────────────────────────────────────────────
let _curResource = null;

function openModal(r) {
  _curResource = r;
  const cc = CAT_CLR[r.category] || '#e8442a';

  modalBadge.textContent = r.category;
  modalBadge.style.background = cc;
  modalTitle.textContent = r.name;

  const loc = r.state === 'National' ? '🌐 National Resource'
    : r.county === 'Statewide' ? `${r.state} — Statewide`
    : `${r.county} · ${r.state}`;
  modalLoc.textContent = loc;

  // Action buttons
  modalActions.innerHTML = '';
  if (r.phone) {
    const cp = r.phone.replace(/[^\d+]/g, '');
    if (cp.length >= 7) {
      modalActions.innerHTML += `<a href="tel:${cp}" class="mbtn mbtn-p">
        <svg viewBox="0 0 16 16" fill="none"><path d="M3 2h3l1.5 3.5-1.5 1a7 7 0 003.5 3.5l1-1.5L14 10v3a1 1 0 01-1 1C6 14 2 10 2 3a1 1 0 011-1z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>
        ${esc(r.phone)}</a>`;
    } else {
      modalActions.innerHTML += `<span class="mbtn mbtn-p" style="cursor:default">📱 ${esc(r.phone)}</span>`;
    }
  }
  if (r.address) {
    const mapUrl = `https://maps.google.com/?q=${encodeURIComponent(r.address)}`;
    modalActions.innerHTML += `<a href="${mapUrl}" target="_blank" rel="noopener noreferrer" class="mbtn mbtn-s">
      <svg viewBox="0 0 16 16" fill="none"><path d="M8 1a5 5 0 00-5 5c0 3.5 5 9 5 9s5-5.5 5-9a5 5 0 00-5-5zm0 7a2 2 0 110-4 2 2 0 010 4z" fill="currentColor"/></svg>
      Directions</a>`;
  }
  if (r.website) {
    const url = r.website.startsWith('http') ? r.website : 'https://' + r.website;
    modalActions.innerHTML += `<a href="${url}" target="_blank" rel="noopener noreferrer" class="mbtn mbtn-s">
      <svg viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="1.5"/><path d="M8 2c-2 0-3 2.5-3 6s1 6 3 6M8 2c2 0 3 2.5 3 6s-1 6-3 6M2 8h12" stroke="currentColor" stroke-width="1.5"/></svg>
      Website</a>`;
  }
  // Special button for Safe Parking category
  if (r.category === 'Safe Parking') {
    const lat = localStorage.getItem('rcg_lat');
    const lng = localStorage.getItem('rcg_lng');
    const mapUrl = lat && lng
      ? `https://www.google.com/maps/search/${encodeURIComponent(r.name)}/@${lat},${lng},13z`
      : `https://www.google.com/maps/search/${encodeURIComponent(r.name + ' safe parking')}`;
    modalActions.innerHTML += `<a href="${mapUrl}" target="_blank" rel="noopener noreferrer" class="mbtn mbtn-p" style="background:#1b5e20">
      <svg viewBox="0 0 16 16" fill="none" width="14" height="14"><path d="M8 1a5 5 0 00-5 5c0 3.5 5 9 5 9s5-5.5 5-9a5 5 0 00-5-5zm0 7a2 2 0 110-4 2 2 0 010 4z" fill="currentColor"/></svg>
      Open in Maps</a>`;
    modalActions.innerHTML += `<a href="/parking" target="_blank" rel="noopener noreferrer" class="mbtn mbtn-s">
      🚗 Parking Finder</a>`;
  }
  modalActions.innerHTML += `<button onclick="shareResource()" class="mbtn mbtn-share">
    <svg viewBox="0 0 16 16" fill="none"><path d="M12 4a2 2 0 11-4 0 2 2 0 014 0zm0 0l-8 4m8 4a2 2 0 11-4 0 2 2 0 014 0zm0 0L4 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
    Share</button>`;

  // Hours
  modalHours.innerHTML = '';
  if (r.hours) {
    modalHours.innerHTML = `<div class="mhours">
      <svg viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="1.5"/><path d="M8 5v3l2 2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
      <span><strong>Hours:</strong> ${esc(r.hours)}</span>
    </div>`;
  }

  // Body
  let body = '';
  if (r.description) body += mfld('About', esc(r.description));

  // Requirements
  if (r.req && r.req.length) {
    const items = Array.isArray(r.req) ? r.req : [r.req];
    const listItems = items.map(i => `<li>${esc(i)}</li>`).join('');
    body += `<div class="mfld">
      <div class="mflbl req-lbl">✓ Requirements &amp; Eligibility</div>
      <div class="mfval"><ul class="req-list">${listItems}</ul></div>
    </div>`;
  }

  if (r.address) {
    const mapUrl = `https://maps.google.com/?q=${encodeURIComponent(r.address)}`;
    const osmUrl = `https://www.openstreetmap.org/search?query=${encodeURIComponent(r.address)}`;
    body += `<div class="mfld">
      <div class="mflbl">Address</div>
      <div class="mfval">${esc(r.address)}</div>
      <div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap">
        <a href="${mapUrl}" target="_blank" rel="noopener noreferrer"
           style="display:inline-flex;align-items:center;gap:4px;font-family:var(--fd);font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;padding:5px 11px;border-radius:4px;background:var(--rust);color:#fff;text-decoration:none">
          🗺️ Google Maps
        </a>
        <a href="${osmUrl}" target="_blank" rel="noopener noreferrer"
           style="display:inline-flex;align-items:center;gap:4px;font-family:var(--fd);font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;padding:5px 11px;border-radius:4px;background:var(--off);border:1.5px solid var(--bdr);color:var(--coal);text-decoration:none">
          🌍 OpenStreetMap
        </a>
      </div>
    </div>`;
  }
  if (r.website) {
    const url = r.website.startsWith('http') ? r.website : 'https://' + r.website;
    body += mfld('Website', `<a href="${url}" target="_blank" rel="noopener noreferrer">${esc(r.website)}</a>`);
  }
  modalBody.innerHTML = body;

  modalOverlay.style.display = 'flex';
  document.body.style.overflow = 'hidden';
  setTimeout(() => modalClose.focus(), 60);
}

function mfld(label, value) {
  return `<div class="mfld"><div class="mflbl">${label}</div><div class="mfval">${value}</div></div>`;
}

function closeModal() {
  modalOverlay.style.display = 'none';
  document.body.style.overflow = '';
  _curResource = null;
}

function shareResource() {
  const r = _curResource;
  if (!r) return;
  const text = [r.name, r.phone, r.address, r.website ? (r.website.startsWith('http') ? r.website : 'https://' + r.website) : '']
    .filter(Boolean).join(' | ');
  if (navigator.share) {
    navigator.share({ title: r.name, text }).catch(() => {});
  } else {
    navigator.clipboard?.writeText(text).then(() => showToast('Copied to clipboard!'));
  }
}

function showToast(msg) {
  toast.textContent = msg;
  toast.style.display = 'block';
  setTimeout(() => { toast.style.display = 'none'; }, 2200);
}

// ── Filters & Events ───────────────────────────────────────
function populateCounties(stateName) {
  countyFilter.innerHTML = '<option value="">All Counties / Regions</option>';
  if (!stateName) { countyFilter.disabled = true; return; }
  const found = S.statesData.find(s => s.name === stateName);
  if (!found) { countyFilter.disabled = true; return; }
  countyFilter.disabled = false;
  for (const co of found.counties) {
    const opt = document.createElement('option');
    opt.value = co; opt.textContent = co;
    countyFilter.appendChild(opt);
  }
}

function togglePill(btn, name) {
  S.category = S.category === name ? '' : name;
  categoryFilter.value = S.category;
  localStorage.setItem('rcg_cat', S.category);
  syncPills(); updateParkingBanner(); S.page = 1; fetchResources();
}

function syncPills() {
  document.querySelectorAll('.pill').forEach(p =>
    p.classList.toggle('active', p.dataset.cat === S.category)
  );
}

function resetAll() {
  searchInput.value = ''; searchClear.hidden = true;
  stateFilter.value = ''; countyFilter.value = ''; categoryFilter.value = '';
  countyFilter.disabled = true;
  countyFilter.innerHTML = '<option value="">All Counties / Regions</option>';
  S.query = ''; S.state = ''; S.county = ''; S.category = '';
  localStorage.setItem('rcg_state', '');
  localStorage.setItem('rcg_county', '');
  localStorage.setItem('rcg_cat', '');
  localStorage.setItem('rcg_query', '');
  S.page = 1; syncPills(); updateParkingBanner(); fetchResources(); searchInput.focus();
}

function bindEvents() {
  searchInput.addEventListener('input', () => {
    const val = searchInput.value.trim();
    searchClear.hidden = !val;
    clearTimeout(S.debounce);
    S.debounce = setTimeout(() => {
      S.query = val;
      localStorage.setItem('rcg_query', val);
      S.page = 1; fetchResources();
    }, 300);
  });

  searchClear.addEventListener('click', () => {
    searchInput.value = ''; searchClear.hidden = true;
    S.query = ''; localStorage.setItem('rcg_query', '');
    S.page = 1; fetchResources(); searchInput.focus();
  });

  stateFilter.addEventListener('change', () => {
    S.state = stateFilter.value; S.county = ''; S.page = 1;
    localStorage.setItem('rcg_state', S.state);
    localStorage.setItem('rcg_county', '');
    populateCounties(stateFilter.value);
    countyFilter.value = '';
    fetchResources();
  });

  countyFilter.addEventListener('change', () => {
    S.county = countyFilter.value; S.page = 1;
    localStorage.setItem('rcg_county', S.county);
    fetchResources();
  });

  categoryFilter.addEventListener('change', () => {
    S.category = categoryFilter.value;
    localStorage.setItem('rcg_cat', S.category);
    S.page = 1; syncPills(); updateParkingBanner(); fetchResources();
  });

  filterReset.addEventListener('click', resetAll);
  modalClose.addEventListener('click', closeModal);
  modalOverlay.addEventListener('click', e => { if (e.target === modalOverlay) closeModal(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
}

// ── Utilities ──────────────────────────────────────────────
function esc(s) {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Boot ───────────────────────────────────────────────────

// ── Near Me — uses GPS + reverse geocode to set state/county ──────────
async function findNearMe() {
  const btn = document.getElementById('nearMeBtn');

  if (!navigator.geolocation) {
    showLocToast('⚠️ Location not supported on this browser');
    return;
  }

  // Check if permission already granted — skip prompt if so
  if (navigator.permissions) {
    try {
      const perm = await navigator.permissions.query({ name: 'geolocation' });
      if (perm.state === 'denied') {
        showLocToast('⚠️ Location blocked. Go to browser Settings → Site Settings → Location to allow it.');
        return;
      }
    } catch(e) { /* permissions API not supported — proceed anyway */ }
  }

  btn.disabled = true;
  btn.innerHTML = `<span class="nmspinner"></span><span>Locating…</span>`;
  showLocToast('📍 Getting your location — allow access if prompted…');

  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      const { latitude: lat, longitude: lng } = pos.coords;
      showLocToast('🔍 Finding your area…');

      try {
        // Reverse geocode with OpenStreetMap Nominatim (free, no API key)
        const res = await fetch(
          `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=10`,
          { headers: { 'Accept-Language': 'en' } }
        );
        const data = await res.json();
        const addr = data.address || {};

        // Extract state and county
        const stateName = addr.state || '';
        const countyRaw = addr.county || addr.city_district || '';
        const county = countyRaw
          ? (countyRaw.includes('County') ? countyRaw : countyRaw + ' County')
          : '';

        if (!stateName) {
          showLocToast('⚠️ Could not detect your location. Try selecting a state manually.');
          resetNearMeBtn();
          return;
        }

        // Apply the filters
        const stateEl = document.getElementById('stateFilter');
        const countyEl = document.getElementById('countyFilter');

        // Set state
        S.state = stateName;
        stateEl.value = stateName;
        localStorage.setItem('rcg_state', stateName);

        // Populate counties then set county
        populateCounties(stateName);
        if (county) {
          // Try exact match first, then prefix match
          const opts = [...countyEl.options].map(o => o.value);
          const match = opts.find(o => o === county)
            || opts.find(o => o.toLowerCase().includes(countyRaw.toLowerCase()))
            || opts.find(o => countyRaw.toLowerCase().includes(o.replace(' County','').toLowerCase()));

          if (match) {
            S.county = match;
            countyEl.value = match;
            localStorage.setItem('rcg_county', match);
          }
        }

        S.page = 1;
        fetchResources();

        const locDesc = S.county
          ? `${S.county.replace(' County','')} · ${stateName}`
          : stateName;
        showLocToast(`✅ Showing resources near you — ${locDesc}`);

        btn.disabled = false;
        btn.classList.add('active');
        btn.innerHTML = `<svg viewBox="0 0 20 20" fill="none" width="15" height="15"><circle cx="10" cy="10" r="3" fill="currentColor"/><path d="M10 2v2.5M10 15.5V18M2 10h2.5M15.5 10H18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="10" cy="10" r="7" stroke="currentColor" stroke-width="1.5"/></svg><span>Near Me ✓</span>`;

        // Save coordinates for parking page
        localStorage.setItem('rcg_lat', lat);
        localStorage.setItem('rcg_lng', lng);

      } catch (e) {
        console.error('Reverse geocode error:', e);
        showLocToast('⚠️ Could not detect area. Select your state manually.');
        resetNearMeBtn();
      }
    },
    (err) => {
      const msgs = {
        1: '⚠️ Location blocked. Go to Settings → Site Settings → Location to allow.',
        2: '⚠️ Location unavailable. Check GPS/WiFi and try again.',
        3: '⚠️ Location timed out. Move to an area with better signal and try again.',
      };
      showLocToast(msgs[err.code] || '⚠️ Could not get location. Select your state manually.');
      resetNearMeBtn();
    },
    { timeout: 12000, maximumAge: 300000, enableHighAccuracy: false }
  );
}

function resetNearMeBtn() {
  const btn = document.getElementById('nearMeBtn');
  if (!btn) return;
  btn.disabled = false;
  btn.classList.remove('active');
  btn.innerHTML = `<svg viewBox="0 0 20 20" fill="none" width="15" height="15"><circle cx="10" cy="10" r="3" fill="currentColor"/><path d="M10 2v2.5M10 15.5V18M2 10h2.5M15.5 10H18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="10" cy="10" r="7" stroke="currentColor" stroke-width="1.5"/></svg><span>Near Me</span>`;
}

function showLocToast(msg) {
  // Remove existing toast
  const old = document.getElementById('locToast');
  if (old) old.remove();
  const t = document.createElement('div');
  t.className = 'loc-toast';
  t.id = 'locToast';
  t.textContent = msg;
  document.body.appendChild(t);
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(() => t.remove(), 3500);
}

// Also restore Near Me active state if location was previously set
function restoreNearMeState() {
  const savedLat = localStorage.getItem('rcg_lat');
  const savedState = localStorage.getItem('rcg_state');
  if (savedLat && savedState) {
    const btn = document.getElementById('nearMeBtn');
    if (btn) {
      btn.classList.add('active');
      btn.innerHTML = `<svg viewBox="0 0 20 20" fill="none" width="15" height="15"><circle cx="10" cy="10" r="3" fill="currentColor"/><path d="M10 2v2.5M10 15.5V18M2 10h2.5M15.5 10H18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="10" cy="10" r="7" stroke="currentColor" stroke-width="1.5"/></svg><span>Near Me ✓</span>`;
    }
  }
}

document.addEventListener('DOMContentLoaded', init);

// ── AI CHAT ASSISTANT ──────────────────────────────────────────────────

const chatFab   = document.getElementById('chatFab');
const chatPanel = document.getElementById('chatPanel');
const chatClose = document.getElementById('chatClose');
const chatMessages = document.getElementById('chatMessages');
const chatInput = document.getElementById('chatInput');
const chatSend  = document.getElementById('chatSend');

function openChat() { chatPanel.style.display = 'flex'; chatInput.focus(); }
function closeChat() { chatPanel.style.display = 'none'; }

chatFab.addEventListener('click', () => {
  chatPanel.style.display === 'none' ? openChat() : closeChat();
});
chatClose.addEventListener('click', closeChat);

chatInput.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
});
chatSend.addEventListener('click', sendMessage);

function addMessage(text, role) {
  const div = document.createElement('div');
  div.className = `chat-msg chat-msg-${role}`;
  const bubble = document.createElement('div');
  bubble.className = 'chat-bubble';
  bubble.textContent = text;
  div.appendChild(bubble);
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  return div;
}

function addTyping() {
  const div = document.createElement('div');
  div.className = 'chat-msg chat-msg-bot chat-typing';
  div.id = 'chatTyping';
  div.innerHTML = '<div class="chat-bubble">Finding resources…</div>';
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}
function removeTyping() {
  const t = document.getElementById('chatTyping');
  if (t) t.remove();
}

async function sendMessage() {
  const q = chatInput.value.trim();
  if (!q) return;
  chatInput.value = '';
  chatSend.disabled = true;

  addMessage(q, 'user');
  addTyping();

  try {
    const res = await fetch('/api/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question: q,
        state: S.state || '',
        county: S.county || ''
      })
    });
    const data = await res.json();
    removeTyping();

    // Show the answer
    addMessage(data.answer || data.error || 'Sorry, something went wrong. Try again.', 'bot');

    // Show source + auto-learn indicator
    const meta = document.createElement('div');
    meta.style.cssText = 'font-size:11px;color:#aaa;padding:2px 4px;text-align:right;font-family:Barlow Condensed,sans-serif;letter-spacing:.03em';
    const src = data.source === 'ai' ? '✨ AI-enhanced' : '🗂️ Local database';
    const saved = data.saved > 0 ? ` · 💡 +${data.saved} new resource${data.saved > 1 ? 's' : ''} learned` : '';
    meta.textContent = src + saved;
    chatMessages.appendChild(meta);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    // If new resources were learned, show a brief toast
    if (data.saved > 0) {
      showToast(`💡 Learned ${data.saved} new resource${data.saved > 1 ? 's' : ''} from this search`);
    }
  } catch (e) {
    removeTyping();
    addMessage('Could not reach the assistant. Check your connection and try again.', 'bot');
  }
  chatSend.disabled = false;
  chatInput.focus();
}
