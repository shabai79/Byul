// Byul 프론트엔드 (프레임워크 없이 순수 JS). 화면 문구는 모두 i18n.js의 t()로 가져옵니다.
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const CATEGORIES = ['electronics', 'id', 'wallet', 'bag', 'camera', 'jewelry', 'clothing', 'pet', 'keepsake', 'other'];
const catName = (c) => (CATEGORIES.includes(c) ? t('cat.' + c) : c);
let me = null, feeRate = 0.1, map, markers;

async function api(url, opts = {}) {
  const o = { credentials: 'same-origin', ...opts, headers: { 'X-Lang': lang } };
  if (o.body && !(o.body instanceof FormData)) { o.headers['Content-Type'] = 'application/json'; o.body = JSON.stringify(o.body); }
  const r = await fetch(url, o);
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || t('error.generic'));
  return data;
}
function toast(msg) {
  document.querySelectorAll('.toast').forEach((x) => x.remove());
  const el = document.createElement('div'); el.className = 'toast'; el.textContent = msg;
  document.body.append(el); setTimeout(() => el.remove(), 2600);
}
const money = (n, cur = 'KRW') => new Intl.NumberFormat(locale(), { style: 'currency', currency: cur, currencyDisplay: 'narrowSymbol', maximumFractionDigits: 0 }).format(n || 0);
const fmtDate = (d) => (d ? new Date(d + 'T00:00:00').toLocaleDateString(locale()) : '');
const fmtTime = (d) => new Date(d).toLocaleString(locale());
// 사용자 글: HTML 이스케이프 후 서버가 가린 연락처 표시를 현재 언어로 바꿈
const userText = (s) => esc(s)
  .replace(/\[\[contact\]\]/g, `<span class="masked">${icon('lock')}${t('mask.contact')}</span>`)
  .replace(/\[\[link\]\]/g, `<span class="masked">${icon('lock')}${t('mask.link')}</span>`);
// 사용자 글 번역: 지금은 Google 번역을 새 창으로 열기 (API 키 없이 동작). 추후 DeepL/Papago API로 화면 내 번역 가능.
const translateUrl = (text) => `https://translate.google.com/?sl=auto&tl=${lang === 'zh' ? 'zh-CN' : lang}&op=translate&text=${encodeURIComponent(text.replace(/\[\[(contact|link)\]\]/g, '***'))}`;
const translateLink = (text, cls = '') => `<a class="translate ${cls}" target="_blank" rel="noopener" href="${esc(translateUrl(text))}">${icon('translate')}${t('btn.translate')}</a>`;

const modal = $('#modal');
function openModal(html) { $('#modalBody').innerHTML = html; modal.showModal(); }
modal.addEventListener('click', (e) => { if (e.target === modal || e.target.dataset.close != null) modal.close(); });

// ---------- 언어 ----------
function renderLangUI() {
  applyStatic();
  $('#langSel').innerHTML = Object.entries(LANGS).map(([c, n]) => `<option value="${c}" ${c === lang ? 'selected' : ''}>${n}</option>`).join('');
  renderChips();
  renderUser();
}

// ---------- 인증 ----------
function renderUser() {
  $('#userBox').innerHTML = me
    ? `${t('user.greet', { name: esc(me.name) })} <button class="link" id="logoutBtn">${t('btn.logout')}</button>`
    : `<button class="primary" id="loginBtn">${t('btn.login')}</button>`;
  $('#logoutBtn')?.addEventListener('click', async () => { await api('/api/logout', { method: 'POST' }); me = null; renderUser(); route(); });
  $('#loginBtn')?.addEventListener('click', () => showLogin());
}
function showLogin(after) {
  openModal(`
    <h3>${t('auth.title')}</h3>
    <form id="authForm">
      <label>${t('auth.name')} <input name="name" placeholder="${t('auth.namePh')}" /></label>
      <label>${t('auth.email')} <input name="email" type="email" required /></label>
      <label>${t('auth.password')} <input name="password" type="password" minlength="6" required /></label>
      <div class="row"><button class="primary" value="login">${t('auth.login')}</button><button value="signup">${t('auth.signup')}</button></div>
    </form>`);
  $('#authForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const mode = e.submitter.value; const f = Object.fromEntries(new FormData(e.target));
    try { me = await api('/api/' + mode, { method: 'POST', body: f }); modal.close(); renderUser(); toast(t('auth.welcome', { name: me.name })); after?.(); }
    catch (err) { toast(err.message); }
  });
}
const requireLogin = (fn) => (me ? fn() : showLogin(fn));

// ---------- 지도 ----------
function makeMap(el, center = [30, 10], zoom = 2) {
  const m = L.map(el, { worldCopyJump: true }).setView(center, zoom);
  // 체험판처럼 외부 지도 이미지를 못 쓰는 곳에서는 window.BYUL_BASEMAP으로 바탕 지도를 바꿀 수 있음
  if (window.BYUL_BASEMAP) window.BYUL_BASEMAP(m);
  else L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', { maxZoom: 19, subdomains: 'abcd', attribution: '&copy; OpenStreetMap &copy; CARTO' }).addTo(m);
  return m;
}
async function geocode(q) { // OpenStreetMap Nominatim 장소 검색 (결과 이름은 현재 언어로)
  const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&accept-language=${lang}&q=` + encodeURIComponent(q));
  const [hit] = await r.json(); return hit && { lat: +hit.lat, lng: +hit.lon, name: hit.display_name };
}
// 잉크색 물방울 핀 (기본 파란 핀 대신)
const inkIcon = (cat = 'pin') => L.divIcon({ className: '', html: `<div class="mk"><span>${icon(cat)}</span></div>`, iconSize: [34, 42], iconAnchor: [17, 40], tooltipAnchor: [0, -34] });
function pinPicker(el, onPick) {
  const m = makeMap(el); let pin;
  const set = (lat, lng) => { pin ? pin.setLatLng([lat, lng]) : (pin = L.marker([lat, lng], { icon: inkIcon() }).addTo(m)); onPick(lat, lng); };
  m.on('click', (e) => set(e.latlng.lat, e.latlng.lng));
  setTimeout(() => m.invalidateSize(), 50);
  return { map: m, set };
}

// ---------- 목록·필터 ----------
const filters = { category: '', sort: 'new', near: null };
let markerById = {};
function ago(iso) {
  const s = (Date.now() - new Date(iso)) / 1000, rtf = new Intl.RelativeTimeFormat(locale(), { numeric: 'auto' });
  if (s < 3600) return rtf.format(-Math.max(1, Math.round(s / 60)), 'minute');
  if (s < 86400) return rtf.format(-Math.round(s / 3600), 'hour');
  return rtf.format(-Math.round(s / 86400), 'day');
}
function geoKm(a, b) {
  const R = 6371, r = (d) => (d * Math.PI) / 180, dLat = r(b.lat - a.lat), dLng = r(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
const fmtKm = (d) => (d < 10 ? d.toLocaleString(locale(), { maximumFractionDigits: 1 }) : Math.round(d).toLocaleString(locale())) + 'km';
function renderChips() {
  $('#chips').innerHTML = ['', ...CATEGORIES].map((c) =>
    `<button class="chip ${filters.category === c ? 'on' : ''}" data-cat="${c}">${c ? icon(c) + t('cat.' + c) : t('cat.all')}</button>`).join('');
  $('#chips').querySelectorAll('[data-cat]').forEach((b) => b.addEventListener('click', () => { filters.category = b.dataset.cat; renderChips(); loadPosts(); }));
}
async function loadPosts() {
  // 현재 위치는 서버로 보내지 않음(위치정보 보호): 목록을 받은 뒤 이 기기 안에서만 거리를 계산·정렬
  const p = new URLSearchParams({ q: $('#q').value, category: filters.category, sort: filters.sort === 'near' ? 'new' : filters.sort });
  const posts = await api('/api/posts?' + p);
  if (filters.near) {
    posts.forEach((x) => (x.distanceKm = Math.round(geoKm(filters.near, x) * 10) / 10));
    if (filters.sort === 'near') posts.sort((a, b) => a.distanceKm - b.distanceKm);
  }
  markers.clearLayers(); markerById = {};
  posts.forEach((x) => {
    markerById[x.id] = L.marker([x.lat, x.lng], { icon: inkIcon(x.category) })
      .bindTooltip(esc(x.title)).on('click', () => showPost(x.id)).addTo(markers);
  });
  const filtered = $('#q').value || filters.category;
  $('#count').innerHTML = t('list.count', { n: posts.length });
  $('#list').innerHTML = posts.length ? posts.map(cardHtml).join('')
    : `<li class="empty"><div class="empty-icon">${icon('search')}</div><p>${t(filtered ? 'list.noResult' : 'list.empty')}</p>${filtered ? `<button id="resetBtn">${t('btn.reset')}</button>` : ''}</li>`;
  $('#resetBtn')?.addEventListener('click', () => { $('#q').value = ''; filters.category = ''; renderChips(); loadPosts(); });
  $('#list').querySelectorAll('[data-id]').forEach((el) => {
    const m = markerById[el.dataset.id];
    el.addEventListener('mouseenter', () => m?.openTooltip());
    el.addEventListener('mouseleave', () => m?.closeTooltip());
    el.addEventListener('click', () => { if (m && window.innerWidth > 820) map.flyTo(m.getLatLng(), Math.max(map.getZoom(), 12), { duration: 0.6 }); showPost(el.dataset.id); });
  });
}
function cardHtml(x) {
  const stub = x.photos?.[0] ? `<img src="${esc(x.photos[0])}" alt="">` : icon(x.category);
  const stamp = x.reward ? `<div class="stamp"><span>${t('stamp.label')}</span><b>${money(x.reward, x.currency)}</b></div>` : '';
  return `<li class="card" data-id="${x.id}">
    <div class="stub ${x.photos?.[0] ? 'has-photo' : ''}"><i class="hole"></i>${stub}</div>
    <div class="card-body">
      <div class="card-top"><span class="cat">${catName(x.category)}</span><span class="ago">${ago(x.createdAt)}</span></div>
      <h4>${esc(x.title)}</h4>
      <p class="place">${icon('pin')}<span>${esc(x.placeName || t('card.located'))}${x.country ? ', ' + esc(x.country) : ''}</span></p>
      <p class="meta">${x.distanceKm != null ? `<span>${fmtKm(x.distanceKm)}</span>` : ''}${x.lostDate ? `<span>${t('post.lostOn', { date: fmtDate(x.lostDate) })}</span>` : ''}${x.status !== 'open' ? `<span class="badge ${x.status === 'found' ? 'found' : ''}">${t('status.' + x.status)}</span>` : ''}</p>
    </div>${stamp}</li>`;
}
function findNearMe() {
  if (!navigator.geolocation) return toast(t('toast.noGeo'));
  navigator.geolocation.getCurrentPosition((pos) => {
    filters.near = { lat: pos.coords.latitude, lng: pos.coords.longitude }; filters.sort = 'near'; $('#sort').value = 'near';
    map.setView([filters.near.lat, filters.near.lng], 10); loadPosts(); toast(t('toast.locLocal'));
  }, () => toast(t('toast.noGeo')), { timeout: 8000 });
}

async function showPost(postId) {
  const x = await api('/api/posts/' + postId);
  const mine = me && x.owner?.id === me.id;
  const foreign = x.lang && x.lang !== lang; // 작성 언어가 내 언어와 다르면 번역 버튼 강조
  const allText = [x.title, x.description, x.story].filter(Boolean).join('\n\n');
  openModal(`
    <div class="eyebrow">${icon(x.category)}${catName(x.category)} · ${t('status.' + x.status)}</div>
    <h3 class="post-title">${esc(x.title)}</h3>
    <p class="muted post-meta">${icon('pin')}${esc(x.placeName)}${x.country ? ', ' + esc(x.country) : ''} ${x.lostDate ? '· ' + t('post.lostOn', { date: fmtDate(x.lostDate) }) : ''} · ${t('post.by', { name: esc(x.owner?.name) })}</p>
    ${foreign ? `<p>${translateLink(allText, 'strong')} <span class="muted small">(${LANGS[x.lang] || x.lang})</span></p>` : ''}
    ${!mine && (x.category === 'id' || x.category === 'pet') ? `<p class="notice">${icon('bulb')}<span>${t(x.category === 'id' ? 'notice.idHelper' : 'notice.petHelper')}</span></p>` : ''}
    ${x.photos.length ? `<div class="photos">${x.photos.map((p) => `<img src="${esc(p)}">`).join('')}</div>` : ''}
    ${x.reward ? `<div class="stamp big"><span>${t('stamp.label')}</span><b>${money(x.reward, x.currency)}</b></div>` : ''}
    ${x.description ? `<h4>${t('post.features')}</h4><p>${userText(x.description)}</p>` : ''}
    ${x.story ? `<h4>${t('post.story')}</h4><div class="story">${userText(x.story)}</div>` : ''}
    ${!foreign && allText ? `<p class="small">${translateLink(allText)}</p>` : ''}
    ${mine ? '<div id="offerList" class="offer-list"></div>' : ''}
    <div id="detailMap" class="minimap" style="margin-top:12px"></div>
    <div class="row" style="margin-top:12px">
      ${mine ? (x.status === 'open' ? `<button id="closeBtn">${t('post.close')}</button>` : '') : x.status === 'open' ? `<button class="primary" id="helpBtn">${t('post.help')}</button><button id="finderBtn">${t('finder.btn')}</button>` : ''}
      <button data-close>${t('btn.close')}</button>
    </div>`);
  const dm = makeMap($('#detailMap'), [x.lat, x.lng], 15); L.marker([x.lat, x.lng], { icon: inkIcon(x.category) }).addTo(dm); setTimeout(() => dm.invalidateSize(), 50);
  $('#helpBtn')?.addEventListener('click', () => requireLogin(() => startOffer(x)));
  $('#finderBtn')?.addEventListener('click', () => requireLogin(() => startFinder(x)));
  if (mine) renderOffers(x.id);
  $('#closeBtn')?.addEventListener('click', async () => { await api('/api/posts/' + x.id, { method: 'PATCH', body: { status: 'closed' } }); modal.close(); loadPosts(); });
}
// 도우미의 찾기 제안: 방문 예정일, 맡을 일, 기본 수고비(못 찾아도 받는 금액)
function startOffer(x) {
  const today = new Date().toISOString().slice(0, 10);
  openModal(`<p class="eyebrow">${icon(x.category)}${esc(x.title)}</p>
    <h3 class="post-title">${t('offer.formTitle')}</h3>
    <p class="muted small">${t('help.desc')}</p>
    <form id="offerForm">
      <div class="field-label">${t('offer.scopeLabel')}</div>
      <div class="scope-grid">${['collect', 'inquire'].map((s, i) => `<label class="scope-opt"><input type="radio" name="scope" value="${s}" ${i ? '' : 'checked'}><span><b>${t('offer.scope.' + s)}</b><small>${t('offer.scopeDesc.' + s)}</small></span></label>`).join('')}</div>
      <div class="row">
        <label>${t('offer.visitDate')} <input type="date" name="visitDate" min="${today}" /></label>
        <label>${t('offer.baseFee')} (${esc(x.currency)}) <input type="number" name="baseFee" min="0" step="1" value="0" inputmode="numeric" /></label>
      </div>
      <p class="muted small" style="margin-top:-8px">${t('offer.baseFeeHelp', { reward: money(x.reward, x.currency) })}</p>
      <label>${t('offer.message')} <textarea name="text" rows="4" required placeholder="${t('help.ph')}"></textarea></label>
      <p class="notice small">${icon('bulb')}<span>${t('help.legal')}</span></p>
      <div class="row"><button class="primary">${t('offer.send')}</button><button type="button" data-close>${t('btn.cancel')}</button></div>
    </form>`);
  $('#offerForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(e.target)); body.kind = 'offer';
    try { const th = await api(`/api/posts/${x.id}/threads`, { method: 'POST', body }); modal.close(); toast(t('offer.sent')); location.hash = '#inbox-' + th.id; }
    catch (err) { toast(err.message); }
  });
}
// 물건을 주운 사람: 돈이 오가지 않는 '습득 알림'. 경찰·시설 제출을 먼저 안내
function startFinder(x) {
  openModal(`<p class="eyebrow">${icon(x.category)}${esc(x.title)}</p>
    <h3 class="post-title">${t('finder.title')}</h3>
    <ul class="finder-steps">${t('finder.body').split('\n').map((li) => `<li>${li}</li>`).join('')}</ul>
    <form id="finderForm">
      <label>${t('finder.where')} <textarea name="text" rows="3" required placeholder="${t('finder.ph')}"></textarea></label>
      <div class="row"><button class="primary">${t('finder.send')}</button><button type="button" data-close>${t('btn.cancel')}</button></div>
    </form>`);
  $('#finderForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try { const th = await api(`/api/posts/${x.id}/threads`, { method: 'POST', body: { kind: 'finder', text: e.target.text.value } }); modal.close(); location.hash = '#inbox-' + th.id; }
    catch (err) { toast(err.message); }
  });
}
// 분실자에게: 이 글에 들어온 제안 목록
async function renderOffers(postId) {
  const box = $('#offerList'); if (!box) return;
  const list = (await api('/api/threads')).filter((th) => th.postId === postId && th.role === 'owner');
  box.innerHTML = `<h4>${t('offer.received')} <span class="muted">${list.length}</span></h4>` + (list.length ? `<ul class="offers">${list.map((th) => `
    <li><div><b>${esc(th.other?.name)}</b> ${th.kind === 'finder' ? `<span class="badge">${t('finder.tag')}</span>` : `<span class="muted small">${t('offer.scope.' + th.offer?.scope)} · ${th.offer?.visitDate ? t('offer.visit', { date: fmtDate(th.offer.visitDate) }) : t('offer.noDate')}</span>`}
      <p class="preview small">${userText(th.lastMessage?.text || '')}</p></div>
      ${th.kind === 'finder' ? '' : `<span class="fee">${money(th.offer?.baseFee, th.post?.currency)}<small>${t('offer.baseFee')}</small></span>`}
      <a class="open" href="#inbox-${th.id}" data-close>${t('offer.open')}</a></li>`).join('')}</ul>` : `<p class="muted small">${t('offer.none')}</p>`);
}

function newPost() {
  const curDefault = { ko: 'KRW', en: 'USD', ja: 'JPY', zh: 'CNY' }[lang];
  openModal(`
    <div class="wiz-head"><h3>${t('form.title')}</h3><span class="muted small" id="wizStep"></span></div>
    <div class="progress"><span id="wizBar"></span></div>
    <form id="postForm">
      <fieldset class="step" data-step="1">
        <legend>${t('wiz.s1')}</legend>
        <label>${t('form.itemName')} <input name="title" maxlength="80" placeholder="${t('form.whatPh')}" autofocus /></label>
        <div class="field-label">${t('form.category')}</div>
        <div class="cat-grid">${CATEGORIES.map((c, i) => `<label class="cat-opt"><input type="radio" name="category" value="${c}" ${i === CATEGORIES.length - 1 ? 'checked' : ''}><span>${icon(c)}<small>${t('cat.' + c)}</small></span></label>`).join('')}</div>
        <p class="notice" id="catNotice" hidden></p>
        <label>${t('form.features')} <textarea name="description" rows="2" placeholder="${t('form.featuresPh')}"></textarea></label>
        <label class="private">${icon('lock')}${t('form.proof')} <input name="proof" maxlength="500" placeholder="${t('form.proofPh')}" /><small>${t('form.proofHelp')}</small></label>
        <details class="tip"><summary>${icon('bulb')}${t('wiz.tipTitle')}</summary><p>${t('wiz.tip')}</p></details>
      </fieldset>
      <fieldset class="step" data-step="2" hidden>
        <legend>${t('wiz.s2')}</legend>
        <label>${t('form.placeSearch')} <div class="row nowrap"><input id="placeQ" placeholder="${t('form.placeSearchPh')}" /><button type="button" id="placeBtn" class="fit">${t('form.find')}</button></div></label>
        <div id="pickMap" class="minimap"></div>
        <p class="muted small" id="pickInfo">${t('form.pickHint')}</p>
        <div class="row">
          <label>${t('form.placeName')} <input name="placeName" placeholder="${t('form.placeNamePh')}" /></label>
          <label>${t('form.country')} <input name="country" placeholder="${t('form.countryPh')}" /></label>
        </div>
        <label>${t('form.lostDate')} <input type="date" name="lostDate" max="${new Date().toISOString().slice(0, 10)}" /></label>
      </fieldset>
      <fieldset class="step" data-step="3" hidden>
        <legend>${t('wiz.s3')}</legend>
        <label>${t('form.photos')} <input type="file" name="photos" accept="image/*" multiple id="photoIn" /></label>
        <p class="muted small">${t('form.photosHint')}</p>
        <div id="photoPrev" class="photo-prev"></div>
        <label>${t('form.story')} <textarea name="story" rows="4" placeholder="${t('form.storyPh')}"></textarea></label>
        <div class="row">
          <label>${t('form.reward')} <input type="number" name="reward" min="0" step="1" value="0" inputmode="numeric" /></label>
          <label>${t('form.currency')} <select name="currency">${['KRW', 'USD', 'EUR', 'JPY', 'CNY', 'GBP'].map((c) => `<option ${c === curDefault ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
        </div>
        <p class="note">${icon('lock')}<span>${t('form.feeNote', { fee: Math.round(feeRate * 100) })}</span></p>
        <label class="agree"><input type="checkbox" name="agree" value="1" /> <span>${t('rules.agree')} <a href="#rules" target="_blank" rel="noopener">${t('rules.nav')}</a></span></label>
      </fieldset>
      <input type="hidden" name="lat" /><input type="hidden" name="lng" /><input type="hidden" name="lang" value="${lang}" />
      <div class="wiz-nav"><button type="button" id="wizPrev">${t('btn.prev')}</button><button class="primary" id="wizNext">${t('btn.next')}</button></div>
    </form>`);
  const f = $('#postForm'); let step = 1, picker;
  const show = () => {
    f.querySelectorAll('.step').forEach((s) => (s.hidden = +s.dataset.step !== step));
    $('#wizStep').textContent = t('wiz.step', { n: step });
    $('#wizBar').style.width = (step / 3) * 100 + '%';
    $('#wizPrev').textContent = step === 1 ? t('btn.cancel') : t('btn.prev');
    $('#wizNext').textContent = step === 3 ? t('form.submit') : t('btn.next');
    if (step === 2) {
      if (!picker) picker = pinPicker($('#pickMap'), (lat, lng) => { f.lat.value = lat; f.lng.value = lng; $('#pickInfo').classList.add('ok'); $('#pickInfo').textContent = t('form.picked', { lat: lat.toFixed(4), lng: lng.toFixed(4) }); });
      setTimeout(() => picker.map.invalidateSize(), 30);
    }
    $('#modalBody').scrollTop = 0;
  };
  show();
  $('#wizPrev').addEventListener('click', () => (step === 1 ? modal.close() : (step--, show())));
  $('#placeBtn').addEventListener('click', async () => {
    const hit = await geocode($('#placeQ').value).catch(() => null);
    if (!hit) return toast(t('toast.placeNotFound'));
    picker.map.setView([hit.lat, hit.lng], 16); picker.set(hit.lat, hit.lng);
    if (!f.placeName.value) f.placeName.value = hit.name.split(',')[0];
    if (!f.country.value) f.country.value = hit.name.split(',').pop().trim();
  });
  $('#placeQ').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); $('#placeBtn').click(); } });
  f.querySelectorAll('[name=category]').forEach((r) => r.addEventListener('change', () => {
    const c = f.category.value, box = $('#catNotice');
    box.hidden = !(c === 'id' || c === 'pet');
    if (!box.hidden) box.innerHTML = icon('bulb') + `<span>${t(c === 'id' ? 'notice.id' : 'notice.pet')}</span>`;
  }));
  $('#photoIn').addEventListener('change', (e) => {
    $('#photoPrev').innerHTML = [...e.target.files].slice(0, 4).map((file) => `<img src="${URL.createObjectURL(file)}" alt="">`).join('');
  });
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (step === 1 && !f.title.value.trim()) { f.title.focus(); return toast(t('wiz.needTitle')); }
    if (step === 2 && !f.lat.value) return toast(t('toast.pickLocation'));
    if (step < 3) { step++; return show(); }
    if (!f.agree.checked) return toast(t('rules.needAgree'));
    try { const p = await api('/api/posts', { method: 'POST', body: new FormData(f) }); modal.close(); toast(t('toast.posted')); await loadPosts(); map.setView([p.lat, p.lng], 12); }
    catch (err) { toast(err.message); }
  });
}

// ---------- 여행 ----------
let tripPicker;
async function loadTrips() {
  if (!tripPicker) {
    const f = $('#tripForm');
    tripPicker = pinPicker($('#tripMap'), (lat, lng) => { f.dataset.lat = lat; f.dataset.lng = lng; });
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!f.dataset.lat) return toast(t('toast.pickTrip'));
      try { await api('/api/trips', { method: 'POST', body: { ...Object.fromEntries(new FormData(f)), lat: f.dataset.lat, lng: f.dataset.lng } }); f.reset(); toast(t('toast.tripAdded')); loadTrips(); }
      catch (err) { toast(err.message); }
    });
  }
  setTimeout(() => tripPicker.map.invalidateSize(), 50);
  const trips = await api('/api/trips');
  $('#tripList').innerHTML = trips.map((tr) => `
    <div class="panel"><h3>${icon('plane')}${esc(tr.placeName)} <span class="muted small">${fmtDate(tr.startDate)} ~ ${fmtDate(tr.endDate)} · ${t('trips.radiusShort', { km: tr.radiusKm })}</span>
      <button class="link" data-del="${tr.id}">${t('trips.delete')}</button></h3>
      ${tr.matches.length ? `<p>${t('trips.matches', { n: tr.matches.length })}</p><ul class="cards">${tr.matches.map(cardHtml).join('')}</ul>` : `<p class="muted">${t('trips.none')}</p>`}
    </div>`).join('');
  $('#tripList').querySelectorAll('[data-id]').forEach((el) => el.addEventListener('click', () => showPost(el.dataset.id)));
  $('#tripList').querySelectorAll('[data-del]').forEach((el) => el.addEventListener('click', async () => { await api('/api/trips/' + el.dataset.del, { method: 'DELETE' }); loadTrips(); }));
}

// ---------- 메시지 & 거래 ----------
async function loadInbox(threadId) {
  const threads = await api('/api/threads');
  $('#threadList').innerHTML = threads.length ? threads.map((th) => `
    <li data-t="${th.id}" class="${th.id === threadId ? 'active' : ''}">
      <b>${esc(th.post?.title)}</b> ${th.kind === 'finder' ? `<span class="badge">${t('finder.tag')}</span>` : ''}<br><span class="small muted">${th.role === 'owner' ? t('inbox.helper') : t('inbox.owner')}: ${esc(th.other?.name)}</span><br>
      <span class="small preview">${userText(th.lastMessage?.text || '')}</span></li>`).join('') : `<li class="muted">${t('inbox.empty')}</li>`;
  $('#threadList').querySelectorAll('[data-t]').forEach((el) => el.addEventListener('click', () => (location.hash = '#inbox-' + el.dataset.t)));
  if (threadId) openThread(threadId);
  else $('#chat').innerHTML = `<p class="muted">${t('inbox.select')}</p>`;
}
async function openThread(tid) {
  const { thread: th, proof, messages } = await api(`/api/threads/${tid}/messages`);
  const d = th.deal, cur = d?.currency || th.post?.currency, owner = th.role === 'owner';
  const A = (act, label, primary = true) => `<button class="${primary ? 'primary' : ''}" data-act="${act}">${label}</button>`;
  const wait = (key) => `<span class="muted">${t(key)}</span>`;
  let top = '';
  if (th.kind === 'finder') top = `<p class="notice">${icon('bulb')}<span>${t(owner ? 'finder.ownerNote' : 'finder.helperNote')}</span></p>`;
  else if (th.offer) top = `<div class="offer-card"><span class="tag">${t('offer.title')}</span><b>${t('offer.scope.' + th.offer.scope)}</b><span>${th.offer.visitDate ? t('offer.visit', { date: fmtDate(th.offer.visitDate) }) : t('offer.noDate')}</span><span>${t('offer.baseFee')} <b>${money(th.offer.baseFee, cur)}</b></span></div>`;
  if (proof) top += `<p class="proof">${icon('lock')}<span><b>${t('proof.label')}</b> ${esc(proof)}${owner ? ` <small class="muted">(${t('proof.ownerNote')})</small>` : ''}</span></p>`;
  let dealHtml = '';
  if (d) {
    const steps = ['notfound', 'closed'].includes(d.status) ? ['proposed', 'paid', 'notfound', 'closed']
      : d.scope === 'inquire' ? ['proposed', 'paid', 'found', 'completed'] : ['proposed', 'paid', 'found', 'shipped', 'completed'];
    const idx = steps.indexOf(d.status);
    let action = '';
    switch (d.status) {
      case 'proposed': action = owner ? A('pay', t('deal.pay', { total: money(d.total, cur) })) + A('cancel', t('btn.cancel'), false) : wait('deal.waitPay') + A('cancel', t('btn.cancel'), false); break;
      case 'paid': action = owner ? wait('deal.waitFind') : `<div class="row"><input id="foundPlace" placeholder="${t('deal.foundPlacePh')}"><input id="dealNote" placeholder="${t('deal.notePh')}"></div><div class="btns">${A('found', t('deal.markFound'))}${A('notfound', t('deal.markNotFound'), false)}</div>`; break;
      case 'found': action = d.scope === 'inquire' ? (owner ? A('confirmInfo', t('deal.confirmInfo')) : wait('deal.waitConfirm'))
        : owner ? wait('deal.waitShip') : `<input id="trackingNo" placeholder="${t('deal.trackingPh')}">${A('ship', t('deal.ship'))}`; break;
      case 'shipped': action = owner ? A('confirm', t('deal.confirm')) : wait('deal.waitConfirm'); break;
      case 'notfound': action = owner ? A('closeNotFound', t('deal.closeNotFound', { base: money(d.baseFee, cur) })) : wait('deal.waitClose'); break;
      case 'completed': action = `<b>${owner ? t('deal.doneOwner') : t('deal.doneHelper', { amount: money(d.payout, cur) })}</b>`; break;
      case 'closed': action = `<b>${t(owner ? 'deal.closedOwner' : 'deal.closedHelper', { payout: money(d.payout, cur), refund: money(d.refund, cur) })}</b>`; break;
    }
    const info = [
      d.found && `<li><span>${t('deal.foundAt')}</span>${esc(d.found.place)}${d.found.note ? ' · ' + esc(d.found.note) : ''}</li>`,
      d.notFoundNote && `<li><span>${t('deal.notFoundNote')}</span>${esc(d.notFoundNote)}</li>`,
      d.trackingNo && `<li><span>${t('deal.tracking')}</span>${esc(d.trackingNo)}</li>`,
    ].filter(Boolean).join('');
    dealHtml = `<div class="deal">
      <div class="deal-head"><b>${t('deal.title')}</b><span>${t('deal.breakdown', { base: money(d.baseFee, cur), reward: money(d.reward, cur), ship: money(d.shippingCost, cur), fee: money(d.fee, cur), total: money(d.total, cur) })}</span></div>
      <div class="steps">${steps.map((s, i) => `<span class="${i <= idx ? 'on' : ''}">${t('deal.' + s)}</span>`).join('')}</div>
      ${info ? `<ul class="deal-info">${info}</ul>` : ''}<div class="deal-act">${action}</div></div>`;
  } else if (owner && th.kind !== 'finder' && th.post?.status === 'open') {
    dealHtml = `<div class="deal"><b>${t('deal.ask')}</b>
      <div class="row" style="margin-top:8px"><label>${t('deal.reward')} <input id="dReward" type="number" value="${th.post.reward}" min="0"></label>
      ${th.offer?.scope === 'inquire' ? '' : `<label>${t('deal.shipCost')} <input id="dShip" type="number" value="0" min="0"></label>`}</div>
      <p class="muted small" style="margin-top:-6px">${t('deal.askNote')}</p>${A('start', t('deal.start'))}</div>`;
  }
  $('#chat').innerHTML = `
    <div><b>${esc(th.post?.title)}</b> · ${t('chat.with', { name: esc(th.other?.name) })}</div>
    ${top}${dealHtml}
    <div class="msgs">${messages.map((m) => {
      const mine = m.senderId === me.id;
      return `<div class="msg ${mine ? 'me' : ''}">${userText(m.text)}<time>${fmtTime(m.createdAt)}${mine ? '' : ' · ' + translateLink(m.text)}</time></div>`;
    }).join('')}</div>
    <form id="sendForm"><input name="text" placeholder="${t('chat.ph')}" autocomplete="off" /><button class="primary">${t('btn.send')}</button></form>`;
  const box = $('.msgs'); box.scrollTop = box.scrollHeight;
  $('#sendForm').addEventListener('submit', async (e) => {
    e.preventDefault(); const text = e.target.text.value.trim(); if (!text) return;
    const r = await api(`/api/threads/${tid}/messages`, { method: 'POST', body: { text } }).catch((err) => toast(err.message));
    if (r?.masked) toast(t('toast.masked'));
    openThread(tid);
  });
  $('#chat').querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', async () => {
    const act = b.dataset.act;
    try {
      if (act === 'start') await api(`/api/threads/${tid}/deal`, { method: 'POST', body: { reward: $('#dReward').value, shippingCost: $('#dShip')?.value } });
      else {
        if (act === 'pay' && !confirm(t('deal.demoConfirm'))) return;
        await api(`/api/threads/${tid}/deal/${act}`, { method: 'POST', body: { trackingNo: $('#trackingNo')?.value, foundPlace: $('#foundPlace')?.value, note: $('#dealNote')?.value } });
      }
      loadInbox(tid);
    } catch (err) { toast(err.message); }
  }));
}

// ---------- 이용 규칙 ----------
function renderRules() {
  const list = (key) => '<ul>' + t(key, { fee: Math.round(feeRate * 100) }).split('\n').map((li) => `<li>${li}</li>`).join('') + '</ul>';
  $('#view-rules').innerHTML = `<article class="rules">
    <p class="kicker">${t('rules.nav')}</p><h2>${t('rules.title')}</h2><p class="lede">${t('rules.intro')}</p>
    ${['helper', 'ban', 'money', 'priv'].map((k) => `<section><h3>${t('rules.' + k + 'T')}</h3>${list('rules.' + k)}</section>`).join('')}
    <p class="muted small">${t('rules.draft')}</p></article>`;
}

// ---------- 라우팅 ----------
async function route() {
  // 주소 형식: #map, #trips, #inbox-<대화ID> (하이픈만 사용해 어디서든 링크가 유지되게)
  const hm = location.hash.slice(1).match(/^([a-z]*)(?:[-/](.+))?$/) || [];
  const view = hm[1] || 'map', arg = hm[2];
  document.querySelectorAll('.view').forEach((v) => v.classList.add('hidden'));
  if ((view === 'trips' || view === 'inbox') && !me) { $('#view-map').classList.remove('hidden'); return showLogin(route); }
  $('#view-' + view)?.classList.remove('hidden');
  document.querySelectorAll('nav a').forEach((a) => a.classList.toggle('active', a.getAttribute('href') === '#' + view));
  if (view === 'map') { setTimeout(() => map.invalidateSize(), 50); loadPosts(); }
  if (view === 'trips') loadTrips();
  if (view === 'inbox') loadInbox(arg);
  if (view === 'rules') renderRules();
}

(async function init() {
  document.querySelectorAll('[data-icon]').forEach((el) => el.insertAdjacentHTML('afterbegin', icon(el.dataset.icon)));
  $('.logo').insertAdjacentHTML('afterbegin', STAR_SVG);
  map = makeMap('map'); markers = L.layerGroup().addTo(map);
  let timer; $('#q').addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(loadPosts, 300); });
  $('#sort').addEventListener('change', (e) => { filters.sort = e.target.value; if (filters.sort === 'near' && !filters.near) return findNearMe(); loadPosts(); });
  $('#nearBtn').addEventListener('click', findNearMe);
  $('#newPostBtn').addEventListener('click', () => requireLogin(newPost));
  $('#fab').addEventListener('click', () => requireLogin(newPost));
  $('#viewToggle').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
    $('#split').dataset.mode = b.dataset.mode;
    $('#viewToggle').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
    if (b.dataset.mode === 'map') setTimeout(() => map.invalidateSize(), 30);
  }));
  $('#langSel').addEventListener('change', (e) => { setLang(e.target.value); if (modal.open) modal.close(); renderLangUI(); route(); });
  me = await api('/api/me'); feeRate = (await api('/api/config')).feeRate;
  renderLangUI(); window.addEventListener('hashchange', route); route();
})();
