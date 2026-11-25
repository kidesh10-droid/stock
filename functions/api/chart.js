// Cloudflare Pages Function: 야후 파이낸스 시세 중계 (/api/chart?s=TQQQ&range=1d&interval=5m)
const OK_RANGE = /^(1d|5d|1mo|3mo|6mo|1y)$/;
const OK_INT = /^(1m|2m|5m|15m|30m|60m|1d)$/;
export async function onRequest({ request }) {
  const u = new URL(request.url);
  const s = u.searchParams.get('s') || '';
  const range = u.searchParams.get('range') || '1d';
  const interval = u.searchParams.get('interval') || '5m';
  const cors = { 'access-control-allow-origin': '*', 'content-type': 'application/json; charset=utf-8' };
  if (!/^[A-Za-z0-9.\-=^]{1,15}$/.test(s) || !OK_RANGE.test(range) || !OK_INT.test(interval)) {
    return new Response('{"error":"bad request"}', { status: 400, headers: cors });
  }
  const path = `/v8/finance/chart/${encodeURIComponent(s)}?interval=${interval}&range=${range}`;
  for (const host of ['query1.finance.yahoo.com', 'query2.finance.yahoo.com']) {
    try {
      const r = await fetch('https://' + host + path, {
        headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36', accept: 'application/json' },
        cf: { cacheTtl: 20, cacheEverything: true },
      });
      if (r.ok) {
        return new Response(await r.text(), { status: 200, headers: { ...cors, 'cache-control': 'public, max-age=20' } });
      }
    } catch (e) {}
  }
  return new Response('{"error":"upstream failed"}', { status: 502, headers: cors });
}
