// Byul — 전 세계 분실물 찾기 중개 서비스 (MVP)
// 실행: npm start  →  http://localhost:3000
const express = require('express');
const multer = require('multer');
const cookieParser = require('cookie-parser');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const FEE_RATE = Number(process.env.FEE_RATE || 0.1); // 플랫폼 수수료 10%
const DB_FILE = path.join(__dirname, 'data', 'db.json');
const UPLOAD_DIR = path.join(__dirname, 'uploads');
fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// ---------- 아주 단순한 JSON 저장소 (실서비스에서는 PostgreSQL+PostGIS 권장) ----------
const empty = { users: [], sessions: [], posts: [], trips: [], threads: [], messages: [], deals: [] };
let db = fs.existsSync(DB_FILE) ? { ...empty, ...JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) } : empty;
const save = () => fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
const id = () => crypto.randomUUID();
const now = () => new Date().toISOString();

// ---------- 유틸 ----------
function hashPassword(pw, salt = crypto.randomBytes(16).toString('hex')) {
  return salt + ':' + crypto.scryptSync(pw, salt, 64).toString('hex');
}
function checkPassword(pw, stored) {
  const [salt, hash] = stored.split(':');
  const test = crypto.scryptSync(pw, salt, 64);
  return crypto.timingSafeEqual(test, Buffer.from(hash, 'hex'));
}
function distanceKm(a, b) {
  const R = 6371, rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
// 서비스 밖 직접 연락 차단: 전화번호·이메일·메신저 ID·URL 마스킹
function maskContacts(text) {
  return String(text)
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '[연락처 비공개]')
    .replace(/(\+?\d[\d\s().-]{7,}\d)/g, '[연락처 비공개]')
    .replace(/https?:\/\/\S+|www\.\S+/gi, '[링크 비공개]')
    .replace(/(카톡|카카오톡|kakao|라인|line|whatsapp|왓츠앱|텔레그램|telegram|wechat|위챗|instagram|인스타)\s*(id|아이디)?\s*[:：]?\s*@?[\w.-]{3,}/gi, '[연락처 비공개]');
}
const publicUser = (u) => u && { id: u.id, name: u.name };
const userById = (uid) => db.users.find((u) => u.id === uid);
function publicPost(p) {
  return { ...p, owner: publicUser(userById(p.ownerId)) };
}

// ---------- 앱 ----------
const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(UPLOAD_DIR));
app.use('/vendor/leaflet', express.static(path.join(__dirname, 'node_modules', 'leaflet', 'dist')));

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (_req, file, cb) => cb(null, id() + path.extname(file.originalname).toLowerCase()),
  }),
  limits: { fileSize: 5 * 1024 * 1024, files: 4 },
  fileFilter: (_req, file, cb) => cb(null, /^image\/(jpeg|png|webp|gif)$/.test(file.mimetype)),
});

// 세션
app.use((req, _res, next) => {
  const s = db.sessions.find((x) => x.token === req.cookies.sid);
  req.user = s ? userById(s.userId) : null;
  next();
});
const auth = (req, res, next) => (req.user ? next() : res.status(401).json({ error: '로그인이 필요합니다.' }));
const bad = (res, msg, code = 400) => res.status(code).json({ error: msg });

function startSession(res, user) {
  const token = crypto.randomBytes(32).toString('hex');
  db.sessions.push({ token, userId: user.id, createdAt: now() });
  save();
  res.cookie('sid', token, { httpOnly: true, sameSite: 'lax', maxAge: 30 * 864e5 });
}

// ----- 인증 -----
app.post('/api/signup', (req, res) => {
  const { name, email, password } = req.body || {};
  if (!name || !email || !password || password.length < 6) return bad(res, '이름, 이메일, 6자 이상 비밀번호를 입력하세요.');
  if (db.users.some((u) => u.email === email.toLowerCase())) return bad(res, '이미 가입된 이메일입니다.');
  const user = { id: id(), name: String(name).slice(0, 40), email: email.toLowerCase(), password: hashPassword(password), createdAt: now() };
  db.users.push(user);
  startSession(res, user);
  res.json(publicUser(user));
});
app.post('/api/login', (req, res) => {
  const { email, password } = req.body || {};
  const user = db.users.find((u) => u.email === String(email || '').toLowerCase());
  if (!user || !checkPassword(String(password || ''), user.password)) return bad(res, '이메일 또는 비밀번호가 틀렸습니다.', 401);
  startSession(res, user);
  res.json(publicUser(user));
});
app.post('/api/logout', (req, res) => {
  db.sessions = db.sessions.filter((s) => s.token !== req.cookies.sid);
  save();
  res.clearCookie('sid').json({ ok: true });
});
app.get('/api/me', (req, res) => res.json(publicUser(req.user) || null));

// ----- 분실물 게시글 -----
app.get('/api/posts', (req, res) => {
  const { q, category, status = 'open', lat, lng, radiusKm } = req.query;
  let list = db.posts.filter((p) => (status === 'all' ? true : p.status === status));
  if (category) list = list.filter((p) => p.category === category);
  if (q) {
    const k = String(q).toLowerCase();
    list = list.filter((p) => [p.title, p.description, p.story, p.placeName, p.country].join(' ').toLowerCase().includes(k));
  }
  if (lat && lng && radiusKm) {
    const c = { lat: +lat, lng: +lng };
    list = list.filter((p) => distanceKm(c, p) <= +radiusKm);
  }
  res.json(list.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(publicPost));
});
app.get('/api/posts/:id', (req, res) => {
  const p = db.posts.find((x) => x.id === req.params.id);
  p ? res.json(publicPost(p)) : bad(res, '게시글이 없습니다.', 404);
});
app.post('/api/posts', auth, upload.array('photos', 4), (req, res) => {
  const b = req.body;
  const lat = Number(b.lat), lng = Number(b.lng);
  if (!b.title || Number.isNaN(lat) || Number.isNaN(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180)
    return bad(res, '물건 이름과 지도 위치는 필수입니다.');
  const post = {
    id: id(),
    ownerId: req.user.id,
    title: String(b.title).slice(0, 80),
    category: b.category || '기타',
    description: maskContacts(b.description || '').slice(0, 2000),
    story: maskContacts(b.story || '').slice(0, 4000),
    lat, lng,
    placeName: String(b.placeName || '').slice(0, 120),
    country: String(b.country || '').slice(0, 60),
    lostDate: b.lostDate || null,
    reward: Math.max(0, Math.round(Number(b.reward) || 0)),
    currency: b.currency || 'KRW',
    photos: (req.files || []).map((f) => '/uploads/' + f.filename),
    status: 'open',
    createdAt: now(),
  };
  db.posts.push(post);
  save();
  res.json(publicPost(post));
});
app.patch('/api/posts/:id', auth, (req, res) => {
  const p = db.posts.find((x) => x.id === req.params.id);
  if (!p || p.ownerId !== req.user.id) return bad(res, '권한이 없습니다.', 403);
  if (req.body.status === 'closed') p.status = 'closed';
  save();
  res.json(publicPost(p));
});

// ----- 여행 일정 (그 지역에 가는 사람에게 주변 분실물 추천) -----
app.post('/api/trips', auth, (req, res) => {
  const { placeName, lat, lng, startDate, endDate, radiusKm = 30 } = req.body || {};
  if (lat == null || lng == null) return bad(res, '여행지 위치를 지도에서 선택하세요.');
  const trip = { id: id(), userId: req.user.id, placeName, lat: +lat, lng: +lng, startDate, endDate, radiusKm: +radiusKm, createdAt: now() };
  db.trips.push(trip);
  save();
  res.json(trip);
});
app.get('/api/trips', auth, (req, res) => {
  const trips = db.trips.filter((t) => t.userId === req.user.id).map((t) => ({
    ...t,
    matches: db.posts
      .filter((p) => p.status === 'open' && p.ownerId !== req.user.id && distanceKm(t, p) <= t.radiusKm)
      .map((p) => ({ ...publicPost(p), distanceKm: Math.round(distanceKm(t, p) * 10) / 10 })),
  }));
  res.json(trips);
});
app.delete('/api/trips/:id', auth, (req, res) => {
  db.trips = db.trips.filter((t) => !(t.id === req.params.id && t.userId === req.user.id));
  save();
  res.json({ ok: true });
});

// ----- 메시지 (서비스 내부 대화만 허용) -----
function threadView(t, me) {
  const post = db.posts.find((p) => p.id === t.postId);
  const other = userById(t.ownerId === me ? t.helperId : t.ownerId);
  const msgs = db.messages.filter((m) => m.threadId === t.id);
  return {
    ...t,
    post: post && { id: post.id, title: post.title, placeName: post.placeName, status: post.status, reward: post.reward, currency: post.currency },
    other: publicUser(other),
    role: t.ownerId === me ? 'owner' : 'helper',
    lastMessage: msgs[msgs.length - 1] || null,
    deal: db.deals.find((d) => d.threadId === t.id) || null,
  };
}
app.post('/api/posts/:id/threads', auth, (req, res) => {
  const post = db.posts.find((p) => p.id === req.params.id);
  if (!post) return bad(res, '게시글이 없습니다.', 404);
  if (post.ownerId === req.user.id) return bad(res, '본인 게시글입니다.');
  let t = db.threads.find((x) => x.postId === post.id && x.helperId === req.user.id);
  if (!t) {
    t = { id: id(), postId: post.id, ownerId: post.ownerId, helperId: req.user.id, createdAt: now() };
    db.threads.push(t);
  }
  if (req.body?.text) db.messages.push({ id: id(), threadId: t.id, senderId: req.user.id, text: maskContacts(req.body.text).slice(0, 2000), createdAt: now() });
  save();
  res.json(threadView(t, req.user.id));
});
app.get('/api/threads', auth, (req, res) => {
  const me = req.user.id;
  res.json(db.threads.filter((t) => t.ownerId === me || t.helperId === me).map((t) => threadView(t, me)));
});
function myThread(req, res) {
  const t = db.threads.find((x) => x.id === req.params.id);
  if (!t || (t.ownerId !== req.user.id && t.helperId !== req.user.id)) { bad(res, '대화방이 없습니다.', 404); return null; }
  return t;
}
app.get('/api/threads/:id/messages', auth, (req, res) => {
  const t = myThread(req, res); if (!t) return;
  res.json({ thread: threadView(t, req.user.id), messages: db.messages.filter((m) => m.threadId === t.id) });
});
app.post('/api/threads/:id/messages', auth, (req, res) => {
  const t = myThread(req, res); if (!t) return;
  const text = String(req.body?.text || '').trim();
  if (!text) return bad(res, '내용을 입력하세요.');
  const masked = maskContacts(text).slice(0, 2000);
  const m = { id: id(), threadId: t.id, senderId: req.user.id, text: masked, createdAt: now() };
  db.messages.push(m);
  save();
  res.json({ ...m, masked: masked !== text });
});

// ----- 거래 (에스크로: 사례금+수수료를 맡겨두고, 물건 수령 확인 후 지급) -----
// 흐름: proposed(분실자가 도움 수락) → paid(분실자 결제·예치) → shipped(찾은 사람이 발송/전달) → completed(분실자 수령 확인, 정산)
function deal(req, res) {
  const t = myThread(req, res); if (!t) return {};
  return { t, d: db.deals.find((x) => x.threadId === t.id), post: db.posts.find((p) => p.id === t.postId) };
}
app.post('/api/threads/:id/deal', auth, (req, res) => {
  const { t, d, post } = deal(req, res); if (!t) return;
  if (t.ownerId !== req.user.id) return bad(res, '분실자만 거래를 시작할 수 있습니다.', 403);
  if (d) return bad(res, '이미 거래가 진행 중입니다.');
  if (post.status !== 'open') return bad(res, '이미 다른 사람과 진행 중인 게시글입니다.');
  const reward = Math.max(0, Math.round(Number(req.body?.reward ?? post.reward)));
  const shippingCost = Math.max(0, Math.round(Number(req.body?.shippingCost) || 0));
  const fee = Math.round(reward * FEE_RATE);
  const nd = { id: id(), threadId: t.id, postId: post.id, ownerId: t.ownerId, helperId: t.helperId, reward, shippingCost, fee, feeRate: FEE_RATE, currency: post.currency, total: reward + shippingCost + fee, status: 'proposed', history: [{ status: 'proposed', at: now() }] };
  db.deals.push(nd);
  post.status = 'matched';
  save();
  res.json(nd);
});
const transitions = {
  pay: { from: 'proposed', to: 'paid', who: 'owner' },
  ship: { from: 'paid', to: 'shipped', who: 'helper' },
  confirm: { from: 'shipped', to: 'completed', who: 'owner' },
  cancel: { from: 'proposed', to: 'cancelled', who: 'any' },
};
app.post('/api/threads/:id/deal/:action', auth, (req, res) => {
  const { t, d, post } = deal(req, res); if (!t) return;
  const tr = transitions[req.params.action];
  if (!d || !tr) return bad(res, '잘못된 요청입니다.');
  const role = t.ownerId === req.user.id ? 'owner' : 'helper';
  if (tr.who !== 'any' && tr.who !== role) return bad(res, '이 단계는 상대방이 진행해야 합니다.', 403);
  if (d.status !== tr.from) return bad(res, `현재 상태(${d.status})에서는 할 수 없습니다.`);
  // TODO: 실서비스에서는 여기서 PG(토스페이먼츠·Stripe Connect 등) 결제/정산 API를 호출
  d.status = tr.to;
  if (req.body?.trackingNo) d.trackingNo = String(req.body.trackingNo).slice(0, 60);
  d.history.push({ status: tr.to, at: now() });
  if (tr.to === 'completed') post.status = 'found';
  if (tr.to === 'cancelled') { post.status = 'open'; db.deals = db.deals.filter((x) => x !== d); }
  save();
  res.json(d);
});

app.get('/api/config', (_req, res) => res.json({ feeRate: FEE_RATE }));

if (require.main === module) app.listen(PORT, () => console.log(`Byul running on http://localhost:${PORT}`));
module.exports = { app, maskContacts, distanceKm };
