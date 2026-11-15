// Byul 체험판용 가짜 서버: /api/* 요청을 브라우저 안에서 처리합니다.
// 서버와 같은 응답 형식을 쓰므로 public/app.js를 그대로 재사용할 수 있습니다.
// 빌드 시 __MESSAGES__, maskContacts, distanceKm 가 server.js / lib/messages.js에서 주입됩니다.
(function () {
  const KEY = 'byul-demo-v2';
  const M = window.BYUL_MISSION; // lib/mission.js (서버와 같은 거래 규칙)
  const FEE_RATE = 0.1;
  const CATEGORIES = ['electronics', 'id', 'wallet', 'bag', 'camera', 'jewelry', 'clothing', 'pet', 'keepsake', 'other'];
  const SUPPORTED = ['ko', 'en', 'ja', 'zh'];
  let seq = Date.now() % 100000;
  const id = (p) => p + (seq++).toString(36);
  const now = () => new Date().toISOString();
  const ago = (days) => new Date(Date.now() - days * 864e5).toISOString();

  function seed() {
    const U = (uid, name) => ({ id: uid, name, email: uid + '@demo.byul', password: 'demo1234', createdAt: now() });
    const me = U('u-me', '체험 사용자'), mina = U('u-mina', 'Mina'), alex = U('u-alex', 'Alex'), sora = U('u-sora', '空');
    const P = (pid, ownerId, title, category, lat, lng, placeName, country, reward, currency, story, description, lang, days, lostDaysAgo) => ({
      id: pid, ownerId, title, category, lang, description, story, lat, lng, placeName, country,
      lostDate: new Date(Date.now() - lostDaysAgo * 864e5).toISOString().slice(0, 10), reward, currency, photos: [], status: 'open', createdAt: ago(days),
    });
    const posts = [
      P('p-ring', 'u-mina', '할머니가 주신 반지', 'jewelry', 41.4036, 2.1744, '사그라다 파밀리아 북쪽 출입구', '스페인', 300000, 'KRW',
        '할머니가 돌아가시기 전에 끼워 주신 반지예요. 줄 서서 기다리다가 사진을 찍으려고 장갑을 벗었는데, 그때 빠진 것 같아요.\n\n값비싼 물건은 아니지만 저에게는 하나뿐인 물건입니다.',
        '얇은 금색 링, 안쪽에 "1962" 각인, 작은 진주 하나', 'ko', 3, 5),
      P('p-camera', 'u-me', '검정 소니 카메라', 'camera', 48.8606, 2.3376, '루브르 박물관 지하 카페 근처', '프랑스', 200000, 'KRW',
        '신혼여행 사진이 전부 들어 있어요. 카메라는 못 찾아도 메모리카드만이라도 돌려받고 싶어요.', 'Sony a6400, 손목 스트랩에 노란 리본', 'ko', 6, 8),
      P('p-passport', 'u-sora', 'パスポート入りの財布', 'id', 35.6909, 139.7003, '新宿駅 東口 改札付近', '日本', 8000, 'JPY',
        '帰国の前日に落としました。大使館には連絡済みですが、財布に家族の写真が入っています。', '茶色の革の財布', 'ja', 1, 2),
      P('p-backpack', 'u-alex', 'Blue backpack with laptop', 'bag', 37.5547, 126.9707, 'Seoul Station, airport railroad gate', 'South Korea', 150, 'USD',
        'Left it on a bench before boarding the AREX. My thesis files are on that laptop and the backup failed.', 'Navy Herschel backpack, MacBook inside, patch from Lisbon', 'en', 2, 2),
      P('p-dog', 'u-mina', '산책하다 놓친 강아지 "보리"', 'pet', 33.4996, 126.5312, '제주 탑동 해변 산책로', '대한민국', 500000, 'KRW',
        '목줄이 풀려서 해안 쪽으로 달려갔어요. 사람을 좋아하고 이름을 부르면 돌아봐요.', '흰색 진돗개, 빨간 목걸이, 6살', 'ko', 0.3, 0),
      P('p-scarf', 'u-alex', 'Wool scarf from my mother', 'clothing', 51.5007, -0.1246, 'Westminster Bridge, south end', 'United Kingdom', 40, 'GBP',
        'She knitted it the winter before I moved abroad. Probably fell out of my coat pocket while I was taking photos.', 'Grey and mustard stripes, slightly frayed at one end', 'en', 9, 10),
    ];
    posts.find((p) => p.id === 'p-camera').proof = '본체 밑면 시리얼 4012-77815, 메모리카드에 "Honeymoon" 라벨';
    const threads = [
      { id: 't-cam', postId: 'p-camera', ownerId: 'u-me', helperId: 'u-alex', kind: 'offer', offer: { scope: 'collect', baseFee: 20000, visitDate: new Date(Date.now() + 5 * 864e5).toISOString().slice(0, 10) }, createdAt: ago(1) },
      { id: 't-cam2', postId: 'p-camera', ownerId: 'u-me', helperId: 'u-mina', kind: 'offer', offer: { scope: 'inquire', baseFee: 5000, visitDate: new Date(Date.now() + 2 * 864e5).toISOString().slice(0, 10) }, createdAt: ago(0.5) },
      { id: 't-cam3', postId: 'p-camera', ownerId: 'u-me', helperId: 'u-sora', kind: 'finder', createdAt: ago(0.2) },
    ];
    const messages = [
      { id: 'm3', threadId: 't-cam2', senderId: 'u-mina', text: '모레 파리에 도착해요. 루브르 분실물센터와 근처 경찰서에 문의해서 보관 여부를 알려드릴게요.', createdAt: ago(0.5) },
      { id: 'm4', threadId: 't-cam3', senderId: 'u-sora', text: 'ルーブルの地下カフェで黒いカメラを拾い、インフォメーションの遺失物窓口に届けました。受付番号は L-2291 です。', createdAt: ago(0.2) },
      { id: 'm1', threadId: 't-cam', senderId: 'u-alex', text: 'Hi! I am flying to Paris next Tuesday and staying near the Louvre. I can ask at the museum lost-and-found desk for you.', createdAt: ago(1) },
      { id: 'm2', threadId: 't-cam', senderId: 'u-alex', text: 'If you want, message me on WhatsApp [[contact]] so it is faster.', createdAt: ago(0.9) },
    ];
    const trips = [{ id: 'tr1', userId: 'u-me', placeName: '바르셀로나', lat: 41.39, lng: 2.17, startDate: new Date(Date.now() + 12 * 864e5).toISOString().slice(0, 10), endDate: new Date(Date.now() + 17 * 864e5).toISOString().slice(0, 10), radiusKm: 30, createdAt: ago(1) }];
    return { users: [me, mina, alex, sora], session: 'u-me', posts, trips, threads, messages, deals: [] };
  }
  let db;
  try { db = JSON.parse(localStorage.getItem(KEY)); } catch { db = null; }
  if (!db || !db.posts) db = seed();
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { /* 저장 공간이 없거나 막혀 있으면 이번 방문 동안만 유지 */ } };
  window.BYUL_DEMO_RESET = () => { db = seed(); save(); location.hash = ''; location.reload(); };

  const MESSAGES = __MESSAGES__;
  let reqLang = 'ko';
  const err = (key, status = 400) => ({ status, body: { error: MESSAGES[key]?.[reqLang] ?? MESSAGES[key]?.en ?? key, code: key } });
  const ok = (body) => ({ status: 200, body });
  const user = (uid) => db.users.find((u) => u.id === uid);
  const pub = (u) => u && { id: u.id, name: u.name };
  const me = () => user(db.session);
  const publicPost = (p) => { const { proof, ...rest } = p; return { ...rest, hasProof: !!proof, owner: pub(user(p.ownerId)) }; };

  // 상대방 자동 응답 (체험판에서 혼자서도 흐름을 볼 수 있게)
  const REPLY = {
    thanks: { ko: '정말 감사합니다! 혹시 찾게 되면 사진 한 장 보내주실 수 있을까요?', en: 'Thank you so much! If you find it, could you send me a photo first?', ja: '本当にありがとうございます!見つかったら写真を送っていただけますか?', zh: '太感谢了!如果找到了,可以先发张照片给我吗?' },
    found: { ko: '분실물센터에서 확인했어요! 확인 정보와 시리얼이 일치해요. 위임장을 보여주고 받을게요.', en: 'Checked at the lost-and-found desk and the serial matches your proof! I will collect it with your authorization letter.', ja: '遺失物センターで確認しました!確認情報と製造番号が一致しています。委任状を見せて受け取ります。', zh: '在失物招领处确认了,序列号和确认信息一致!我会凭委托书去领取。' },
    place: { ko: '루브르 박물관 안내데스크 분실물 창구', en: 'Louvre information desk, lost property', ja: 'ルーブル美術館 インフォメーション 遺失物窓口', zh: '卢浮宫服务台失物招领处' },
    placeNote: { ko: '접수번호 L-2291', en: 'ref. L-2291', ja: '受付番号 L-2291', zh: '登记号 L-2291' },
    shipped: { ko: '분실물센터에서 받았어요. 방금 EMS로 보냈습니다!', en: 'Picked it up at the lost-and-found desk and sent it by EMS just now!', ja: '遺失物センターで受け取り、今EMSで発送しました!', zh: '已经在失物招领处取到,刚用EMS寄出了!' },
  };
  function later(fn, ms) { setTimeout(() => { fn(); save(); window.dispatchEvent(new HashChangeEvent('hashchange')); }, ms); }

  function threadView(t, meId) {
    const post = db.posts.find((p) => p.id === t.postId);
    const msgs = db.messages.filter((m) => m.threadId === t.id);
    return {
      ...t,
      post: post && { id: post.id, title: post.title, placeName: post.placeName, status: post.status, reward: post.reward, currency: post.currency },
      other: pub(user(t.ownerId === meId ? t.helperId : t.ownerId)),
      role: t.ownerId === meId ? 'owner' : 'helper',
      lastMessage: msgs[msgs.length - 1] || null,
      deal: db.deals.find((d) => d.threadId === t.id) || null,
    };
  }

  async function handle(method, path, query, body) {
    const u = me();
    const need = () => (u ? null : err('loginRequired', 401));
    let m;
    if (path === '/api/config') return ok({ feeRate: FEE_RATE });
    if (path === '/api/me') return ok(pub(u) || null);
    if (path === '/api/logout') { db.session = null; save(); return ok({ ok: true }); }
    if (path === '/api/signup') {
      const { name, email, password } = body || {};
      if (!name || !email || !password || password.length < 6) return err('signupInvalid');
      if (db.users.some((x) => x.email === email.toLowerCase())) return err('emailTaken');
      const nu = { id: id('u'), name: String(name).slice(0, 40), email: email.toLowerCase(), password, createdAt: now() };
      db.users.push(nu); db.session = nu.id; save(); return ok(pub(nu));
    }
    if (path === '/api/login') {
      const x = db.users.find((y) => y.email === String(body?.email || '').toLowerCase());
      if (!x || x.password !== body?.password) return err('badLogin', 401);
      db.session = x.id; save(); return ok(pub(x));
    }
    if (path === '/api/posts' && method === 'GET') {
      let list = db.posts.filter((p) => p.status === 'open');
      if (query.category) list = list.filter((p) => p.category === query.category);
      if (query.q) { const k = query.q.toLowerCase(); list = list.filter((p) => [p.title, p.description, p.story, p.placeName, p.country].join(' ').toLowerCase().includes(k)); }
      let out = list.map(publicPost);
      if (query.sort === 'reward') out.sort((a, b) => b.reward - a.reward);
      else out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return ok(out);
    }
    if (path === '/api/posts' && method === 'POST') {
      if (need()) return need();
      const lat = Number(body.lat), lng = Number(body.lng);
      if (!body.title || Number.isNaN(lat) || Number.isNaN(lng)) return err('postInvalid');
      const p = {
        id: id('p'), ownerId: u.id, title: String(body.title).slice(0, 80), category: CATEGORIES.includes(body.category) ? body.category : 'other',
        lang: SUPPORTED.includes(body.lang) ? body.lang : 'en', description: maskContacts(body.description || ''), proof: String(body.proof || '').trim().slice(0, 500), story: maskContacts(body.story || ''),
        lat, lng, placeName: body.placeName || '', country: body.country || '', lostDate: body.lostDate || null,
        reward: Math.max(0, Math.round(Number(body.reward) || 0)), currency: body.currency || 'KRW', photos: body.photos || [], status: 'open', createdAt: now(),
      };
      db.posts.push(p); save(); return ok(publicPost(p));
    }
    if ((m = path.match(/^\/api\/posts\/([\w-]+)$/))) {
      const p = db.posts.find((x) => x.id === m[1]); if (!p) return err('postNotFound', 404);
      if (method === 'PATCH') { if (!u || p.ownerId !== u.id) return err('forbidden', 403); p.status = 'closed'; save(); }
      return ok(publicPost(p));
    }
    if (path === '/api/trips') {
      if (need()) return need();
      if (method === 'POST') {
        if (body.lat == null) return err('tripInvalid');
        db.trips.push({ id: id('tr'), userId: u.id, placeName: body.placeName, lat: +body.lat, lng: +body.lng, startDate: body.startDate, endDate: body.endDate, radiusKm: +body.radiusKm || 30, createdAt: now() });
        save(); return ok({ ok: true });
      }
      return ok(db.trips.filter((t) => t.userId === u.id).map((t) => ({ ...t, matches: db.posts.filter((p) => p.status === 'open' && p.ownerId !== u.id && distanceKm(t, p) <= t.radiusKm).map((p) => ({ ...publicPost(p), distanceKm: Math.round(distanceKm(t, p) * 10) / 10 })) })));
    }
    if ((m = path.match(/^\/api\/trips\/([\w-]+)$/))) { db.trips = db.trips.filter((t) => t.id !== m[1]); save(); return ok({ ok: true }); }
    if ((m = path.match(/^\/api\/posts\/([\w-]+)\/threads$/))) {
      if (need()) return need();
      const p = db.posts.find((x) => x.id === m[1]); if (!p) return err('postNotFound', 404);
      if (p.ownerId === u.id) return err('ownPost');
      const kind = body?.kind === 'finder' ? 'finder' : 'offer';
      let t = db.threads.find((x) => x.postId === p.id && x.helperId === u.id);
      if (!t) { t = { id: id('t'), postId: p.id, ownerId: p.ownerId, helperId: u.id, kind, createdAt: now() }; db.threads.push(t); }
      if (kind === 'offer' && !db.deals.some((d) => d.threadId === t.id)) { t.kind = 'offer'; t.offer = M.makeOffer(body); }
      if (body?.text) {
        db.messages.push({ id: id('m'), threadId: t.id, senderId: u.id, text: maskContacts(body.text), createdAt: now() });
        later(() => db.messages.push({ id: id('m'), threadId: t.id, senderId: p.ownerId, text: REPLY.thanks[p.lang] || REPLY.thanks.en, createdAt: now() }), 1800);
      }
      save(); return ok(threadView(t, u.id));
    }
    if (path === '/api/threads') { if (need()) return need(); return ok(db.threads.filter((t) => t.ownerId === u.id || t.helperId === u.id).map((t) => threadView(t, u.id))); }
    if ((m = path.match(/^\/api\/threads\/([\w-]+)(\/.*)?$/))) {
      if (need()) return need();
      const t = db.threads.find((x) => x.id === m[1]);
      if (!t || (t.ownerId !== u.id && t.helperId !== u.id)) return err('threadNotFound', 404);
      const rest = m[2] || '', post = db.posts.find((p) => p.id === t.postId), d = db.deals.find((x) => x.threadId === t.id);
      if (rest === '/messages' && method === 'GET') { const v = threadView(t, u.id); return ok({ thread: v, proof: post?.proof && M.canSeeProof(v.role, v.deal) ? post.proof : null, messages: db.messages.filter((x) => x.threadId === t.id) }); }
      if (rest === '/messages') {
        const text = String(body?.text || '').trim(); if (!text) return err('emptyMessage');
        const masked = maskContacts(text); db.messages.push({ id: id('m'), threadId: t.id, senderId: u.id, text: masked, createdAt: now() }); save();
        return ok({ masked: masked !== text });
      }
      if (rest === '/deal') {
        if (t.ownerId !== u.id) return err('ownerOnly', 403);
        if (d) return err('dealExists');
        if (post.status !== 'open') return err('postTaken');
        const r = M.createDeal({ post, thread: t, body, feeRate: FEE_RATE, id: () => id('d'), now });
        if (r.error) return err(r.error);
        db.deals.push(r.deal); save(); return ok(r.deal);
      }
      const action = (rest.match(/^\/deal\/(\w+)$/) || [])[1];
      const role = t.ownerId === u.id ? 'owner' : 'helper';
      const r = M.transition(d, action, role, body || {}, now);
      if (r.error) return err(r.error, r.status || 400);
      if (r.postStatus) post.status = r.postStatus;
      if (r.remove) db.deals = db.deals.filter((x) => x !== d);
      // 체험판: 분실자가 결제하면 도우미(예시 사용자)가 잠시 뒤 찾고, 수령·발송까지 진행
      const lang = SUPPORTED.includes(reqLang) ? reqLang : 'en';
      const say = (key) => db.messages.push({ id: id('m'), threadId: t.id, senderId: t.helperId, text: REPLY[key][lang], createdAt: now() });
      if (action === 'pay' && role === 'owner') {
        later(() => { if (d.status === 'paid') { M.transition(d, 'found', 'helper', { foundPlace: REPLY.place[lang], note: REPLY.placeNote[lang] }, now); say('found'); } }, 2200);
        if (d.scope === 'collect') later(() => { if (d.status === 'found') { M.transition(d, 'ship', 'helper', { trackingNo: 'EMS EE123456789FR' }, now); say('shipped'); } }, 4800);
      }
      save(); return ok(r.deal);
    }
    return err('badRequest', 404);
  }

  const readFile = (f) => new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => res(null); r.readAsDataURL(f); });
  const realFetch = window.fetch.bind(window);
  window.fetch = async (input, opts = {}) => {
    const url = typeof input === 'string' ? input : input.url;
    if (!url.startsWith('/api/')) return realFetch(input, opts);
    const u = new URL(url, 'https://demo.local');
    reqLang = (opts.headers && opts.headers['X-Lang']) || 'ko';
    let body = null;
    if (opts.body instanceof FormData) {
      body = {};
      const photos = [];
      for (const [k, v] of opts.body.entries()) {
        if (k === 'photos') { if (v && v.size) { const d = await readFile(v); if (d) photos.push(d); } }
        else body[k] = v;
      }
      body.photos = photos.slice(0, 4);
    } else if (opts.body) body = JSON.parse(opts.body);
    const r = await handle((opts.method || 'GET').toUpperCase(), u.pathname, Object.fromEntries(u.searchParams), body);
    return new Response(JSON.stringify(r.body), { status: r.status, headers: { 'Content-Type': 'application/json' } });
  };
  // 체험판에서는 브라우저 확인창이 막혀 있으므로 데모 결제 확인은 자동 승인
  window.confirm = () => true;
})();
