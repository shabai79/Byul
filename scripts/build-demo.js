// 체험판 빌드: 서버 없이 브라우저만으로 동작하는 한 장짜리 HTML을 만듭니다.
//   node scripts/build-demo.js            → dist/byul-demo.html
// public/의 화면 코드를 그대로 쓰고, /api 요청은 demo/mock-api.js가 브라우저 안에서 처리합니다.
// 외부 지도 이미지를 쓸 수 없는 곳(claude.ai 아티팩트 등)을 위해 세계 지도를 벡터로 내장합니다.
const fs = require('fs');
const path = require('path');
const topojson = require('topojson-client');
const { maskContacts, distanceKm } = require('../server');
const { MESSAGES } = require('../lib/messages');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const out = path.join(root, 'dist', 'byul-demo.html');

// 세계 지도 (Natural Earth 1:50m, 좌표는 소수 둘째 자리까지만)
const topo = JSON.parse(read('node_modules/world-atlas/countries-50m.json'));
const world = topojson.feature(topo, topo.objects.countries);
const round = (c) => (typeof c[0] === 'number' ? [Math.round(c[0] * 100) / 100, Math.round(c[1] * 100) / 100] : c.map(round));
// 날짜변경선(±180°)을 넘는 고리는 경도를 이어 붙여 지도에 가로줄이 생기지 않게 함
const unwrapRing = (ring) => { let shift = 0; return ring.map((p, i) => { if (i) { const d = p[0] + shift - (ring[i - 1][0] + prevShift(ring, i)); if (d > 180) shift -= 360; else if (d < -180) shift += 360; } ring[i]._s = shift; return [p[0] + shift, p[1]]; }); };
const prevShift = (ring, i) => ring[i - 1]._s || 0;
const unwrap = (g) => (g.type === 'Polygon' ? g.coordinates.map(unwrapRing) : g.coordinates.map((poly) => poly.map(unwrapRing)));
world.features = world.features.map((f) => ({ type: 'Feature', properties: {}, geometry: { type: f.geometry.type, coordinates: round(unwrap(f.geometry)) } }));

const html = read('public/index.html');
const body = html.slice(html.indexOf('<body>') + 6, html.indexOf('</body>')).replace(/\s*<script[^>]*><\/script>/g, '');
const mock = read('demo/mock-api.js')
  .replace('const MESSAGES = __MESSAGES__;', 'const MESSAGES = ' + JSON.stringify(MESSAGES) + ';')
  .replace('(function () {', `(function () {\n  ${maskContacts.toString()}\n  ${distanceKm.toString()}`);
const safe = (js) => js.replace(/<\/script/gi, '<\\/script');

const page = `<title>Byul</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=Gowun+Batang:wght@400;700&display=swap">
<style>
${read('node_modules/leaflet/dist/leaflet.css')}
${read('public/style.css')}
/* 체험판 전용 */
header { top: env(safe-area-inset-top, 0px); }
.demo-bar { display: flex; flex-wrap: wrap; gap: 6px 14px; align-items: center; justify-content: center; padding: 8px 16px; background: var(--ink); color: var(--sheet); font-size: 13px; text-align: center; }
.demo-bar b { color: var(--gold-soft); font-weight: 600; letter-spacing: .04em; }
.demo-bar button { padding: 3px 10px; font-size: 12px; background: transparent; color: var(--sheet); border-color: rgba(255,255,255,.35); }
.demo-bar button:hover { border-color: var(--sheet); }
@media (prefers-reduced-motion: reduce) { * { transition: none !important; } }
</style>
<div class="demo-bar"><b>체험판 DEMO</b><span>예시 데이터로 움직이는 미리보기예요. 올린 글과 대화는 이 기기에만 저장됩니다.</span><button type="button" id="demoReset">처음 상태로</button></div>
${body}
<script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js"></script>
<script>
window.BYUL_WORLD = ${JSON.stringify(world)};
window.BYUL_BASEMAP = function (m) {
  m.getContainer().style.background = '#dfe3de';
  m.setMaxBounds([[-85, -400], [85, 400]]);
  L.geoJSON(window.BYUL_WORLD, { renderer: L.canvas({ padding: 0.5 }), interactive: false,
    style: { color: '#cfc4ae', weight: 0.8, fillColor: '#faf7f0', fillOpacity: 1 } }).addTo(m);
  m.attributionControl.addAttribution('Natural Earth');
};
</script>
<script>${safe(read('public/icons.js'))}</script>
<script>${safe(read('public/i18n.js'))}</script>
<script>${safe(mock)}</script>
<script>${safe(read('public/app.js'))}</script>
<script>document.getElementById('demoReset').addEventListener('click', function () { window.BYUL_DEMO_RESET(); });</script>
`;
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, page);
console.log(`wrote ${path.relative(root, out)} (${(page.length / 1024).toFixed(0)} KB)`);
