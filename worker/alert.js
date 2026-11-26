// Cloudflare Worker: 보유 종목 하락 신호를 카카오톡 "나에게 보내기"로 전달
// 바인딩/변수는 같은 폴더 README 또는 저장소 README 참고
const KAKAO_AUTH = 'https://kauth.kakao.com';
const KAKAO_API = 'https://kapi.kakao.com';
const num = (v, d) => (v === undefined || v === '' || isNaN(+v) ? d : +v);

export default {
  async fetch(req, env) {
    const u = new URL(req.url);
    if (!env.ADMIN || u.searchParams.get('key') !== env.ADMIN) return new Response('forbidden', { status: 403 });
    const redirect = u.origin + '/callback';
    if (u.pathname === '/auth') {
      const url = `${KAKAO_AUTH}/oauth/authorize?client_id=${env.KAKAO_REST_KEY}&redirect_uri=${encodeURIComponent(redirect)}&response_type=code&scope=talk_message`;
      return Response.redirect(url, 302);
    }
    if (u.pathname === '/callback') {
      const body = new URLSearchParams({ grant_type: 'authorization_code', client_id: env.KAKAO_REST_KEY, redirect_uri: redirect, code: u.searchParams.get('code') || '' });
      if (env.KAKAO_CLIENT_SECRET) body.set('client_secret', env.KAKAO_CLIENT_SECRET);
      const r = await fetch(KAKAO_AUTH + '/oauth/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body });
      const j = await r.json();
      if (!j.access_token) return new Response('토큰 발급 실패: ' + JSON.stringify(j), { status: 400 });
      await saveTok(env, j);
      return new Response('연결 완료. 이 창을 닫고 /test?key=... 로 테스트 메시지를 보내 보세요.');
    }
    if (u.pathname === '/test') {
      const ok = await kakao(env, '테스트: 주식 장부 알림이 연결되었습니다.');
      return new Response(ok ? '전송됨' : '전송 실패 (토큰 확인)', { status: ok ? 200 : 500 });
    }
    if (u.pathname === '/run') return new Response(JSON.stringify(await check(env, true)), { headers: { 'content-type': 'application/json' } });
    return new Response('ok');
  },
  async scheduled(_e, env, ctx) { ctx.waitUntil(check(env, false)); },
};

async function saveTok(env, j) {
  const old = JSON.parse((await env.KV.get('tok')) || '{}');
  const t = {
    access: j.access_token,
    refresh: j.refresh_token || old.refresh,
    exp: Date.now() + (j.expires_in || 21600) * 1000,
  };
  await env.KV.put('tok', JSON.stringify(t));
  return t;
}
async function token(env) {
  let t = JSON.parse((await env.KV.get('tok')) || 'null');
  if (!t) return null;
  if (t.exp - Date.now() < 600000) {
    const body = new URLSearchParams({ grant_type: 'refresh_token', client_id: env.KAKAO_REST_KEY, refresh_token: t.refresh });
    if (env.KAKAO_CLIENT_SECRET) body.set('client_secret', env.KAKAO_CLIENT_SECRET);
    const r = await fetch(KAKAO_AUTH + '/oauth/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body });
    const j = await r.json();
    if (!j.access_token) return null;
    t = await saveTok(env, j);
  }
  return t.access;
}
async function kakao(env, text) {
  const at = await token(env);
  if (!at) return false;
  const link = env.SITE_URL || 'https://kidesh10-droid.github.io/stock/';
  const tpl = { object_type: 'text', text: text.slice(0, 900), link: { web_url: link, mobile_web_url: link }, button_title: '장부 열기' };
  const r = await fetch(KAKAO_API + '/v2/api/talk/memo/default/send', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + at, 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ template_object: JSON.stringify(tpl) }),
  });
  return r.ok;
}

// 시세: 하이퍼리퀴드 24h 선물 → 없으면 야후 (서버에서는 야후가 막히지 않는 편)
async function quotes(tks) {
  const out = {};
  try {
    const r = await fetch('https://api.hyperliquid.xyz/info', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'metaAndAssetCtxs', dex: 'xyz' }) });
    const [meta, ctx] = await r.json();
    meta.universe.forEach((a, i) => {
      const n = String(a.name).replace(/^xyz:/, '');
      const c = ctx[i];
      if (tks.includes(n) && +c.prevDayPx > 0 && +c.markPx > 0) out[n] = { p: +c.markPx, prev: +c.prevDayPx, src: '24h 선물' };
    });
  } catch (e) {}
  await Promise.all(tks.filter((k) => !out[k]).map(async (k) => {
    try {
      const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(k)}?interval=1d&range=5d`, { headers: { 'user-agent': 'Mozilla/5.0' } });
      const m = (await r.json()).chart.result[0].meta;
      if (m.regularMarketPrice > 0 && m.chartPreviousClose > 0) out[k] = { p: m.regularMarketPrice, prev: m.chartPreviousClose, src: '정규장' };
    } catch (e) {}
  }));
  return out;
}

async function check(env, dry) {
  const tks = String(env.WATCH || '').split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
  const L = [num(env.L1, -10), num(env.L2, -15), num(env.L3, -20)];
  const budget = num(env.BUDGET_KRW, 500000), fx = num(env.FX, 1350), tp = num(env.TP, 30);
  const q = await quotes(tks);
  const day = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
  const sent = [];
  for (const k of tks) {
    const d = q[k];
    if (!d) continue;
    const chg = (d.p / d.prev - 1) * 100;
    const lv = chg <= L[2] ? 3 : chg <= L[1] ? 2 : chg <= L[0] ? 1 : 0;
    if (!lv) continue;
    const key = `s:${k}:${lv}:${day}`;
    if (!dry && (await env.KV.get(key))) continue;
    const amt = budget * lv, qty = Math.floor((amt / (d.p * fx)) * 100) / 100;
    const text = `[${['', '1단계 관찰', '2단계 분할매수', '3단계 적극 매수'][lv]}] ${k} ${chg.toFixed(1)}% (${d.src})\n현재가 $${d.p.toFixed(2)}\n추천 ${Math.round(amt / 10000)}만원 ≈ ${qty}주, 목표 $${(d.p * (1 + tp / 100)).toFixed(2)} (+${tp}%)\n※ 내가 정한 기준에 닿았다는 알림이며 투자 권유가 아닙니다.`;
    if (dry) { sent.push(text); continue; }
    if (await kakao(env, text)) { await env.KV.put(key, '1', { expirationTtl: 172800 }); sent.push(k); }
  }
  return { checked: Object.keys(q), alerts: sent };
}
