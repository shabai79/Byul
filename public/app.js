// Byul 프론트엔드 (프레임워크 없이 순수 JS)
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const CATEGORIES = ['전자기기', '여권/신분증', '지갑/카드', '가방', '카메라', '액세서리/귀금속', '의류', '반려동물', '추억이 담긴 물건', '기타'];
const ICON = { '전자기기': '📱', '여권/신분증': '🛂', '지갑/카드': '👛', '가방': '🎒', '카메라': '📷', '액세서리/귀금속': '💍', '의류': '🧥', '반려동물': '🐾', '추억이 담긴 물건': '💌', '기타': '📦' };
const STATUS = { open: '찾는 중', matched: '찾아주는 중', found: '찾음 ✓', closed: '종료' };
const DEAL = { proposed: '도움 수락', paid: '결제·예치 완료', shipped: '전달/발송', completed: '수령 확인·정산' };
let me = null, feeRate = 0.1, map, markers, currentThread = null;

async function api(url, opts = {}) {
  const o = { credentials: 'same-origin', ...opts };
  if (o.body && !(o.body instanceof FormData)) { o.headers = { 'Content-Type': 'application/json' }; o.body = JSON.stringify(o.body); }
  const r = await fetch(url, o);
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || '오류가 발생했습니다.');
  return data;
}
function toast(msg) {
  const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg;
  document.body.append(t); setTimeout(() => t.remove(), 2600);
}
const money = (n, cur = 'KRW') => new Intl.NumberFormat('ko-KR', { style: 'currency', currency: cur, maximumFractionDigits: 0 }).format(n || 0);
const modal = $('#modal');
function openModal(html) { $('#modalBody').innerHTML = html; modal.showModal(); }
modal.addEventListener('click', (e) => { if (e.target === modal || e.target.dataset.close != null) modal.close(); });

// ---------- 인증 ----------
function renderUser() {
  $('#userBox').innerHTML = me
    ? `<b>${esc(me.name)}</b> 님 <button class="link" id="logoutBtn">로그아웃</button>`
    : `<button class="primary" id="loginBtn">로그인 / 가입</button>`;
  $('#logoutBtn')?.addEventListener('click', async () => { await api('/api/logout', { method: 'POST' }); me = null; renderUser(); route(); });
  $('#loginBtn')?.addEventListener('click', () => showLogin());
}
function showLogin(after) {
  openModal(`
    <h3>로그인 / 회원가입</h3>
    <form id="authForm">
      <label>이름(가입 시) <input name="name" placeholder="닉네임" /></label>
      <label>이메일 <input name="email" type="email" required /></label>
      <label>비밀번호 <input name="password" type="password" minlength="6" required /></label>
      <div class="row"><button class="primary" value="login">로그인</button><button value="signup">새로 가입</button></div>
    </form>`);
  $('#authForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const mode = e.submitter.value; const f = Object.fromEntries(new FormData(e.target));
    try { me = await api('/api/' + mode, { method: 'POST', body: f }); modal.close(); renderUser(); toast(`환영합니다, ${me.name} 님`); after?.(); }
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
async function geocode(q) { // OpenStreetMap Nominatim 장소 검색
  const r = await fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&accept-language=ko&q=' + encodeURIComponent(q));
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
  $('#list').innerHTML = posts.length ? posts.map(cardHtml).join('') : '<p class="muted">아직 등록된 분실물이 없어요. 첫 글을 남겨보세요.</p>';
  $('#list').querySelectorAll('[data-id]').forEach((el) => el.addEventListener('click', () => showPost(el.dataset.id)));
}
function cardHtml(x) {
  const img = x.photos?.[0] ? `<img src="${esc(x.photos[0])}" alt="">` : `<div class="thumb">${ICON[x.category] || '📦'}</div>`;
  return `<li class="card" data-id="${x.id}">${img}<div>
    <h4>${esc(x.title)}</h4>
    <p class="muted">📍 ${esc(x.placeName || '위치 지정됨')} ${x.country ? '· ' + esc(x.country) : ''}</p>
    <p>${x.reward ? `<span class="badge reward">사례금 ${money(x.reward, x.currency)}</span> ` : ''}<span class="badge ${x.status === 'found' ? 'found' : ''}">${STATUS[x.status]}</span>
    ${x.distanceKm != null ? `<span class="muted"> · ${x.distanceKm}km</span>` : ''}</p></div></li>`;
}

async function showPost(postId) {
  const x = await api('/api/posts/' + postId);
  const mine = me && x.owner?.id === me.id;
  openModal(`
    <h3>${ICON[x.category] || ''} ${esc(x.title)} <span class="badge">${STATUS[x.status]}</span></h3>
    <p class="muted">📍 ${esc(x.placeName)} ${x.country ? '· ' + esc(x.country) : ''} ${x.lostDate ? '· 분실일 ' + esc(x.lostDate) : ''} · 작성자 ${esc(x.owner?.name)}</p>
    ${x.photos.length ? `<div class="photos">${x.photos.map((p) => `<img src="${esc(p)}">`).join('')}</div>` : ''}
    ${x.reward ? `<p><span class="badge reward">사례금 ${money(x.reward, x.currency)}</span></p>` : ''}
    ${x.description ? `<h4>물건 특징</h4><p>${esc(x.description)}</p>` : ''}
    ${x.story ? `<h4>이야기</h4><div class="story">${esc(x.story)}</div>` : ''}
    <div id="detailMap" class="minimap" style="margin-top:12px"></div>
    <div class="row" style="margin-top:12px">
      ${mine ? (x.status === 'open' ? `<button id="closeBtn">게시 종료</button>` : '') : x.status === 'open' ? `<button class="primary" id="helpBtn">제가 찾아드릴 수 있어요</button>` : ''}
      <button data-close>닫기</button>
    </div>`);
  const dm = makeMap($('#detailMap'), [x.lat, x.lng], 15); L.marker([x.lat, x.lng]).addTo(dm); setTimeout(() => dm.invalidateSize(), 50);
  $('#helpBtn')?.addEventListener('click', () => requireLogin(() => startHelp(x)));
  $('#closeBtn')?.addEventListener('click', async () => { await api('/api/posts/' + x.id, { method: 'PATCH', body: { status: 'closed' } }); modal.close(); loadPosts(); });
}
function startHelp(x) {
  openModal(`<h3>“${esc(x.title)}” 분실자에게 메시지</h3>
    <p class="muted small">언제 그 장소에 가는지, 어떻게 찾아볼 수 있을지 알려주세요. 연락처는 자동으로 가려지고 모든 대화는 Byul 안에서 진행됩니다.</p>
    <form id="helpForm"><textarea name="text" rows="5" required placeholder="안녕하세요! 다음 주에 그 근처에 갑니다. 분실물 센터에 문의해볼게요."></textarea>
    <div class="row" style="margin-top:8px"><button class="primary">보내기</button><button type="button" data-close>취소</button></div></form>`);
  $('#helpForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try { const t = await api(`/api/posts/${x.id}/threads`, { method: 'POST', body: { text: e.target.text.value } }); modal.close(); location.hash = '#inbox/' + t.id; }
    catch (err) { toast(err.message); }
  });
}

function newPost() {
  openModal(`
    <h3>분실물 등록</h3>
    <form id="postForm">
      <label>무엇을 잃어버렸나요? <input name="title" required maxlength="80" placeholder="예: 검정색 소니 카메라" /></label>
      <div class="row">
        <label>분류 <select name="category">${CATEGORIES.map((c) => `<option>${c}</option>`).join('')}</select></label>
        <label>분실 날짜 <input type="date" name="lostDate" /></label>
      </div>
      <label>장소 검색 <div class="row"><input id="placeQ" placeholder="예: 에펠탑, 도쿄 신주쿠역" /><button type="button" id="placeBtn" style="flex:0">찾기</button></div></label>
      <div id="pickMap" class="minimap"></div>
      <p class="muted small" id="pickInfo">지도를 클릭해 잃어버린 지점을 찍어주세요.</p>
      <div class="row">
        <label>장소 이름 <input name="placeName" placeholder="예: 루브르 박물관 지하 카페" /></label>
        <label>나라 <input name="country" placeholder="예: 프랑스" /></label>
      </div>
      <label>물건 특징 <textarea name="description" rows="2" placeholder="색상, 브랜드, 스티커, 케이스 등"></textarea></label>
      <label>이야기 <textarea name="story" rows="4" placeholder="어떤 의미가 있는 물건인지, 그날 무슨 일이 있었는지 들려주세요."></textarea></label>
      <div class="row">
        <label>사례금 <input type="number" name="reward" min="0" step="1000" value="0" /></label>
        <label>통화 <select name="currency"><option>KRW</option><option>USD</option><option>EUR</option><option>JPY</option></select></label>
      </div>
      <p class="muted small">찾게 되면 사례금의 ${Math.round(feeRate * 100)}%가 서비스 수수료로 추가됩니다. 사례금은 결제 후 Byul이 보관하다가 물건을 받으신 뒤에 찾아주신 분께 전달됩니다.</p>
      <label>사진 (최대 4장) <input type="file" name="photos" accept="image/*" multiple /></label>
      <input type="hidden" name="lat" /><input type="hidden" name="lng" />
      <div class="row"><button class="primary">등록하기</button><button type="button" data-close>취소</button></div>
    </form>`);
  const f = $('#postForm');
  const picker = pinPicker($('#pickMap'), (lat, lng) => { f.lat.value = lat; f.lng.value = lng; $('#pickInfo').textContent = `선택됨: ${lat.toFixed(5)}, ${lng.toFixed(5)}`; });
  $('#placeBtn').addEventListener('click', async () => {
    const hit = await geocode($('#placeQ').value).catch(() => null);
    if (!hit) return toast('장소를 찾지 못했어요. 지도를 직접 클릭해주세요.');
    picker.map.setView([hit.lat, hit.lng], 16); picker.set(hit.lat, hit.lng);
    if (!f.placeName.value) f.placeName.value = hit.name.split(',')[0];
    if (!f.country.value) f.country.value = hit.name.split(',').pop().trim();
  });
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!f.lat.value) return toast('지도에서 위치를 선택해주세요.');
    try { const p = await api('/api/posts', { method: 'POST', body: new FormData(f) }); modal.close(); toast('등록되었습니다'); await loadPosts(); map.setView([p.lat, p.lng], 12); }
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
      if (!f.dataset.lat) return toast('지도에서 여행지를 선택해주세요.');
      try { await api('/api/trips', { method: 'POST', body: { ...Object.fromEntries(new FormData(f)), lat: f.dataset.lat, lng: f.dataset.lng } }); f.reset(); toast('여행이 등록되었어요'); loadTrips(); }
      catch (err) { toast(err.message); }
    });
  }
  setTimeout(() => tripPicker.map.invalidateSize(), 50);
  const trips = await api('/api/trips');
  $('#tripList').innerHTML = trips.map((t) => `
    <div class="panel"><h3>✈️ ${esc(t.placeName)} <span class="muted small">${esc(t.startDate || '')} ~ ${esc(t.endDate || '')} · 반경 ${t.radiusKm}km</span>
      <button class="link" data-del="${t.id}">삭제</button></h3>
      ${t.matches.length ? `<p>이 근처에서 <b>${t.matches.length}건</b>의 분실물이 주인을 기다리고 있어요.</p><ul class="cards">${t.matches.map(cardHtml).join('')}</ul>` : '<p class="muted">아직 주변에 등록된 분실물이 없어요.</p>'}
    </div>`).join('');
  $('#tripList').querySelectorAll('[data-id]').forEach((el) => el.addEventListener('click', () => showPost(el.dataset.id)));
  $('#tripList').querySelectorAll('[data-del]').forEach((el) => el.addEventListener('click', async () => { await api('/api/trips/' + el.dataset.del, { method: 'DELETE' }); loadTrips(); }));
}

// ---------- 메시지 & 거래 ----------
async function loadInbox(threadId) {
  const threads = await api('/api/threads');
  $('#threadList').innerHTML = threads.length ? threads.map((t) => `
    <li data-t="${t.id}" class="${t.id === threadId ? 'active' : ''}">
      <b>${esc(t.post?.title)}</b><br><span class="small muted">${t.role === 'owner' ? '찾아주려는 분' : '분실자'}: ${esc(t.other?.name)}</span><br>
      <span class="small">${esc(t.lastMessage?.text?.slice(0, 40) || '')}</span></li>`).join('') : '<li class="muted">아직 대화가 없어요.</li>';
  $('#threadList').querySelectorAll('[data-t]').forEach((el) => el.addEventListener('click', () => (location.hash = '#inbox/' + el.dataset.t)));
  if (threadId) openThread(threadId);
}
async function openThread(tid) {
  currentThread = tid;
  const { thread: t, messages } = await api(`/api/threads/${tid}/messages`);
  const d = t.deal; const cur = d?.currency || t.post?.currency;
  const order = Object.keys(DEAL); const idx = d ? order.indexOf(d.status) : -1;
  let dealHtml = '';
  if (d) {
    const action =
      t.role === 'owner' && d.status === 'proposed' ? `<button class="primary" data-act="pay">${money(d.total, cur)} 결제하기 (예치)</button> <button data-act="cancel">취소</button>` :
      t.role === 'helper' && d.status === 'proposed' ? `<span class="muted">분실자의 결제를 기다리는 중</span> <button data-act="cancel">취소</button>` :
      t.role === 'helper' && d.status === 'paid' ? `<input id="trackingNo" placeholder="운송장 번호 또는 전달 방법" style="width:auto"> <button class="primary" data-act="ship">물건 발송/전달 완료</button>` :
      t.role === 'owner' && d.status === 'paid' ? `<span class="muted">찾아주신 분이 물건을 보내는 중</span>` :
      t.role === 'owner' && d.status === 'shipped' ? `<button class="primary" data-act="confirm">물건을 받았어요 (사례금 지급)</button>` :
      t.role === 'helper' && d.status === 'shipped' ? `<span class="muted">분실자의 수령 확인을 기다리는 중</span>` :
      d.status === 'completed' ? `<b>🎉 거래 완료! ${t.role === 'helper' ? money(d.reward + d.shippingCost, cur) + '이 정산됩니다.' : '물건을 되찾으셨어요.'}</b>` : '';
    dealHtml = `<div class="deal">
      <b>거래 진행</b> · 사례금 ${money(d.reward, cur)} + 배송비 ${money(d.shippingCost, cur)} + 수수료 ${money(d.fee, cur)} = <b>${money(d.total, cur)}</b>
      ${d.trackingNo ? `<br>전달 정보: ${esc(d.trackingNo)}` : ''}
      <div class="steps">${order.map((s, i) => `<span class="${i <= idx ? 'on' : ''}">${DEAL[s]}</span>`).join('')}</div>${action}</div>`;
  } else if (t.role === 'owner' && t.post?.status === 'open') {
    dealHtml = `<div class="deal">이 분께 찾기를 부탁할까요?
      <div class="row" style="margin-top:6px"><label>사례금 <input id="dReward" type="number" value="${t.post.reward}" min="0"></label>
      <label>예상 배송비 <input id="dShip" type="number" value="0" min="0"></label></div>
      <button class="primary" data-act="start">이 분에게 부탁하기</button></div>`;
  }
  $('#chat').innerHTML = `
    <div><b>${esc(t.post?.title)}</b> · ${esc(t.other?.name)} 님과의 대화</div>
    ${dealHtml}
    <div class="msgs">${messages.map((m) => `<div class="msg ${m.senderId === me.id ? 'me' : ''}">${esc(m.text)}<time>${new Date(m.createdAt).toLocaleString('ko-KR')}</time></div>`).join('')}</div>
    <form id="sendForm"><input name="text" placeholder="메시지 입력 (연락처는 자동으로 가려져요)" autocomplete="off" /><button class="primary">보내기</button></form>`;
  const box = $('.msgs'); box.scrollTop = box.scrollHeight;
  $('#sendForm').addEventListener('submit', async (e) => {
    e.preventDefault(); const text = e.target.text.value.trim(); if (!text) return;
    const r = await api(`/api/threads/${tid}/messages`, { method: 'POST', body: { text } }).catch((err) => toast(err.message));
    if (r?.masked) toast('안전을 위해 연락처 정보가 가려졌어요.');
    openThread(tid);
  });
  $('#chat').querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', async () => {
    const act = b.dataset.act;
    try {
      if (act === 'start') await api(`/api/threads/${tid}/deal`, { method: 'POST', body: { reward: $('#dReward').value, shippingCost: $('#dShip').value } });
      else {
        if (act === 'pay' && !confirm('데모 결제입니다. 실제 서비스에서는 결제창(토스페이먼츠/Stripe)이 열립니다. 진행할까요?')) return;
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
  $('#cat').innerHTML += CATEGORIES.map((c) => `<option>${c}</option>`).join('');
  map = makeMap('map'); markers = L.layerGroup().addTo(map);
  let timer; $('#q').addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(loadPosts, 300); });
  $('#cat').addEventListener('change', loadPosts);
  $('#newPostBtn').addEventListener('click', () => requireLogin(newPost));
  me = await api('/api/me'); feeRate = (await api('/api/config')).feeRate;
  renderUser(); window.addEventListener('hashchange', route); route();
})();
