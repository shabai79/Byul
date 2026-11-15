const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
process.env.FEE_RATE = '0.1';
const dbFile = path.join(__dirname, '..', 'data', 'db.json');
fs.rmSync(dbFile, { force: true });
const { app, maskContacts } = require('../server');

test('연락처 마스킹', () => {
  assert.match(maskContacts('제 번호 010-1234-5678 이에요'), /\[\[contact\]\]/);
  assert.match(maskContacts('mail me a@b.com'), /\[\[contact\]\]/);
  assert.match(maskContacts('카톡 id: hello123'), /\[\[contact\]\]/);
  assert.equal(maskContacts('다음주 3일에 갑니다'), '다음주 3일에 갑니다');
});

test('분실 → 여행 매칭 → 대화 → 에스크로 거래 전체 흐름', async () => {
  const server = app.listen(0);
  const base = `http://localhost:${server.address().port}`;
  const client = () => {
    let cookie = '';
    return async (url, method = 'GET', body) => {
      const r = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', cookie }, body: body && JSON.stringify(body) });
      const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
      return { status: r.status, data: await r.json() };
    };
  };
  const owner = client(), helper = client();
  await owner('/api/signup', 'POST', { name: '분실자', email: 'o@x.com', password: 'secret1' });
  await helper('/api/signup', 'POST', { name: '여행자', email: 'h@x.com', password: 'secret1' });

  const fd = new FormData();
  Object.entries({ title: '할머니 반지', category: 'jewelry', lang: 'ko', lat: 48.8584, lng: 2.2945, placeName: '에펠탑', country: '프랑스', reward: 100000, story: '연락은 010-9999-8888' }).forEach(([k, v]) => fd.append(k, v));
  const login = await fetch(base + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'o@x.com', password: 'secret1' }) });
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const post = await (await fetch(base + '/api/posts', { method: 'POST', body: fd, headers: { cookie } })).json();
  assert.equal(post.title, '할머니 반지');
  assert.equal(post.category, 'jewelry');
  assert.equal(post.lang, 'ko');
  assert.match(post.story, /\[\[contact\]\]/);

  await helper('/api/trips', 'POST', { placeName: '파리', lat: 48.86, lng: 2.35, radiusKm: 20 });
  const trips = (await helper('/api/trips')).data;
  assert.equal(trips[0].matches.length, 1);

  const t = (await helper(`/api/posts/${post.id}/threads`, 'POST', { text: '다음 주에 갑니다. 내 이메일 me@test.com' })).data;
  const msgs = (await owner(`/api/threads/${t.id}/messages`)).data.messages;
  assert.match(msgs[0].text, /\[\[contact\]\]/);

  const d = (await owner(`/api/threads/${t.id}/deal`, 'POST', { reward: 100000, shippingCost: 30000 })).data;
  assert.equal(d.fee, 10000); assert.equal(d.total, 140000);
  assert.equal((await helper(`/api/threads/${t.id}/deal/pay`, 'POST')).status, 403);
  await owner(`/api/threads/${t.id}/deal/pay`, 'POST');
  await helper(`/api/threads/${t.id}/deal/ship`, 'POST', { trackingNo: 'EMS123' });
  const done = (await owner(`/api/threads/${t.id}/deal/confirm`, 'POST')).data;
  assert.equal(done.status, 'completed');
  assert.equal((await owner(`/api/posts/${post.id}`)).data.status, 'found');
  server.close();
  fs.rmSync(dbFile, { force: true });
});

test('오류 메시지가 요청 언어로 번역됨', async () => {
  const server = app.listen(0);
  const base = `http://localhost:${server.address().port}`;
  const get = async (h) => (await (await fetch(base + '/api/trips', { headers: h })).json()).error;
  assert.equal(await get({ 'X-Lang': 'ko' }), '로그인이 필요합니다.');
  assert.equal(await get({ 'X-Lang': 'ja' }), 'ログインしてください。');
  assert.equal(await get({ 'Accept-Language': 'zh-CN,zh;q=0.9' }), '请先登录。');
  assert.equal(await get({ 'X-Lang': 'fr' }), 'Please log in.');
  server.close();
});

test('다국어 메신저 ID 마스킹, 일반 단어는 유지', () => {
  assert.equal(maskContacts('online meeting'), 'online meeting');
  assert.match(maskContacts('LINE: tanaka_88'), /\[\[contact\]\]/);
  assert.match(maskContacts('微信号 wx_abc'), /\[\[contact\]\]/);
});

test('모든 언어 사전이 같은 키를 가짐', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'i18n.js'), 'utf8');
  const { MESSAGES } = new Function('navigator', 'localStorage', src + '; return { MESSAGES };')({ languages: ['ko'] }, { getItem() {}, setItem() {} });
  const base = Object.keys(MESSAGES.ko).sort();
  for (const l of Object.keys(MESSAGES)) assert.deepEqual(Object.keys(MESSAGES[l]).sort(), base, l + ' 사전의 키가 다릅니다');
});

test('서버는 기기 위치를 받지 않음 (거리 계산은 브라우저에서만)', async () => {
  const server = app.listen(0);
  const base = `http://localhost:${server.address().port}`;
  const list = await (await fetch(base + '/api/posts?lat=37.5&lng=127&sort=near')).json();
  assert.ok(Array.isArray(list));
  assert.ok(list.every((p) => p.distanceKm === undefined));
  server.close();
});
