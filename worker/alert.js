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

// 일봉 기록(야후)으로 지표 계산: RSI(14), 20일 평균, 20일 저점, 고점 대비 낙폭
async function hist(k) {
  try {
    const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(k)}?interval=1d&range=6mo`, { headers: { 'user-agent': 'Mozilla/5.0' } });
    const c = (await r.json()).chart.result[0].indicators.quote[0];
    const cl = c.close.filter((x) => x > 0), lo = c.low.filter((x) => x > 0), hi = c.high.filter((x) => x > 0);
    if (cl.length < 30) return null;
    let g = 0, l = 0;
    for (let i = cl.length - 14; i < cl.length; i++) { const d = cl[i] - cl[i - 1]; if (d > 0) g += d; else l -= d; }
    const rsi = l === 0 ? 100 : 100 - 100 / (1 + g / l);
    const ma20 = cl.slice(-20).reduce((a, b) => a + b, 0) / 20;
    return { rsi, ma20, low20: Math.min(...lo.slice(-20)), high: Math.max(...hi), last: cl[cl.length - 1] };
  } catch (e) { return null; }
}

function parseHold(v) {
  const m = {};
  String(v || '').split(',').forEach((x) => { const [k, q, a] = x.split(':'); if (k && +q > 0 && +a > 0) m[k.trim().toUpperCase()] = { qty: +q, avg: +a }; });
  return m;
}

async function check(env, dry) {
  const hold = parseHold(env.HOLD);
  const list = (s) => String(s || '').split(',').map((x) => x.trim().toUpperCase()).filter(Boolean);
  const own = Object.keys(hold), fresh = list(env.NEW).filter((k) => !hold[k]);
  const tks = [...new Set([...list(env.WATCH), ...own, ...fresh])];
  const L = [num(env.L1, -10), num(env.L2, -15), num(env.L3, -20)];
  const budget = num(env.BUDGET_KRW, 500000), fx = num(env.FX, 1350), tp = num(env.TP, 30), sepAt = num(env.SEP, -30);
  const q = await quotes(tks);
  const H = Object.fromEntries(await Promise.all(Object.keys(q).map(async (k) => [k, await hist(k)])));
  const day = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
  const out = [], keys = [];
  for (const k of Object.keys(q)) {
    const d = q[k], h = H[k], chg = (d.p / d.prev - 1) * 100;
    const lv = chg <= L[2] ? 3 : chg <= L[1] ? 2 : chg <= L[0] ? 1 : 0;
    const oversold = h && h.rsi <= 30;
    if (!lv && !oversold) continue;
    const key = `s:${k}:${lv}:${oversold ? 'r' : ''}:${day}`;
    if (!dry && (await env.KV.get(key))) continue;
    const amt = budget * Math.max(lv, 1), usd = amt / fx;
    // 2분할: 지금 가까운 가격 + 더 내려올 때(20일 저점 또는 -7% 중 낮은 쪽)
    const p1 = d.p * 0.99, p2 = Math.max(h ? Math.min(h.low20, d.p * 0.93) : d.p * 0.93, d.p * 0.8);
    const q1 = Math.floor((usd / 2 / p1) * 100) / 100, q2 = Math.floor((usd / 2 / p2) * 100) / 100;
    const own1 = hold[k];
    let t = `■ ${k}${own1 ? ' (보유)' : ' (신규 후보)'} $${d.p.toFixed(2)} ${chg.toFixed(1)}% [${d.src}]\n`;
    if (h) t += `RSI ${h.rsi.toFixed(0)}${oversold ? '(과매도)' : ''} · 20일선 대비 ${((d.p / h.ma20 - 1) * 100).toFixed(0)}% · 고점 대비 ${((d.p / h.high - 1) * 100).toFixed(0)}%\n`;
    t += `매수안(총 ${Math.round(amt / 10000)}만원): ① $${p1.toFixed(2)} ${q1}주 ② $${p2.toFixed(2)} ${q2}주\n목표 $${(d.p * (1 + tp / 100)).toFixed(2)}(+${tp}%)`;
    if (own1) {
      const pl = (d.p / own1.avg - 1) * 100, nq = own1.qty + q1 + q2, na = (own1.qty * own1.avg + q1 * p1 + q2 * p2) / nq;
      t += `\n내 평단 $${own1.avg.toFixed(2)}(${pl.toFixed(0)}%) → 매수 후 $${na.toFixed(2)}`;
      if (pl <= sepAt) t += `\n평단 대비 ${pl.toFixed(0)}%라 물타기보다 새 자금으로 따로 매수(단타)가 낫습니다.`;
    }
    out.push(t); keys.push(key);
  }
  keys.splice(3); out.splice(3); // 카톡 글자 수 제한 때문에 한 번에 최대 3종목
  const res = { checked: Object.keys(q), alerts: out.length };
  if (!out.length) return res;
  const text = out.join('\n\n') + '\n\n※ 규칙 기반 계산(RSI·이동평균·저점)이며 예측이나 투자 권유가 아닙니다.';
  if (dry) return { ...res, preview: text };
  if (await kakao(env, text)) for (const k of keys) await env.KV.put(k, '1', { expirationTtl: 172800 });
  return res;
}
