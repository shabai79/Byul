// 서버 오류 메시지 번역. 키는 코드에서 쓰는 식별자, 클라이언트는 X-Lang 헤더로 언어를 알려줍니다.
const MESSAGES = {
  loginRequired: { ko: '로그인이 필요합니다.', en: 'Please log in.', ja: 'ログインしてください。', zh: '请先登录。' },
  signupInvalid: { ko: '이름, 이메일, 6자 이상 비밀번호를 입력하세요.', en: 'Enter a name, email and a password of at least 6 characters.', ja: '名前、メールアドレス、6文字以上のパスワードを入力してください。', zh: '请输入名字、邮箱和至少6位的密码。' },
  emailTaken: { ko: '이미 가입된 이메일입니다.', en: 'This email is already registered.', ja: 'このメールアドレスは登録済みです。', zh: '该邮箱已注册。' },
  badLogin: { ko: '이메일 또는 비밀번호가 틀렸습니다.', en: 'Wrong email or password.', ja: 'メールアドレスまたはパスワードが違います。', zh: '邮箱或密码错误。' },
  postNotFound: { ko: '게시글이 없습니다.', en: 'Post not found.', ja: '投稿が見つかりません。', zh: '找不到该帖子。' },
  postInvalid: { ko: '물건 이름과 지도 위치는 필수입니다.', en: 'Item name and map location are required.', ja: '品名と地図上の位置は必須です。', zh: '物品名称和地图位置为必填项。' },
  forbidden: { ko: '권한이 없습니다.', en: 'You do not have permission.', ja: '権限がありません。', zh: '没有权限。' },
  tripInvalid: { ko: '여행지 위치를 지도에서 선택하세요.', en: 'Choose your destination on the map.', ja: '地図で旅行先を選んでください。', zh: '请在地图上选择目的地。' },
  ownPost: { ko: '본인 게시글입니다.', en: 'This is your own post.', ja: 'ご自身の投稿です。', zh: '这是你自己的帖子。' },
  threadNotFound: { ko: '대화방이 없습니다.', en: 'Conversation not found.', ja: '会話が見つかりません。', zh: '找不到该对话。' },
  emptyMessage: { ko: '내용을 입력하세요.', en: 'Please enter a message.', ja: 'メッセージを入力してください。', zh: '请输入内容。' },
  ownerOnly: { ko: '분실자만 거래를 시작할 수 있습니다.', en: 'Only the owner can start a deal.', ja: '取引を始められるのは持ち主だけです。', zh: '只有失主可以发起交易。' },
  dealExists: { ko: '이미 거래가 진행 중입니다.', en: 'A deal is already in progress.', ja: 'すでに取引が進行中です。', zh: '交易已在进行中。' },
  postTaken: { ko: '이미 다른 사람과 진행 중인 게시글입니다.', en: 'This post is already in progress with someone else.', ja: 'この投稿はすでに他の方と進行中です。', zh: '该帖子已在与他人进行中。' },
  badRequest: { ko: '잘못된 요청입니다.', en: 'Invalid request.', ja: '不正なリクエストです。', zh: '无效的请求。' },
  otherParty: { ko: '이 단계는 상대방이 진행해야 합니다.', en: 'The other party must do this step.', ja: 'この手順は相手の方が行います。', zh: '此步骤需要由对方完成。' },
  wrongState: { ko: '현재 상태에서는 할 수 없습니다.', en: 'Not possible in the current state.', ja: '現在の状態ではできません。', zh: '当前状态下无法执行。' },
};
const SUPPORTED = ['ko', 'en', 'ja', 'zh'];
function pickLang(req) {
  const wanted = [req.get('x-lang'), ...String(req.get('accept-language') || '').split(',')].filter(Boolean);
  for (const w of wanted) { const c = w.trim().slice(0, 2).toLowerCase(); if (SUPPORTED.includes(c)) return c; }
  return 'en';
}
const msg = (req, key) => MESSAGES[key]?.[pickLang(req)] ?? MESSAGES[key]?.en ?? key;
module.exports = { msg, pickLang, SUPPORTED };
