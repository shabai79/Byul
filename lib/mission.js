// 찾기 의뢰(미션) 규칙: 서버(server.js)와 체험판(demo/mock-api.js)이 함께 씁니다.
//
// 서비스 구조
//   - 도우미가 '제안'을 보낸다: 방문 예정일, 맡을 일(문의만 / 문의+수령·발송), 기본 수고비
//   - 분실자가 제안을 골라 결제하면 결제대행사가 맡아 둔다(에스크로)
//   - 찾으면 보관처를 알리고 → (수령·발송) → 분실자 수령 확인 → 기본 수고비 + 성공 사례금 지급
//   - 못 찾으면 기본 수고비만 지급하고 성공 사례금·배송비는 환불
//   - '주웠어요' 대화(finder)에는 돈이 오가지 않는다: 습득물은 경찰·시설 제출이 원칙(유실물법)
(function (root) {
  const SCOPES = ['inquire', 'collect'];
  const n0 = (v) => Math.max(0, Math.round(Number(v) || 0));

  function makeOffer(body = {}) {
    return {
      scope: SCOPES.includes(body.scope) ? body.scope : 'collect',
      baseFee: n0(body.baseFee),
      visitDate: /^\d{4}-\d{2}-\d{2}$/.test(body.visitDate || '') ? body.visitDate : null,
    };
  }

  // 금액 계산: 수수료는 기본 수고비와 성공 사례금 각각에 붙인다(못 찾으면 사례금 쪽 수수료도 환불)
  function quote({ baseFee, reward, shippingCost }, feeRate) {
    const feeBase = Math.round(baseFee * feeRate), feeReward = Math.round(reward * feeRate);
    return { baseFee, reward, shippingCost, feeBase, feeReward, fee: feeBase + feeReward, total: baseFee + reward + shippingCost + feeBase + feeReward };
  }

  function createDeal({ post, thread, body = {}, feeRate, id, now }) {
    if (thread.kind === 'finder') return { error: 'finderNoDeal' };
    const offer = thread.offer || makeOffer({});
    const reward = n0(body.reward ?? post.reward);
    const shippingCost = offer.scope === 'collect' ? n0(body.shippingCost) : 0;
    const q = quote({ baseFee: offer.baseFee, reward, shippingCost }, feeRate);
    return {
      deal: {
        id: id(), threadId: thread.id, postId: post.id, ownerId: thread.ownerId, helperId: thread.helperId,
        scope: offer.scope, ...q, feeRate, currency: post.currency, status: 'proposed', history: [{ status: 'proposed', at: now() }],
      },
    };
  }

  const TRANSITIONS = {
    pay: { from: 'proposed', to: 'paid', who: 'owner' },
    found: { from: 'paid', to: 'found', who: 'helper' },
    notfound: { from: 'paid', to: 'notfound', who: 'helper' },
    ship: { from: 'found', to: 'shipped', who: 'helper', scope: 'collect' },
    confirm: { from: 'shipped', to: 'completed', who: 'owner' },
    confirmInfo: { from: 'found', to: 'completed', who: 'owner', scope: 'inquire' },
    closeNotFound: { from: 'notfound', to: 'closed', who: 'owner' },
    cancel: { from: 'proposed', to: 'cancelled', who: 'any' },
  };

  // 결과: { error } 또는 { deal, postStatus, remove }
  function transition(deal, action, role, body = {}, now) {
    const tr = TRANSITIONS[action];
    if (!deal || !tr) return { error: 'badRequest' };
    if (tr.who !== 'any' && tr.who !== role) return { error: 'otherParty', status: 403 };
    if (deal.status !== tr.from || (tr.scope && tr.scope !== deal.scope)) return { error: 'wrongState' };
    const text = (v, max) => String(v || '').trim().slice(0, max);
    if (action === 'found') {
      if (!text(body.foundPlace, 120)) return { error: 'needFoundPlace' };
      deal.found = { place: text(body.foundPlace, 120), note: text(body.note, 500) };
    }
    if (action === 'notfound') deal.notFoundNote = text(body.note, 500);
    if (action === 'ship') deal.trackingNo = text(body.trackingNo, 60);
    // TODO(실서비스): pay / completed / closed / cancelled 시점에 결제대행사(토스페이먼츠 지급대행, Stripe Connect 등) API 호출
    deal.status = tr.to;
    deal.history.push({ status: tr.to, at: now() });
    let postStatus = null;
    if (tr.to === 'paid') postStatus = 'matched';
    if (tr.to === 'completed') { deal.payout = deal.baseFee + deal.reward + deal.shippingCost; deal.refund = 0; postStatus = 'found'; }
    if (tr.to === 'closed') { deal.payout = deal.baseFee; deal.refund = deal.total - deal.baseFee - deal.feeBase; postStatus = 'open'; }
    if (tr.to === 'cancelled') postStatus = 'open';
    return { deal, postStatus, remove: tr.to === 'cancelled' };
  }

  // 결제 뒤에만 도우미에게 비공개 확인 정보를 보여준다
  const PROOF_VISIBLE = ['paid', 'found', 'notfound', 'shipped', 'completed', 'closed'];
  const canSeeProof = (role, deal) => role === 'owner' || (!!deal && PROOF_VISIBLE.includes(deal.status));

  const api = { SCOPES, makeOffer, quote, createDeal, transition, TRANSITIONS, canSeeProof };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BYUL_MISSION = api;
})(typeof window !== 'undefined' ? window : globalThis);
