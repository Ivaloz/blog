/**
 * 树洞广场 · Cloudflare Worker（API only）
 *
 * 前端不由这里托管 —— 前端已经随站点一起部署（docs/public/treehole/index.html）。
 * 本 Worker 只提供 8 个 /api/* 端点，数据落在 D1。
 *
 * 接口契约与本地 server.js 完全一致，前端不需要改任何一行，
 * 只要把接口基址指到本 Worker 的 URL 即可。
 *
 * 绑定（见 wrangler.toml）：
 *   DB  — D1 数据库
 * 变量：
 *   ALLOWED_ORIGINS — CORS 白名单，逗号分隔；默认 * （部署后请收紧到站点域名）
 */

// ════════════════════════════════════════════════════════════════
// 配置
// ════════════════════════════════════════════════════════════════
const RATE_LIMIT = 10;        // 每 IP 每分钟写操作上限
const RATE_WINDOW = 60_000;
const MIN_INTERVAL = 1500;    // 同 IP 两次写操作最小间隔 (ms)
const MAX_CONTENT = 1000;
const MAX_REPLY = 500;
const MAX_NICKNAME = 20;
const MAX_BIO = 60;

const CATEGORIES = ['生活', '学习', '情感', '吐槽', '求助'];

const IDENTITIES = [
  { emoji: '🐱', name: '小猫',   a: '#6ee7b7', b: '#059669' },
  { emoji: '🦊', name: '狐狸',   a: '#a5b4fc', b: '#6366f1' },
  { emoji: '🐧', name: '企鹅',   a: '#fca5a5', b: '#dc2626' },
  { emoji: '🐻', name: '小熊',   a: '#fcd34d', b: '#d97706' },
  { emoji: '🐨', name: '考拉',   a: '#93c5fd', b: '#2563eb' },
  { emoji: '🐰', name: '兔子',   a: '#f9a8d4', b: '#db2777' },
  { emoji: '🐺', name: '小狼',   a: '#c4b5fd', b: '#7c3aed' },
  { emoji: '🐳', name: '鲸鱼',   a: '#7dd3fc', b: '#0284c7' },
  { emoji: '🦉', name: '猫头鹰', a: '#d6d3d1', b: '#78716c' },
  { emoji: '🦌', name: '小鹿',   a: '#fdba74', b: '#ea580c' },
  { emoji: '🐼', name: '熊猫',   a: '#d4d4d8', b: '#52525b' },
  { emoji: '🦔', name: '刺猬',   a: '#bef264', b: '#65a30d' },
];

const LEVELS = [
  { lv: 1, min: 0,   title: '新来的' },
  { lv: 2, min: 5,   title: '常客' },
  { lv: 3, min: 20,  title: '话多' },
  { lv: 4, min: 60,  title: '老面孔' },
  { lv: 5, min: 150, title: '树洞守护者' },
];

const DEFAULTS = {
  site_title: '树洞广场',
  site_description: '把想说的写下来。匿名、公开、不被评判。',
  plaza_mode: '1',
  allow_messages: '1',
  max_message_length: String(MAX_CONTENT),
};

// ════════════════════════════════════════════════════════════════
// 工具
// ════════════════════════════════════════════════════════════════

/** FNV-1a 32 位。只用来把 visitorId 稳定映射到小动物，不需要密码学强度 */
function hash32(str) {
  let h = 0x811c9dc5;
  const s = String(str);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** 同一 visitorId 永远得到同一只小动物 + 同一套配色 */
function deriveIdentity(visitorId) {
  return IDENTITIES[hash32(visitorId) % IDENTITIES.length];
}

/** 剥控制字符 + 裁长度。前端一律用 textContent 渲染，这里是双保险 */
function sanitize(text, max) {
  return String(text ?? '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .trim()
    .slice(0, max);
}

const isUuid = v =>
  typeof v === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);

const nowISO = () => new Date().toISOString();
/** 「今日」按 UTC 日期切分，与本地 server.js 行为一致 */
const todayKey = () => nowISO().slice(0, 10);

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...headers,
    },
  });
}

/**
 * CORS。站点与 Worker 不同源，这个头是必需的；
 * 少了它浏览器会拦掉所有请求，而前端只会显示「连不上服务」，非常容易误判。
 */
function corsHeaders(request, env) {
  const origin = request.headers.get('origin') || '';
  const allowList = String(env.ALLOWED_ORIGINS || '*')
    .split(',').map(s => s.trim()).filter(Boolean);
  const allow = allowList.includes('*') ? '*' : (allowList.includes(origin) ? origin : '');
  if (!allow) return null;
  const h = {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
  if (allow !== '*') h.Vary = 'Origin';
  return h;
}

/**
 * 限流。注意：Worker 是无状态的、会横向扩容，这份计数只活在单个 isolate 的内存里，
 * 因此它挡得住连点，挡不住分布式刷量。要严格限流需要接 Durable Objects 或 KV。
 * 对匿名留言板这个量级够用。
 */
const ipStore = new Map();
function rateCheck(ip) {
  const t = Date.now();
  if (ipStore.size > 5000) ipStore.clear();   // 防止长时间运行后无限增长
  const rec = ipStore.get(ip) ?? { count: 0, windowStart: t, lastSubmit: 0 };
  if (t - rec.lastSubmit < MIN_INTERVAL) {
    return { ok: false, error: '提交太频繁，请稍等片刻', status: 429 };
  }
  if (t - rec.windowStart > RATE_WINDOW) {
    rec.count = 0;
    rec.windowStart = t;
  }
  if (rec.count >= RATE_LIMIT) {
    return { ok: false, error: `每分钟最多 ${RATE_LIMIT} 次操作，请稍后再试`, status: 429 };
  }
  rec.count += 1;
  rec.lastSubmit = t;
  ipStore.set(ip, rec);
  return { ok: true };
}

// ════════════════════════════════════════════════════════════════
// 配置读取
// ════════════════════════════════════════════════════════════════
async function loadSettings(db) {
  const { results } = await db.prepare('SELECT key, value FROM settings').all();
  const s = { ...DEFAULTS };
  for (const row of results ?? []) s[row.key] = row.value;
  s.categories = CATEGORIES;
  return s;
}

// ════════════════════════════════════════════════════════════════
// 数据层
// ════════════════════════════════════════════════════════════════
async function ensureVisitor(db, visitorId) {
  const existing = await db
    .prepare('SELECT id, nickname, avatar_url, bio, is_blocked FROM visitors WHERE id = ?')
    .bind(visitorId).first();
  if (existing) return existing;
  await db
    .prepare('INSERT OR IGNORE INTO visitors (id, created_at, is_blocked) VALUES (?, ?, 0)')
    .bind(visitorId, nowISO()).run();
  return { id: visitorId, nickname: null, avatar_url: null, bio: null, is_blocked: 0 };
}

/**
 * 批量算等级。一次查询覆盖一批作者，避免「每个帖子查一次」的 N+1。
 * 返回 Map<visitorId, stats>；score = 发帖×3 + 收到赞×1 + 给出赞×0.5
 */
async function statsForMany(db, visitorIds) {
  const ids = [...new Set(visitorIds)].filter(isUuid);
  const out = new Map();
  if (!ids.length) return out;

  const ph = ids.map(() => '?').join(',');

  const [postsRes, givenRes] = await db.batch([
    db.prepare(
      `SELECT visitor_id, COUNT(*) AS post_count, COALESCE(SUM(like_count), 0) AS like_received
         FROM messages
        WHERE is_blocked = 0 AND visitor_id IN (${ph})
        GROUP BY visitor_id`
    ).bind(...ids),
    db.prepare(
      `SELECT visitor_id, COUNT(*) AS like_given
         FROM likes
        WHERE visitor_id IN (${ph})
        GROUP BY visitor_id`
    ).bind(...ids),
  ]);

  const posts = new Map((postsRes.results ?? []).map(r => [r.visitor_id, r]));
  const given = new Map((givenRes.results ?? []).map(r => [r.visitor_id, r.like_given]));

  for (const id of ids) {
    const p = posts.get(id) ?? { post_count: 0, like_received: 0 };
    const postCount = Number(p.post_count) || 0;
    const received = Number(p.like_received) || 0;
    const likeGiven = Number(given.get(id)) || 0;
    const score = postCount * 3 + received * 1 + likeGiven * 0.5;

    let cur = LEVELS[0];
    for (const l of LEVELS) if (score >= l.min) cur = l;
    const next = LEVELS.find(l => l.min > score);

    out.set(id, {
      postCount,
      likeReceived: received,
      likeGiven,
      score: Math.round(score),
      level: cur.lv,
      levelTitle: cur.title,
      progress: next
        ? Math.min(100, Math.round(((score - cur.min) / (next.min - cur.min)) * 100))
        : 100,
      nextAt: next ? next.min : null,
    });
  }
  return out;
}

const EMPTY_STATS = {
  postCount: 0, likeReceived: 0, likeGiven: 0, score: 0,
  level: 1, levelTitle: LEVELS[0].title, progress: 0, nextAt: LEVELS[1].min,
};

/** 帖子 → 前端 DTO（永不暴露 visitor_id 原文，保住匿名性） */
function messageDto(m, viewerId, authorRow, stats, likedByMe) {
  const idy = deriveIdentity(m.visitor_id);
  const st = stats ?? EMPTY_STATS;
  return {
    id: m.id,
    category: m.category,
    content: m.content,
    image_url: m.image_url,
    created_at: m.created_at,
    is_pinned: !!m.is_pinned,
    like_count: Number(m.like_count) || 0,
    reply_count: Number(m.reply_count) || 0,
    liked_by_me: !!likedByMe,
    mine: viewerId === m.visitor_id,
    author: {
      display_name: authorRow?.nickname
        ? sanitize(authorRow.nickname, MAX_NICKNAME)
        : `匿名${idy.name}`,
      emoji: idy.emoji,
      color_a: idy.a,
      color_b: idy.b,
      avatar_url: authorRow?.avatar_url || null,
      bio: authorRow?.bio ? sanitize(authorRow.bio, MAX_BIO) : null,
      level: st.level,
      level_title: st.levelTitle,
      progress: st.progress,
      post_count: st.postCount,
      like_received: st.likeReceived,
    },
  };
}

function replyDto(r, index, authorRow, stats) {
  const idy = deriveIdentity(r.visitor_id);
  const isAdmin = !!r.is_admin;
  return {
    id: r.id,
    floor: index + 1,
    content: r.content,
    created_at: r.created_at,
    is_admin: isAdmin,
    mine: false,
    author: {
      display_name: isAdmin
        ? (authorRow?.nickname || '洞主')
        : (authorRow?.nickname
            ? sanitize(authorRow.nickname, MAX_NICKNAME)
            : `#${index + 1} 匿名${idy.name}`),
      emoji: isAdmin ? '👑' : idy.emoji,
      color_a: idy.a,
      color_b: idy.b,
      avatar_url: authorRow?.avatar_url || null,
      level: (stats ?? EMPTY_STATS).level,
    },
  };
}

/** 一次查出这一批作者的所有资料行，键是 visitor_id */
async function loadAuthors(db, visitorIds) {
  const ids = [...new Set(visitorIds)].filter(isUuid);
  if (!ids.length) return new Map();
  const ph = ids.map(() => '?').join(',');
  const { results } = await db
    .prepare(`SELECT id, nickname, avatar_url, bio, is_blocked
                FROM visitors WHERE id IN (${ph})`)
    .bind(...ids).all();
  return new Map((results ?? []).map(r => [r.id, r]));
}

// ════════════════════════════════════════════════════════════════
// 路由
// ════════════════════════════════════════════════════════════════
async function handleApi(request, env, pathname, query) {
  const db = env.DB;
  const ip =
    request.headers.get('cf-connecting-ip') ||
    (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() ||
    'unknown';

  let body = {};
  if (request.method === 'POST') {
    try {
      body = await request.json();
    } catch (e) {
      body = {};
    }
    if (!body || typeof body !== 'object') body = {};
  }

  // ── GET /api/config ─────────────────────────────────────────
  if (pathname === '/api/config' && request.method === 'GET') {
    const s = await loadSettings(db);
    return json({
      ok: true,
      site_title: s.site_title,
      site_description: s.site_description,
      categories: CATEGORIES,
      plaza_mode: s.plaza_mode === '1',
      max_message_length: Number(s.max_message_length) || MAX_CONTENT,
      allow_messages: s.allow_messages === '1',
    });
  }

  // ── POST /api/visitor  领取/续用匿名身份 ─────────────────────
  if (pathname === '/api/visitor' && request.method === 'POST') {
    if (isUuid(body.visitorId)) {
      const v = await ensureVisitor(db, body.visitorId);
      return json({ ok: true, visitorId: v.id });
    }
    const v = await ensureVisitor(db, crypto.randomUUID());
    return json({ ok: true, visitorId: v.id });
  }

  // ── GET /api/messages  帖子流 ───────────────────────────────
  if (pathname === '/api/messages' && request.method === 'GET') {
    const viewerId = isUuid(query.viewer) ? query.viewer : null;
    const category = query.category && CATEGORIES.includes(query.category) ? query.category : null;
    const sort = query.sort === 'hot' ? 'hot' : 'new';
    const limit = Math.min(Number(query.limit) || 30, 100);

    const where = ['is_public = 1', 'is_blocked = 0', 'is_word_blocked = 0'];
    const binds = [];
    if (category) {
      where.push('category = ?');
      binds.push(category);
    }
    const whereSql = where.join(' AND ');

    // 有分区过滤时不把置顶提到最前，与本地版行为一致
    const orderSql = sort === 'hot'
      ? `${category ? '' : 'is_pinned DESC, '}(like_count * 2 + reply_count * 3) DESC, created_at DESC`
      : `${category ? '' : 'is_pinned DESC, '}created_at DESC`;

    const itemsRes = await db
      .prepare(`SELECT * FROM messages WHERE ${whereSql} ORDER BY ${orderSql} LIMIT ?`)
      .bind(...binds, limit).all();

    const totalRes = await db
      .prepare(`SELECT COUNT(*) AS n FROM messages WHERE ${whereSql}`)
      .bind(...binds).first();

    const todayRes = await db
      .prepare(`SELECT COUNT(*) AS n FROM messages
                 WHERE is_public = 1 AND is_blocked = 0 AND substr(created_at, 1, 10) = ?`)
      .bind(todayKey()).first();

    const rows = itemsRes.results ?? [];
    const authorIds = rows.map(m => m.visitor_id);

    // 一次查完「我的点赞」，避免逐条查
    let likedSet = new Set();
    if (viewerId && rows.length) {
      const ph = rows.map(() => '?').join(',');
      const { results } = await db
        .prepare(`SELECT message_id FROM likes WHERE visitor_id = ? AND message_id IN (${ph})`)
        .bind(viewerId, ...rows.map(m => m.id)).all();
      likedSet = new Set((results ?? []).map(r => r.message_id));
    }

    const [authors, stats] = await Promise.all([
      loadAuthors(db, authorIds),
      statsForMany(db, authorIds),
    ]);

    return json({
      ok: true,
      total: Number(totalRes?.n) || 0,
      today: Number(todayRes?.n) || 0,
      items: rows.map(m =>
        messageDto(m, viewerId, authors.get(m.visitor_id), stats.get(m.visitor_id), likedSet.has(m.id))
      ),
    });
  }

  // ── GET /api/messages/:id/replies ───────────────────────────
  const replyMatch = pathname.match(/^\/api\/messages\/([\w-]+)\/replies$/);
  if (replyMatch && request.method === 'GET') {
    const mid = replyMatch[1];
    const { results } = await db
      .prepare(`SELECT * FROM replies
                 WHERE message_id = ? AND is_blocked = 0
                 ORDER BY created_at ASC`)
      .bind(mid).all();
    const rows = results ?? [];
    const ids = rows.map(r => r.visitor_id);
    const [authors, stats] = await Promise.all([
      loadAuthors(db, ids),
      statsForMany(db, ids),
    ]);
    return json({
      ok: true,
      items: rows.map((r, i) => replyDto(r, i, authors.get(r.visitor_id), stats.get(r.visitor_id))),
    });
  }

  // ── POST /api/message  发帖 ─────────────────────────────────
  if (pathname === '/api/message' && request.method === 'POST') {
    if (body._hp) return json({ ok: true });   // 蜜罐：假装成功，静默丢弃

    const visitorId = body.visitorId;
    const content = sanitize(body.content, MAX_CONTENT);
    const category = CATEGORIES.includes(body.category) ? body.category : CATEGORIES[0];

    if (!isUuid(visitorId)) return json({ error: '访客身份无效' }, 400);
    if (!content) return json({ error: '内容不能为空' }, 400);

    const gate = rateCheck(ip);
    if (!gate.ok) return json({ error: gate.error }, gate.status);

    const v = await ensureVisitor(db, visitorId);
    if (v.is_blocked) return json({ error: '无法发送' }, 403);

    const s = await loadSettings(db);
    if (s.allow_messages !== '1') return json({ error: '暂时关闭了发布' }, 403);

    const { results: words } = await db.prepare('SELECT word FROM blocked_words').all();
    const lower = content.toLowerCase();
    const isWordBlocked = (words ?? []).some(w =>
      lower.includes(String(w.word).toLowerCase())
    );

    const id = crypto.randomUUID();
    const imageUrl = sanitize(body.imageUrl, 500) || null;

    await db.prepare(
      `INSERT INTO messages
         (id, visitor_id, content, image_url, category, created_at,
          is_public, is_blocked, is_word_blocked, is_pinned, like_count, reply_count)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, 0, 0, 0)`
    ).bind(id, visitorId, content, imageUrl, category, nowISO(),
           s.plaza_mode === '1' ? 1 : 0, isWordBlocked ? 1 : 0).run();

    return json({ ok: true, id });
  }

  // ── POST /api/reply  楼层回复 ───────────────────────────────
  if (pathname === '/api/reply' && request.method === 'POST') {
    if (body._hp) return json({ ok: true });

    const visitorId = body.visitorId;
    const messageId = body.messageId;
    const content = sanitize(body.content, MAX_REPLY);

    if (!isUuid(visitorId)) return json({ error: '访客身份无效' }, 400);
    if (!content) return json({ error: '回复不能为空' }, 400);

    const msg = await db
      .prepare('SELECT id, is_public, is_blocked FROM messages WHERE id = ?')
      .bind(messageId).first();
    if (!msg || !msg.is_public || msg.is_blocked) return json({ error: '帖子不存在' }, 404);

    const gate = rateCheck(ip);
    if (!gate.ok) return json({ error: gate.error }, gate.status);

    const v = await ensureVisitor(db, visitorId);
    if (v.is_blocked) return json({ error: '无法回复' }, 403);

    const id = crypto.randomUUID();
    await db.batch([
      db.prepare(
        `INSERT INTO replies (id, message_id, visitor_id, content, is_admin, is_blocked, created_at)
         VALUES (?, ?, ?, ?, 0, 0, ?)`
      ).bind(id, messageId, visitorId, content, nowISO()),
      db.prepare(
        `UPDATE messages
            SET reply_count = (SELECT COUNT(*) FROM replies WHERE message_id = ? AND is_blocked = 0)
          WHERE id = ?`
      ).bind(messageId, messageId),
    ]);

    const cnt = await db
      .prepare('SELECT reply_count FROM messages WHERE id = ?').bind(messageId).first();
    const replyCount = Number(cnt?.reply_count) || 1;

    const { results } = await db
      .prepare('SELECT * FROM replies WHERE message_id = ? AND is_blocked = 0 ORDER BY created_at ASC')
      .bind(messageId).all();
    const rows = results ?? [];

    return json({
      ok: true,
      item: replyDto({ id, message_id: messageId, visitor_id: visitorId, content, is_admin: 0, created_at: nowISO() },
                     Math.max(0, rows.length - 1), v, null),
      reply_count: replyCount,
    });
  }

  // ── POST /api/like  点赞 / 取消 ─────────────────────────────
  if (pathname === '/api/like' && request.method === 'POST') {
    const visitorId = body.visitorId;
    const messageId = body.messageId;
    if (!isUuid(visitorId)) return json({ error: '访客身份无效' }, 400);

    const msg = await db.prepare('SELECT id FROM messages WHERE id = ?').bind(messageId).first();
    if (!msg) return json({ error: '帖子不存在' }, 404);

    const existing = await db
      .prepare('SELECT 1 FROM likes WHERE message_id = ? AND visitor_id = ?')
      .bind(messageId, visitorId).first();

    let liked;
    if (existing) {
      liked = false;
      await db.batch([
        db.prepare('DELETE FROM likes WHERE message_id = ? AND visitor_id = ?')
          .bind(messageId, visitorId),
        db.prepare(
          `UPDATE messages SET like_count = (SELECT COUNT(*) FROM likes WHERE message_id = ?)
            WHERE id = ?`
        ).bind(messageId, messageId),
      ]);
    } else {
      liked = true;
      await db.batch([
        db.prepare('INSERT OR IGNORE INTO likes (message_id, visitor_id, created_at) VALUES (?, ?, ?)')
          .bind(messageId, visitorId, nowISO()),
        db.prepare(
          `UPDATE messages SET like_count = (SELECT COUNT(*) FROM likes WHERE message_id = ?)
            WHERE id = ?`
        ).bind(messageId, messageId),
      ]);
    }

    const cnt = await db
      .prepare('SELECT like_count FROM messages WHERE id = ?').bind(messageId).first();
    return json({ ok: true, liked, like_count: Number(cnt?.like_count) || 0 });
  }

  // ── POST /api/me  我的资料 ──────────────────────────────────
  if (pathname === '/api/me' && request.method === 'POST') {
    const visitorId = body.visitorId;
    if (!isUuid(visitorId)) return json({ error: '访客身份无效' }, 400);

    const v = await ensureVisitor(db, visitorId);

    const sets = [];
    const binds = [];
    if (typeof body.nickname === 'string') {
      sets.push('nickname = ?');
      binds.push(sanitize(body.nickname, MAX_NICKNAME) || null);
    }
    if (typeof body.bio === 'string') {
      sets.push('bio = ?');
      binds.push(sanitize(body.bio, MAX_BIO) || null);
    }
    if (typeof body.avatarUrl === 'string') {
      sets.push('avatar_url = ?');
      binds.push(sanitize(body.avatarUrl, 500) || null);
    }
    if (sets.length) {
      await db.prepare(`UPDATE visitors SET ${sets.join(', ')} WHERE id = ?`)
        .bind(...binds, visitorId).run();
    }

    const fresh = await db
      .prepare('SELECT nickname, avatar_url, bio FROM visitors WHERE id = ?')
      .bind(visitorId).first();
    const idy = deriveIdentity(visitorId);
    const stats = (await statsForMany(db, [visitorId])).get(visitorId) ?? EMPTY_STATS;

    return json({
      ok: true,
      me: {
        nickname: fresh?.nickname ?? null,
        bio: fresh?.bio ?? null,
        avatar_url: fresh?.avatar_url ?? null,
        emoji: idy.emoji,
        default_name: `匿名${idy.name}`,
        color_a: idy.a,
        color_b: idy.b,
        ...stats,
      },
    });
  }

  return json({ error: 'Not Found' }, 404);
}

// ════════════════════════════════════════════════════════════════
// 入口
// ════════════════════════════════════════════════════════════════
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const pathname = url.pathname.replace(/\/+$/, '') || '/';

    const cors = corsHeaders(request, env);
    if (cors === null) {
      return json({ error: 'Origin not allowed' }, 403);
    }

    // 预检
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    if (pathname === '/') {
      return json({ ok: true, service: '树洞广场 API', endpoints: [
        'GET /api/config', 'POST /api/visitor', 'GET /api/messages',
        'GET /api/messages/:id/replies', 'POST /api/message',
        'POST /api/reply', 'POST /api/like', 'POST /api/me',
      ] }, 200, cors);
    }

    if (!pathname.startsWith('/api/')) {
      return json({ error: 'Not Found' }, 404, cors);
    }

    const query = Object.fromEntries(url.searchParams.entries());

    try {
      const res = await handleApi(request, env, pathname, query);
      for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
      return res;
    } catch (err) {
      console.error('handler error:', err && err.stack || err);
      return json({ error: '服务内部错误' }, 500, cors);
    }
  },
};