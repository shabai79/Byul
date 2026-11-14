// Byul 프론트엔드 (프레임워크 없이 순수 JS). 화면 문구는 모두 i18n.js의 t()로 가져옵니다.
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const CATEGORIES = ['electronics', 'id', 'wallet', 'bag', 'camera', 'jewelry', 'clothing', 'pet', 'keepsake', 'other'];
const ICON = { electronics: '📱', id: '🛂', wallet: '👛', bag: '🎒', camera: '📷', jewelry: '💍', clothing: '🧥', pet: '🐾', keepsake: '💌', other: '📦' };
const DEAL_STEPS = ['proposed', 'paid', 'shipped', 'completed'];
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
  const el = document.createElement('div'); el.className = 'toast'; el.textContent = msg;
  document.body.append(el); setTimeout(() => el.remove(), 2600);
}
const money = (n, cur = 'KRW') => new Intl.NumberFormat(locale(), { style: 'currency', currency: cur, maximumFractionDigits: 0 }).format(n || 0);
const fmtDate = (d) => (d ? new Date(d + 'T00:00:00').toLocaleDateString(locale()) : '');
const fmtTime = (d) => new Date(d).toLocaleString(locale());
// 사용자 글: HTML 이스케이프 후 서버가 가린 연락처 표시를 현재 언어로 바꿈
const userText = (s) => esc(s)
  .replace(/\[\[contact\]\]/g, `<span class="masked">🔒 ${t('mask.contact')}</span>`)
  .replace(/\[\[link\]\]/g, `<span class="masked">🔒 ${t('mask.link')}</span>`);
// 사용자 글 번역: 지금은 Google 번역을 새 창으로 열기 (API 키 없이 동작). 추후 DeepL/Papago API로 화면 내 번역 가능.
const translateUrl = (text) => `https://translate.google.com/?sl=auto&tl=${lang === 'zh' ? 'zh-CN' : lang}&op=translate&text=${encodeURIComponent(text.replace(/\[\[(contact|link)\]\]/g, '***'))}`;
const translateLink = (text, cls = '') => `<a class="translate ${cls}" target="_blank" rel="noopener" href="${esc(translateUrl(text))}">${t('btn.translate')}</a>`;

const modal = $('#modal');
function openModal(html) { $('#modalBody').innerHTML = html; modal.showModal(); }
modal.addEventListener('click', (e) => { if (e.target === modal || e.target.dataset.close != null) modal.close(); });

// ---------- 언어 ----------
function renderLangUI() {
  applyStatic();
  $('#langSel').innerHTML = Object.entries(LANGS).map(([c, n]) => `<option value="${c}" ${c === lang ? 'selected' : ''}>🌐 ${n}</option>`).join('');
  const cur = $('#cat').value;
  $('#cat').innerHTML = `<option value="">${t('cat.all')}</option>` + CATEGORIES.map((c) => `<option value="${c}">${ICON[c]} ${t('cat.' + c)}</option>`).join('');
  $('#cat').value = cur;
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
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(m);
  return m;
}
async function geocode(q) { // OpenStreetMap Nominatim 장소 검색 (결과 이름은 현재 언어로)
  const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&accept-language=${lang}&q=` + encodeURIComponent(q));
  const [hit] = await r.json(); return hit && { lat: +hit.lat, lng: +hit.lon, name: hit.display_name };
}
function pinPicker(el, onPick) {
  const m = makeMap(el); let pin;
  const set = (lat, lng) => { pin ? pin.setLatLng([lat, lng]) : (pin = L.marker([lat, lng]).addTo(m)); onPick(lat, lng); };
  m.on('click', (e) => set(e.latlng.lat, e.latlng.lng));
  setTimeout(() => m.invalidateSize(), 50);
  return { map: m, set };
}

async function loadPosts() {
  const p = new URLSearchParams({ q: $('#q').value, category: $('#cat').value });
  const posts = await api('/api/posts?' + p);
  markers.clearLayers();
  posts.forEach((x) => L.marker([x.lat, x.lng], { icon: L.divIcon({ className: '', html: `<div style="font-size:26px">${ICON[x.category] || '📦'}</div>`, iconSize: [30, 30] }) })
    .bindTooltip(esc(x.title)).on('click', () => showPost(x.id)).addTo(markers));
  $('#list').innerHTML = posts.length ? posts.map(cardHtml).join('') : `<p class="muted">${t('list.empty')}</p>`;
  $('#list').querySelectorAll('[data-id]').forEach((el) => el.addEventListener('click', () => showPost(el.dataset.id)));
}
function cardHtml(x) {
  const img = x.photos?.[0] ? `<img src="${esc(x.photos[0])}" alt="">` : `<div class="thumb">${ICON[x.category] || '📦'}</div>`;
  return `<li class="card" data-id="${x.id}">${img}<div>
    <h4>${esc(x.title)}</h4>
    <p class="muted">📍 ${esc(x.placeName || t('card.located'))} ${x.country ? '· ' + esc(x.country) : ''}</p>
    <p>${x.reward ? `<span class="badge reward">${t('card.reward', { amount: money(x.reward, x.currency) })}</span> ` : ''}<span class="badge ${x.status === 'found' ? 'found' : ''}">${t('status.' + x.status)}</span>
    ${x.distanceKm != null ? `<span class="muted"> · ${x.distanceKm}km</span>` : ''}</p></div></li>`;
}

async function showPost(postId) {
  const x = await api('/api/posts/' + postId);
  const mine = me && x.owner?.id === me.id;
  const foreign = x.lang && x.lang !== lang; // 작성 언어가 내 언어와 다르면 번역 버튼 강조
  const allText = [x.title, x.description, x.story].filter(Boolean).join('\n\n');
  openModal(`
    <h3>${ICON[x.category] || ''} ${esc(x.title)} <span class="badge">${t('status.' + x.status)}</span></h3>
    <p class="muted">📍 ${esc(x.placeName)} ${x.country ? '· ' + esc(x.country) : ''} · ${catName(x.category)} ${x.lostDate ? '· ' + t('post.lostOn', { date: fmtDate(x.lostDate) }) : ''} · ${t('post.by', { name: esc(x.owner?.name) })}</p>
    ${foreign ? `<p>${translateLink(allText, 'strong')} <span class="muted small">(${LANGS[x.lang] || x.lang})</span></p>` : ''}
    ${x.photos.length ? `<div class="photos">${x.photos.map((p) => `<img src="${esc(p)}">`).join('')}</div>` : ''}
    ${x.reward ? `<p><span class="badge reward">${t('card.reward', { amount: money(x.reward, x.currency) })}</span></p>` : ''}
    ${x.description ? `<h4>${t('post.features')}</h4><p>${userText(x.description)}</p>` : ''}
    ${x.story ? `<h4>${t('post.story')}</h4><div class="story">${userText(x.story)}</div>` : ''}
    ${!foreign && allText ? `<p class="small">${translateLink(allText)}</p>` : ''}
    <div id="detailMap" class="minimap" style="margin-top:12px"></div>
    <div class="row" style="margin-top:12px">
      ${mine ? (x.status === 'open' ? `<button id="closeBtn">${t('post.close')}</button>` : '') : x.status === 'open' ? `<button class="primary" id="helpBtn">${t('post.help')}</button>` : ''}
      <button data-close>${t('btn.close')}</button>
    </div>`);
  const dm = makeMap($('#detailMap'), [x.lat, x.lng], 15); L.marker([x.lat, x.lng]).addTo(dm); setTimeout(() => dm.invalidateSize(), 50);
  $('#helpBtn')?.addEventListener('click', () => requireLogin(() => startHelp(x)));
  $('#closeBtn')?.addEventListener('click', async () => { await api('/api/posts/' + x.id, { method: 'PATCH', body: { status: 'closed' } }); modal.close(); loadPosts(); });
}
function startHelp(x) {
  openModal(`<h3>${t('help.title', { title: esc(x.title) })}</h3>
    <p class="muted small">${t('help.desc')}</p>
    <form id="helpForm"><textarea name="text" rows="5" required placeholder="${t('help.ph')}"></textarea>
    <div class="row" style="margin-top:8px"><button class="primary">${t('btn.send')}</button><button type="button" data-close>${t('btn.cancel')}</button></div></form>`);
  $('#helpForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try { const th = await api(`/api/posts/${x.id}/threads`, { method: 'POST', body: { text: e.target.text.value } }); modal.close(); location.hash = '#inbox/' + th.id; }
    catch (err) { toast(err.message); }
  });
}

function newPost() {
  openModal(`
    <h3>${t('form.title')}</h3>
    <form id="postForm">
      <label>${t('form.what')} <input name="title" required maxlength="80" placeholder="${t('form.whatPh')}" /></label>
      <div class="row">
        <label>${t('form.category')} <select name="category">${CATEGORIES.map((c) => `<option value="${c}">${ICON[c]} ${t('cat.' + c)}</option>`).join('')}</select></label>
        <label>${t('form.lostDate')} <input type="date" name="lostDate" /></label>
      </div>
      <label>${t('form.placeSearch')} <div class="row"><input id="placeQ" placeholder="${t('form.placeSearchPh')}" /><button type="button" id="placeBtn" style="flex:0">${t('form.find')}</button></div></label>
      <div id="pickMap" class="minimap"></div>
      <p class="muted small" id="pickInfo">${t('form.pickHint')}</p>
      <div class="row">
        <label>${t('form.placeName')} <input name="placeName" placeholder="${t('form.placeNamePh')}" /></label>
        <label>${t('form.country')} <input name="country" placeholder="${t('form.countryPh')}" /></label>
      </div>
      <label>${t('form.features')} <textarea name="description" rows="2" placeholder="${t('form.featuresPh')}"></textarea></label>
      <label>${t('form.story')} <textarea name="story" rows="4" placeholder="${t('form.storyPh')}"></textarea></label>
      <div class="row">
        <label>${t('form.reward')} <input type="number" name="reward" min="0" step="1" value="0" /></label>
        <label>${t('form.currency')} <select name="currency">${['KRW', 'USD', 'EUR', 'JPY', 'CNY', 'GBP'].map((c) => `<option ${c === { ko: 'KRW', en: 'USD', ja: 'JPY', zh: 'CNY' }[lang] ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
      </div>
      <p class="muted small">${t('form.feeNote', { fee: Math.round(feeRate * 100) })}</p>
      <label>${t('form.photos')} <input type="file" name="photos" accept="image/*" multiple /></label>
      <input type="hidden" name="lat" /><input type="hidden" name="lng" /><input type="hidden" name="lang" value="${lang}" />
      <div class="row"><button class="primary">${t('form.submit')}</button><button type="button" data-close>${t('btn.cancel')}</button></div>
    </form>`);
  const f = $('#postForm');
  const picker = pinPicker($('#pickMap'), (lat, lng) => { f.lat.value = lat; f.lng.value = lng; $('#pickInfo').textContent = t('form.picked', { lat: lat.toFixed(5), lng: lng.toFixed(5) }); });
  $('#placeBtn').addEventListener('click', async () => {
    const hit = await geocode($('#placeQ').value).catch(() => null);
    if (!hit) return toast(t('toast.placeNotFound'));
    picker.map.setView([hit.lat, hit.lng], 16); picker.set(hit.lat, hit.lng);
    if (!f.placeName.value) f.placeName.value = hit.name.split(',')[0];
    if (!f.country.value) f.country.value = hit.name.split(',').pop().trim();
  });
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!f.lat.value) return toast(t('toast.pickLocation'));
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
    <div class="panel"><h3>✈️ ${esc(tr.placeName)} <span class="muted small">${fmtDate(tr.startDate)} ~ ${fmtDate(tr.endDate)} · ${t('trips.radiusShort', { km: tr.radiusKm })}</span>
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
      <b>${esc(th.post?.title)}</b><br><span class="small muted">${th.role === 'owner' ? t('inbox.helper') : t('inbox.owner')}: ${esc(th.other?.name)}</span><br>
      <span class="small preview">${userText(th.lastMessage?.text || '')}</span></li>`).join('') : `<li class="muted">${t('inbox.empty')}</li>`;
  $('#threadList').querySelectorAll('[data-t]').forEach((el) => el.addEventListener('click', () => (location.hash = '#inbox/' + el.dataset.t)));
  if (threadId) openThread(threadId);
  else $('#chat').innerHTML = `<p class="muted">${t('inbox.select')}</p>`;
}
async function openThread(tid) {
  const { thread: th, messages } = await api(`/api/threads/${tid}/messages`);
  const d = th.deal; const cur = d?.currency || th.post?.currency;
  const idx = d ? DEAL_STEPS.indexOf(d.status) : -1;
  let dealHtml = '';
  if (d) {
    const action =
      th.role === 'owner' && d.status === 'proposed' ? `<button class="primary" data-act="pay">${t('deal.pay', { total: money(d.total, cur) })}</button> <button data-act="cancel">${t('btn.cancel')}</button>` :
      th.role === 'helper' && d.status === 'proposed' ? `<span class="muted">${t('deal.waitPay')}</span> <button data-act="cancel">${t('btn.cancel')}</button>` :
      th.role === 'helper' && d.status === 'paid' ? `<input id="trackingNo" placeholder="${t('deal.trackingPh')}" style="width:auto"> <button class="primary" data-act="ship">${t('deal.ship')}</button>` :
      th.role === 'owner' && d.status === 'paid' ? `<span class="muted">${t('deal.waitShip')}</span>` :
      th.role === 'owner' && d.status === 'shipped' ? `<button class="primary" data-act="confirm">${t('deal.confirm')}</button>` :
      th.role === 'helper' && d.status === 'shipped' ? `<span class="muted">${t('deal.waitConfirm')}</span>` :
      d.status === 'completed' ? `<b>${th.role === 'helper' ? t('deal.doneHelper', { amount: money(d.reward + d.shippingCost, cur) }) : t('deal.doneOwner')}</b>` : '';
    dealHtml = `<div class="deal">
      <b>${t('deal.title')}</b> · ${t('deal.breakdown', { reward: money(d.reward, cur), ship: money(d.shippingCost, cur), fee: money(d.fee, cur), total: money(d.total, cur) })}
      ${d.trackingNo ? `<br>${t('deal.tracking')}: ${esc(d.trackingNo)}` : ''}
      <div class="steps">${DEAL_STEPS.map((s, i) => `<span class="${i <= idx ? 'on' : ''}">${t('deal.' + s)}</span>`).join('')}</div>${action}</div>`;
  } else if (th.role === 'owner' && th.post?.status === 'open') {
    dealHtml = `<div class="deal">${t('deal.ask')}
      <div class="row" style="margin-top:6px"><label>${t('deal.reward')} <input id="dReward" type="number" value="${th.post.reward}" min="0"></label>
      <label>${t('deal.shipCost')} <input id="dShip" type="number" value="0" min="0"></label></div>
      <button class="primary" data-act="start">${t('deal.start')}</button></div>`;
  }
  $('#chat').innerHTML = `
    <div><b>${esc(th.post?.title)}</b> · ${t('chat.with', { name: esc(th.other?.name) })}</div>
    ${dealHtml}
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
      if (act === 'start') await api(`/api/threads/${tid}/deal`, { method: 'POST', body: { reward: $('#dReward').value, shippingCost: $('#dShip').value } });
      else {
        if (act === 'pay' && !confirm(t('deal.demoConfirm'))) return;
        await api(`/api/threads/${tid}/deal/${act}`, { method: 'POST', body: { trackingNo: $('#trackingNo')?.value } });
      }
      loadInbox(tid);
    } catch (err) { toast(err.message); }
  }));
}

// ---------- 라우팅 ----------
async function route() {
  const [view, arg] = (location.hash.slice(1) || 'map').split('/');
  document.querySelectorAll('.view').forEach((v) => v.classList.add('hidden'));
  if ((view === 'trips' || view === 'inbox') && !me) { $('#view-map').classList.remove('hidden'); return showLogin(route); }
  $('#view-' + view)?.classList.remove('hidden');
  if (view === 'map') { setTimeout(() => map.invalidateSize(), 50); loadPosts(); }
  if (view === 'trips') loadTrips();
  if (view === 'inbox') loadInbox(arg);
}

(async function init() {
  map = makeMap('map'); markers = L.layerGroup().addTo(map);
  let timer; $('#q').addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(loadPosts, 300); });
  $('#cat').addEventListener('change', loadPosts);
  $('#newPostBtn').addEventListener('click', () => requireLogin(newPost));
  $('#langSel').addEventListener('change', (e) => { setLang(e.target.value); if (modal.open) modal.close(); renderLangUI(); route(); });
  me = await api('/api/me'); feeRate = (await api('/api/config')).feeRate;
  renderLangUI(); window.addEventListener('hashchange', route); route();
})();
