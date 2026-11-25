// Cloudflare Pages Function: 쿠팡 Open API 서명 중계 (POST /api/coupang)
// 환경변수(비밀값): COUPANG_ACCESS_KEY, COUPANG_SECRET_KEY, ACCESS_CODE
const ALLOW = '/v2/providers/seller_api/apis/api/v1/marketplace/';
const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'content-type,x-access-code',
  'access-control-allow-methods': 'POST,OPTIONS',
  'content-type': 'application/json; charset=utf-8',
};
const J = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: cors });

async function sign(secret, msg) {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const b = await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(msg));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'POST') return J({ error: 'POST only' }, 405);
  if (!env.ACCESS_CODE || request.headers.get('x-access-code') !== env.ACCESS_CODE) return J({ error: 'unauthorized' }, 401);
  if (!env.COUPANG_ACCESS_KEY || !env.COUPANG_SECRET_KEY) return J({ error: 'server keys not set' }, 500);
  let req;
  try { req = await request.json(); } catch (e) { return J({ error: 'bad json' }, 400); }
  const method = String(req.method || 'GET').toUpperCase();
  const full = String(req.path || '');
  if (!['GET', 'POST', 'PUT'].includes(method) || !full.startsWith(ALLOW) || full.includes('..')) return J({ error: 'path not allowed' }, 400);
  const [path, query = ''] = full.split('?');
  const d = new Date().toISOString().slice(2, 19).replace(/[-:]/g, '') + 'Z'; // yyMMddTHHmmssZ (GMT)
  const signature = await sign(env.COUPANG_SECRET_KEY, d + method + path + query);
  const auth = `CEA algorithm=HmacSHA256, access-key=${env.COUPANG_ACCESS_KEY}, signed-date=${d}, signature=${signature}`;
  const r = await fetch('https://api-gateway.coupang.com' + full, {
    method,
    headers: { Authorization: auth, 'content-type': 'application/json;charset=UTF-8' },
    body: method === 'GET' ? undefined : JSON.stringify(req.body || {}),
  });
  return new Response(await r.text(), { status: r.status, headers: cors });
}
