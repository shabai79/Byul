// Byul 선 아이콘 세트 (24×24, 1.6px 선). 이모지 대신 사용합니다.
const ICON_PATHS = {
  // 분류
  electronics: '<rect x="7" y="2.5" width="10" height="19" rx="2"/><path d="M11 18.5h2"/>',
  id: '<rect x="5" y="2.5" width="14" height="19" rx="1.5"/><circle cx="12" cy="10" r="3.2"/><path d="M8.8 10h6.4M12 6.8c-1 .9-1.4 2-1.4 3.2s.4 2.3 1.4 3.2M12 6.8c1 .9 1.4 2 1.4 3.2s-.4 2.3-1.4 3.2M8.5 17h7"/>',
  wallet: '<path d="M4 8h14.5a1.5 1.5 0 0 1 1.5 1.5v8.5a1.5 1.5 0 0 1-1.5 1.5H5.5A1.5 1.5 0 0 1 4 18z"/><path d="M4 8V6.8a1.5 1.5 0 0 1 1.1-1.4l9.6-2.6a1 1 0 0 1 1.3 1V8"/><path d="M20 12h-3.5a1.75 1.75 0 0 0 0 3.5H20"/>',
  bag: '<path d="M6.5 10a5.5 5.5 0 0 1 11 0v9.5a1.5 1.5 0 0 1-1.5 1.5H8a1.5 1.5 0 0 1-1.5-1.5z"/><path d="M9.5 5V4a2.5 2.5 0 0 1 5 0v1"/><path d="M9 14.5h6v3.5H9z"/>',
  camera: '<path d="M3 9a1.5 1.5 0 0 1 1.5-1.5h2.8L9 5h6l1.7 2.5h2.8A1.5 1.5 0 0 1 21 9v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18z"/><circle cx="12" cy="13.2" r="3.6"/>',
  jewelry: '<circle cx="12" cy="15" r="6"/><path d="M9.6 9.5 8.2 6.3 10 3.8h4l1.8 2.5-1.4 3.2"/><path d="M8.2 6.3h7.6"/>',
  clothing: '<path d="M9 3.5 12 6.5l3-3 4.5 2.2.5 5.3-2.5.6V20.5h-11v-8.9L4 11l.5-5.3z"/><path d="M12 6.5V20.5"/>',
  pet: '<circle cx="6.5" cy="10.5" r="1.7"/><circle cx="10" cy="6.5" r="1.7"/><circle cx="14" cy="6.5" r="1.7"/><circle cx="17.5" cy="10.5" r="1.7"/><path d="M12 12.2c-2.8 0-5 3.3-5 5.4 0 1.5 1.2 2.2 2.4 2.2 1.1 0 1.6-.6 2.6-.6s1.5.6 2.6.6c1.2 0 2.4-.7 2.4-2.2 0-2.1-2.2-5.4-5-5.4z"/>',
  keepsake: '<rect x="3" y="5.5" width="18" height="13" rx="1.5"/><path d="m3.5 6.5 8.5 6.2 8.5-6.2"/><path d="M12 16.2s-2.2-1.3-2.2-2.7c0-.8.6-1.3 1.2-1.3.5 0 .8.2 1 .6.2-.4.5-.6 1-.6.6 0 1.2.5 1.2 1.3 0 1.4-2.2 2.7-2.2 2.7z" fill="currentColor" stroke="none" transform="translate(0 -.4)"/>',
  other: '<path d="M3.5 7.5 12 3.5l8.5 4v9L12 20.5l-8.5-4z"/><path d="M3.5 7.5 12 11.5l8.5-4M12 11.5v9"/>',
  // 화면
  pin: '<path d="M12 21s-6.5-5.8-6.5-11a6.5 6.5 0 0 1 13 0c0 5.2-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>',
  locate: '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2.5"/><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.4 2.6 3.6 5.6 3.6 9s-1.2 6.4-3.6 9c-2.4-2.6-3.6-5.6-3.6-9S9.6 5.6 12 3z"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="1.5"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  list: '<path d="M9 6.5h11M9 12h11M9 17.5h11"/><circle cx="4.5" cy="6.5" r=".9" fill="currentColor"/><circle cx="4.5" cy="12" r=".9" fill="currentColor"/><circle cx="4.5" cy="17.5" r=".9" fill="currentColor"/>',
  map: '<path d="m9 4.5-5.5 2v13l5.5-2 6 2 5.5-2v-13l-5.5 2z"/><path d="M9 4.5v13M15 6.5v13"/>',
  plane: '<path d="M10.5 13.5 4 11l1.2-1.2 7.3.8 4.2-4.2a1.8 1.8 0 0 1 2.6 2.6l-4.2 4.2.8 7.3L14.7 21l-2.5-6.5L9 17.7v2.1L7.8 21l-1.3-2.8L3.7 17 5 15.8h2.1z"/>',
  translate: '<path d="M4 5.5h8M8 4v1.5M10.5 5.5c-.8 3.5-3 6-6 7.5M6 8.5c1 1.8 2.6 3.2 4.5 4"/><path d="m12.5 20 3.5-8.5 3.5 8.5M13.7 17.2h4.6"/>',
  bulb: '<path d="M9 17.5h6M10 20.5h4M12 3.5a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1 2v1.2h5.2v-1.2c0-.8.4-1.5 1-2A6 6 0 0 0 12 3.5z"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
};
// 별 로고: 네 갈래 별 (채움)
const STAR_SVG = '<svg class="star" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 1.5c.5 5.3 2.2 8 10.5 10.5C14.2 14.5 12.5 17.2 12 22.5c-.5-5.3-2.2-8-10.5-10.5C9.8 9.5 11.5 6.8 12 1.5z"/></svg>';
function icon(name, cls = '') {
  const d = ICON_PATHS[name] || ICON_PATHS.other;
  return `<svg class="ico ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
}
