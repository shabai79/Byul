// Byul — 전 세계 분실물 찾기 중개 서비스 (MVP)
// 실행: npm start  →  http://localhost:3000
const express = require('express');
const multer = require('multer');
const cookieParser = require('cookie-parser');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { msg, SUPPORTED } = require('./lib/messages');

const PORT = process.env.PORT || 3000;
const FEE_RATE = Number(process.env.FEE_RATE || 0.1); // 플랫폼 수수료 10%
const CATEGORIES = ['electronics', 'id', 'wallet', 'bag', 'camera', 'jewelry', 'clothing', 'pet', 'keepsake', 'other'];
// DATA_DIR: 배포 시 영구 디스크 경로를 지정하면 재시작해도 데이터가 남습니다.
const DATA_DIR = process.env.DATA_DIR || __dirname;
const DB_FILE = path.join(DATA_DIR, 'data', 'db.json');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const PROD = process.env.NODE_ENV === 'production';
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
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '[[contact]]')
    .replace(/(\+?\d[\d\s().-]{7,}\d)/g, '[[contact]]')
    .replace(/https?:\/\/\S+|www\.\S+/gi, '[[link]]')
    // 메신저 ID: 확실한 메신저 이름은 바로 뒤 ID까지, 'line'·'qq'처럼 일반 단어와 겹치는 이름은 'id' 또는 ':'가 있을 때만
    .replace(/(?<![A-Za-z])(카톡|카카오톡|카카오|kakao(?:talk)?|カカオ|whatsapp|왓츠앱|텔레그램|telegram|wechat|위챗|微信|weixin|instagram|insta|인스타|インスタ|라인|ライン)\s*(id|아이디|号)?\s*[:：]?\s*@?[\w.-]{3,}/gi, '[[contact]]')
    .replace(/(?<![A-Za-z])(line|qq)\s*(?:id\s*[:：]?|[:：])\s*@?[\w.-]{3,}/gi, '[[contact]]');
}
const publicUser = (u) => u && { id: u.id, name: u.name };
const userById = (uid) => db.users.find((u) => u.id === uid);
function publicPost(p) {
  return { ...p, owner: publicUser(userById(p.ownerId)) };
}

// ---------- 앱 ----------
const app = express();
app.set('trust proxy', 1); // Render 등 HTTPS 프록시 뒤에서 동작
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
const auth = (req, res, next) => (req.user ? next() : bad(req, res, 'loginRequired', 401));
const bad = (req, res, key, code = 400) => res.status(code).json({ error: msg(req, key), code: key });

function startSession(res, user) {
  const token = crypto.randomBytes(32).toString('hex');
  db.sessions.push({ token, userId: user.id, createdAt: now() });
  save();
  res.cookie('sid', token, { httpOnly: true, sameSite: 'lax', secure: PROD, maxAge: 30 * 864e5 });
}

// ----- 인증 -----
app.post('/api/signup', (req, res) => {
  const { name, email, password } = req.body || {};
  if (!name || !email || !password || password.length < 6) return bad(req, res, 'signupInvalid');
  if (db.users.some((u) => u.email === email.toLowerCase())) return bad(req, res, 'emailTaken');
  const user = { id: id(), name: String(name).slice(0, 40), email: email.toLowerCase(), password: hashPassword(password), createdAt: now() };
  db.users.push(user);
  startSession(res, user);
  res.json(publicUser(user));
});
app.post('/api/login', (req, res) => {
  const { email, password } = req.body || {};
  const user = db.users.find((u) => u.email === String(email || '').toLowerCase());
  if (!user || !checkPassword(String(password || ''), user.password)) return bad(req, res, 'badLogin', 401);
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
  const { q, category, status = 'open' } = req.query;
  let list = db.posts.filter((p) => (status === 'all' ? true : p.status === status));
  if (category) list = list.filter((p) => p.category === category);
  if (q) {
    const k = String(q).toLowerCase();
    list = list.filter((p) => [p.title, p.description, p.story, p.placeName, p.country].join(' ').toLowerCase().includes(k));
  }
  // 기기의 현재 위치는 받지 않음: 거리 계산·가까운순 정렬은 브라우저에서만 처리 (위치정보 보호)
  const out = list.map(publicPost);
  // 정렬: new(최신순, 기본) | reward(사례금 높은순)
  const { sort } = req.query;
  if (sort === 'reward') out.sort((a, b) => b.reward - a.reward || b.createdAt.localeCompare(a.createdAt));
  else out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  res.json(out);
});
app.get('/api/posts/:id', (req, res) => {
  const p = db.posts.find((x) => x.id === req.params.id);
  p ? res.json(publicPost(p)) : bad(req, res, 'postNotFound', 404);
});
app.post('/api/posts', auth, upload.array('photos', 4), (req, res) => {
  const b = req.body;
  const lat = Number(b.lat), lng = Number(b.lng);
  if (!b.title || Number.isNaN(lat) || Number.isNaN(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180)
    return bad(req, res, 'postInvalid');
  const post = {
    id: id(),
    ownerId: req.user.id,
    title: String(b.title).slice(0, 80),
    category: CATEGORIES.includes(b.category) ? b.category : 'other',
    lang: SUPPORTED.includes(b.lang) ? b.lang : 'en', // 작성 언어 (번역 버튼 표시용)
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
  if (!p || p.ownerId !== req.user.id) return bad(req, res, 'forbidden', 403);
  if (req.body.status === 'closed') p.status = 'closed';
  save();
  res.json(publicPost(p));
});

// ----- 여행 일정 (그 지역에 가는 사람에게 주변 분실물 추천) -----
app.post('/api/trips', auth, (req, res) => {
  const { placeName, lat, lng, startDate, endDate, radiusKm = 30 } = req.body || {};
  if (lat == null || lng == null) return bad(req, res, 'tripInvalid');
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
  if (!post) return bad(req, res, 'postNotFound', 404);
  if (post.ownerId === req.user.id) return bad(req, res, 'ownPost');
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
  if (!t || (t.ownerId !== req.user.id && t.helperId !== req.user.id)) { bad(req, res, 'threadNotFound', 404); return null; }
  return t;
}
app.get('/api/threads/:id/messages', auth, (req, res) => {
  const t = myThread(req, res); if (!t) return;
  res.json({ thread: threadView(t, req.user.id), messages: db.messages.filter((m) => m.threadId === t.id) });
});
app.post('/api/threads/:id/messages', auth, (req, res) => {
  const t = myThread(req, res); if (!t) return;
  const text = String(req.body?.text || '').trim();
  if (!text) return bad(req, res, 'emptyMessage');
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
  if (t.ownerId !== req.user.id) return bad(req, res, 'ownerOnly', 403);
  if (d) return bad(req, res, 'dealExists');
  if (post.status !== 'open') return bad(req, res, 'postTaken');
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
  if (!d || !tr) return bad(req, res, 'badRequest');
  const role = t.ownerId === req.user.id ? 'owner' : 'helper';
  if (tr.who !== 'any' && tr.who !== role) return bad(req, res, 'otherParty', 403);
  if (d.status !== tr.from) return bad(req, res, 'wrongState');
  // TODO: 실서비스에서는 여기서 PG(토스페이먼츠·Stripe Connect 등) 결제/정산 API를 호출
  d.status = tr.to;
  if (req.body?.trackingNo) d.trackingNo = String(req.body.trackingNo).slice(0, 60);
  d.history.push({ status: tr.to, at: now() });
  if (tr.to === 'completed') post.status = 'found';
  if (tr.to === 'cancelled') { post.status = 'open'; db.deals = db.deals.filter((x) => x !== d); }
  save();
  res.json(d);
});

app.get('/healthz', (_req, res) => res.send('ok'));
app.get('/api/config', (_req, res) => res.json({ feeRate: FEE_RATE }));

// 빈 서버로 시작하면 둘러볼 수 있게 예시 글을 넣음 (SEED_DEMO=1)
function seedDemo() {
  if (process.env.SEED_DEMO !== '1' || db.posts.length) return;
  const demo = { id: id(), name: 'Byul Demo', email: 'demo@byul.app', password: hashPassword('demo1234'), createdAt: now() };
  db.users.push(demo);
  const P = (title, category, lat, lng, placeName, country, reward, story, lang) =>
    db.posts.push({ id: id(), ownerId: demo.id, title, category, lang, description: '', story, lat, lng, placeName, country, lostDate: null, reward, currency: 'KRW', photos: [], status: 'open', createdAt: now() });
  P('검정 소니 카메라', 'camera', 48.8606, 2.3376, '루브르 박물관', '프랑스', 200000, '신혼여행 사진이 전부 들어있어요. 메모리카드만이라도 찾고 싶어요.', 'ko');
  P('여권 지갑', 'id', 35.6909, 139.7003, '신주쿠역 동쪽 출구', '일본', 50000, '귀국 전날 잃어버렸어요.', 'ko');
  P('할머니가 주신 반지', 'jewelry', 41.4036, 2.1744, '사그라다 파밀리아', '스페인', 300000, '할머니 유품입니다. 작은 진주가 박혀 있어요.', 'ko');
  P('Blue backpack with laptop', 'bag', 37.5547, 126.9707, 'Seoul Station, airport railroad gate', 'South Korea', 150000, 'Left it on a bench before boarding the AREX. Thesis files inside!', 'en');
  save();
}

if (require.main === module) seedDemo(), app.listen(PORT, () => console.log(`Byul running on http://localhost:${PORT}`));
module.exports = { app, maskContacts, distanceKm };
