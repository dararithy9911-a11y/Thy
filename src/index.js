// Signal Trading – Cloudflare Worker
// Serves the JSON API under /api/* and the static site from ./public.

const STATUSES = ['pending', 'active', 'tp_hit', 'sl_hit', 'closed', 'cancelled'];
const DIRECTIONS = ['BUY', 'SELL'];
const SESSION_COOKIE = 'session';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      try {
        return await handleApi(request, env, url);
      } catch (err) {
        if (err instanceof HttpError) return json({ error: err.message }, err.status);
        console.error(err);
        return json({ error: 'Internal server error' }, 500);
      }
    }
    return env.ASSETS.fetch(request);
  },
};

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function handleApi(request, env, url) {
  const { pathname } = url;
  const method = request.method;

  if (pathname === '/api/signals' && method === 'GET') return listSignals(env, url);
  if (pathname === '/api/stats' && method === 'GET') return getStats(env);
  if (pathname === '/api/login' && method === 'POST') return login(request, env);
  if (pathname === '/api/logout' && method === 'POST') return logout();
  if (pathname === '/api/me' && method === 'GET') {
    return json({ admin: await isAdmin(request, env) });
  }

  if (pathname === '/api/signals' && method === 'POST') {
    await requireAdmin(request, env);
    return createSignal(request, env);
  }

  const match = pathname.match(/^\/api\/signals\/(\d+)$/);
  if (match) {
    const id = Number(match[1]);
    if (method === 'GET') return getSignal(env, id);
    if (method === 'PUT') {
      await requireAdmin(request, env);
      return updateSignal(request, env, id);
    }
    if (method === 'DELETE') {
      await requireAdmin(request, env);
      return deleteSignal(env, id);
    }
  }

  throw new HttpError(404, 'Not found');
}

// ---------- Signals ----------

async function listSignals(env, url) {
  const status = url.searchParams.get('status');
  const pair = url.searchParams.get('pair');
  const limit = clampInt(url.searchParams.get('limit'), 1, 200, 50);
  const offset = clampInt(url.searchParams.get('offset'), 0, 1_000_000, 0);

  const where = [];
  const params = [];
  if (status) {
    if (!STATUSES.includes(status)) throw new HttpError(400, 'Invalid status');
    where.push('status = ?');
    params.push(status);
  }
  if (pair) {
    where.push('pair = ?');
    params.push(pair.toUpperCase());
  }

  const sql =
    'SELECT * FROM signals' +
    (where.length ? ' WHERE ' + where.join(' AND ') : '') +
    ' ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?';
  const { results } = await env.DB.prepare(sql).bind(...params, limit, offset).all();
  return json({ signals: results });
}

async function getSignal(env, id) {
  const row = await env.DB.prepare('SELECT * FROM signals WHERE id = ?').bind(id).first();
  if (!row) throw new HttpError(404, 'Signal not found');
  return json({ signal: row });
}

async function createSignal(request, env) {
  const data = validateSignal(await readJson(request), false);
  const row = await env.DB.prepare(
    `INSERT INTO signals
       (pair, direction, entry, stop_loss, take_profit_1, take_profit_2, take_profit_3, status, result_pips, note)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     RETURNING *`
  )
    .bind(
      data.pair,
      data.direction,
      data.entry,
      data.stop_loss,
      data.take_profit_1,
      data.take_profit_2 ?? null,
      data.take_profit_3 ?? null,
      data.status ?? 'active',
      data.result_pips ?? null,
      data.note ?? null
    )
    .first();
  return json({ signal: row }, 201);
}

async function updateSignal(request, env, id) {
  const data = validateSignal(await readJson(request), true);
  const fields = Object.keys(data);
  if (!fields.length) throw new HttpError(400, 'Nothing to update');

  const sets = fields.map((f) => `${f} = ?`);
  sets.push("updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')");
  const row = await env.DB.prepare(`UPDATE signals SET ${sets.join(', ')} WHERE id = ? RETURNING *`)
    .bind(...fields.map((f) => data[f]), id)
    .first();
  if (!row) throw new HttpError(404, 'Signal not found');
  return json({ signal: row });
}

async function deleteSignal(env, id) {
  const res = await env.DB.prepare('DELETE FROM signals WHERE id = ?').bind(id).run();
  if (!res.meta.changes) throw new HttpError(404, 'Signal not found');
  return json({ ok: true });
}

async function getStats(env) {
  const row = await env.DB.prepare(
    `SELECT
       COUNT(*)                                              AS total,
       SUM(CASE WHEN status IN ('pending','active') THEN 1 ELSE 0 END) AS open,
       SUM(CASE WHEN status = 'tp_hit' THEN 1 ELSE 0 END)    AS wins,
       SUM(CASE WHEN status = 'sl_hit' THEN 1 ELSE 0 END)    AS losses,
       COALESCE(SUM(result_pips), 0)                         AS total_pips
     FROM signals`
  ).first();
  const decided = (row.wins || 0) + (row.losses || 0);
  return json({
    total: row.total || 0,
    open: row.open || 0,
    wins: row.wins || 0,
    losses: row.losses || 0,
    total_pips: Math.round((row.total_pips || 0) * 10) / 10,
    win_rate: decided ? Math.round(((row.wins || 0) / decided) * 1000) / 10 : null,
  });
}

// Whitelisted fields only – column names are never taken from user input.
function validateSignal(body, partial) {
  if (!body || typeof body !== 'object') throw new HttpError(400, 'Invalid JSON body');
  const out = {};
  const has = (k) => body[k] !== undefined;

  if (has('pair') || !partial) {
    const pair = String(body.pair ?? '').trim().toUpperCase();
    if (!/^[A-Z0-9./_-]{2,20}$/.test(pair)) throw new HttpError(400, 'Invalid pair (e.g. XAUUSD, EURUSD, BTCUSDT)');
    out.pair = pair;
  }
  if (has('direction') || !partial) {
    const dir = String(body.direction ?? '').toUpperCase();
    if (!DIRECTIONS.includes(dir)) throw new HttpError(400, 'Direction must be BUY or SELL');
    out.direction = dir;
  }
  for (const k of ['entry', 'stop_loss', 'take_profit_1']) {
    if (has(k) || !partial) out[k] = requireNumber(body[k], k);
  }
  for (const k of ['take_profit_2', 'take_profit_3', 'result_pips']) {
    if (has(k)) out[k] = optionalNumber(body[k], k);
  }
  if (has('status')) {
    if (!STATUSES.includes(body.status)) throw new HttpError(400, 'Invalid status');
    out.status = body.status;
  }
  if (has('note')) {
    const note = body.note === null ? '' : String(body.note).trim();
    if (note.length > 1000) throw new HttpError(400, 'Note too long (max 1000 chars)');
    out.note = note || null;
  }
  return out;
}

function requireNumber(v, name) {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isFinite(n)) throw new HttpError(400, `${name} must be a number`);
  return n;
}

function optionalNumber(v, name) {
  if (v === null || v === '') return null;
  return requireNumber(v, name);
}

// ---------- Auth ----------

async function login(request, env) {
  if (!env.ADMIN_PASSWORD || !env.SESSION_SECRET) {
    throw new HttpError(500, 'ADMIN_PASSWORD and SESSION_SECRET must be configured');
  }
  const body = await readJson(request);
  const ok = await timingSafeEqual(String(body?.password ?? ''), env.ADMIN_PASSWORD, env.SESSION_SECRET);
  if (!ok) throw new HttpError(401, 'Wrong password');

  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const token = `${exp}.${await hmac(String(exp), env.SESSION_SECRET)}`;
  return json({ ok: true }, 200, {
    'Set-Cookie': `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_TTL_SECONDS}`,
  });
}

function logout() {
  return json({ ok: true }, 200, {
    'Set-Cookie': `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`,
  });
}

async function isAdmin(request, env) {
  if (!env.SESSION_SECRET) return false;
  const token = getCookie(request, SESSION_COOKIE);
  if (!token) return false;
  const [exp, sig] = token.split('.');
  if (!exp || !sig || Number(exp) < Date.now() / 1000) return false;
  return timingSafeEqual(sig, await hmac(exp, env.SESSION_SECRET), env.SESSION_SECRET);
}

async function requireAdmin(request, env) {
  if (!(await isAdmin(request, env))) throw new HttpError(401, 'Login required');
}

async function hmac(message, secret) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

// Compare HMACs of both values so length/content differences don't leak timing.
async function timingSafeEqual(a, b, secret) {
  const [ha, hb] = await Promise.all([hmac(a, secret), hmac(b, secret)]);
  let diff = ha.length ^ hb.length;
  for (let i = 0; i < Math.min(ha.length, hb.length); i++) diff |= ha.charCodeAt(i) ^ hb.charCodeAt(i);
  return diff === 0;
}

function getCookie(request, name) {
  const header = request.headers.get('Cookie') || '';
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=');
  }
  return null;
}

// ---------- Helpers ----------

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    throw new HttpError(400, 'Invalid JSON body');
  }
}

function clampInt(value, min, max, fallback) {
  const n = parseInt(value ?? '', 10);
  if (Number.isNaN(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
  });
}
