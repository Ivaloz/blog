'use strict';
/**
 * 树洞广场 · 本地开发后端（零依赖，Node 原生）
 *
 * 用途：让前端在「没有 Supabase / Cloudflare 账号」时也能端到端跑通，
 *       用于真实交互验证（真发帖 / 真回复 / 真点赞 / 真换主题）。
 *
 * 接口契约严格对齐生产版，迁移时前端不改一行：
 *   本地 (本文件)                     →  生产 (Cloudflare Pages Functions + Supabase)
 *   ─────────────────────────────────────────────────────────────────────
 *   GET  /api/config                  →  functions/api/config.js
 *   POST /api/visitor                 →  js/visitor.js 直连 supabase visitors 表
 *   GET  /api/messages                →  直连 supabase messages 表（RLS anon SELECT）
 *   GET  /api/messages/:id/replies    →  直连 supabase replies 表
 *   POST /api/message                 →  functions/api/message.js
 *   POST /api/reply                   →  functions/api/reply.js    【新增】
 *   POST /api/like                    →  functions/api/like.js     【新增】
 *   POST /api/me                      →  functions/api/visitor.js
 */

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

// ════════════════════════════════════════════════════════════════
// 配置
// ════════════════════════════════════════════════════════════════
const PORT = Number(process.env.PORT) || 8788;
// 前端唯一源位于 docs/public/treehole（VitePress 会把这个目录原样拷进构建产物）
// 用 TREEHOLE_PUBLIC_DIR 可以覆盖，方便本地指向别处
const PUBLIC_DIR = process.env.TREEHOLE_PUBLIC_DIR
  ? path.resolve(process.env.TREEHOLE_PUBLIC_DIR)
  : path.join(__dirname, '..', 'docs', 'public', 'treehole');
const DATA_FILE = path.join(__dirname, 'data.json');

const RATE_LIMIT = 10;        // 每 IP 每分钟写操作上限
const RATE_WINDOW = 60_000;
const MIN_INTERVAL = 1500;    // 同 IP 两次写操作最小间隔 (ms)
const MAX_CONTENT = 1000;
const MAX_REPLY = 500;
const MAX_NICKNAME = 20;
const MAX_BIO = 60;

const CATEGORIES = ['生活', '学习', '情感', '吐槽', '求助'];

// ════════════════════════════════════════════════════════════════
// 匿名身份：由 visitorId 稳定派生（同一人永远同一只小动物 + 同一配色）
// 生产版对应 visitors 表 + avatar_url 为空时的前端派生逻辑
// ════════════════════════════════════════════════════════════════
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

function deriveIdentity(visitorId) {
  const h = crypto.createHash('sha256').update(String(visitorId)).digest();
  return IDENTITIES[h[0] % IDENTITIES.length];
}

// ════════════════════════════════════════════════════════════════
// 等级 / 徽章：纯派生，不落库（生产版同样由聚合查询实时算）
// ════════════════════════════════════════════════════════════════
const LEVELS = [
  { lv: 1, min: 0,   title: '新来的' },
  { lv: 2, min: 5,   title: '常客' },
  { lv: 3, min: 20,  title: '话多' },
  { lv: 4, min: 60,  title: '老面孔' },
  { lv: 5, min: 150, title: '树洞守护者' },
];

function statsFor(visitorId, database) {
  const posts = database.messages.filter(m => m.visitor_id === visitorId && !m.is_blocked);
  const received = posts.reduce((s, m) => s + m.like_count, 0);
  const given = database.likes.filter(l => l.visitor_id === visitorId).length;
  const score = posts.length * 3 + received * 1 + given * 0.5;
  let cur = LEVELS[0];
  for (const l of LEVELS) if (score >= l.min) cur = l;
  const next = LEVELS.find(l => l.min > score);
  return {
    postCount: posts.length,
    likeReceived: received,
    likeGiven: given,
    score: Math.round(score),
    level: cur.lv,
    levelTitle: cur.title,
    progress: next ? Math.min(100, Math.round(((score - cur.min) / (next.min - cur.min)) * 100)) : 100,
    nextAt: next ? next.min : null,
  };
}

// ════════════════════════════════════════════════════════════════
// 数据层（内存 + data.json 持久化）
// 生产版对应：Supabase 表 visitors / messages / replies / likes / settings
// ════════════════════════════════════════════════════════════════
const DEFAULT_SETTINGS = {
  site_title: '树洞广场',
  site_description: '把想说的写下来。匿名、公开、不被评判。',
  allow_messages: true,
  max_message_length: MAX_CONTENT,
  daily_limit: 0,
  plaza_mode: true,          // 【关键改造】所发即公开（Mssk_Talk 默认是「管理员精选公开」）
  categories: CATEGORIES,
};

let db = {
  settings: { ...DEFAULT_SETTINGS },
  visitors: [],
  messages: [],
  replies: [],
  likes: [],
  blocked_words: [],
};

function loadDb() {
  if (!fs.existsSync(DATA_FILE)) return;
  try {
    const raw = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    db = { ...db, ...raw, settings: { ...DEFAULT_SETTINGS, ...(raw.settings || {}) } };
  } catch (e) {
    console.error('[store] data.json 解析失败，从空库开始:', e.message);
  }
}

let saveTimer = null;
function saveDb() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2), 'utf8');
    } catch (e) {
      console.error('[store] 写入失败:', e.message);
    }
  }, 120);
}

const uid = () => crypto.randomUUID();
const now = () => new Date().toISOString();

// ════════════════════════════════════════════════════════════════
// 工具
// ════════════════════════════════════════════════════════════════
const isUuid = v =>
  typeof v === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);

function json(res, data, status = 200) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

/** 剥控制字符 + 裁长度。前端一律用 textContent / esc() 渲染，双保险 */
function sanitize(text, max) {
  return String(text)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .trim()
    .slice(0, max);
}

// ── IP 限流（生产版在 CF Functions 内存中同样实现）──────────────
const ipStore = new Map();
function rateCheck(ip) {
  const t = Date.now();
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
// 业务
// ════════════════════════════════════════════════════════════════
function ensureVisitor(visitorId) {
  let v = db.visitors.find(x => x.id === visitorId);
  if (!v) {
    v = {
      id: visitorId,
      created_at: now(),
      is_blocked: false,
      nickname: null,
      avatar_url: null,
      bio: null,
    };
    db.visitors.push(v);
    saveDb();
  }
  return v;
}

/** 帖子 → 前端 DTO（永不暴露 visitor_id 原文，保住匿名性） */
function messageDto(m, viewerId) {
  const author = ensureVisitor(m.visitor_id);
  const idy = deriveIdentity(m.visitor_id);
  const st = statsFor(m.visitor_id, db);

  return {
    id: m.id,
    category: m.category,
    content: m.content,
    image_url: m.image_url,
    created_at: m.created_at,
    is_pinned: !!m.is_pinned,

    like_count: m.like_count,
    reply_count: m.reply_count,
    liked_by_me: viewerId ? db.likes.some(l => l.message_id === m.id && l.visitor_id === viewerId) : false,
    mine: viewerId === m.visitor_id,

    author: {
      display_name: author.nickname ? sanitize(author.nickname, MAX_NICKNAME) : `匿名${idy.name}`,
      emoji: idy.emoji,
      color_a: idy.a,
      color_b: idy.b,
      avatar_url: author.avatar_url || null,
      bio: author.bio ? sanitize(author.bio, MAX_BIO) : null,
      level: st.level,
      level_title: st.levelTitle,
      progress: st.progress,
      post_count: st.postCount,
      like_received: st.likeReceived,
    },
  };
}

function replyDto(r, index) {
  const v = ensureVisitor(r.visitor_id);
  const idy = deriveIdentity(r.visitor_id);
  return {
    id: r.id,
    floor: index + 1,
    content: r.content,
    created_at: r.created_at,
    is_admin: !!r.is_admin,
    author: {
      display_name: r.is_admin
        ? (v.nickname || '洞主')
        : (v.nickname ? sanitize(v.nickname, MAX_NICKNAME) : `#${index + 1} 匿名${idy.name}`),
      emoji: r.is_admin ? '👑' : idy.emoji,
      color_a: idy.a,
      color_b: idy.b,
      avatar_url: v.avatar_url || null,
      level: statsFor(r.visitor_id, db).level,
    },
  };
}

// ════════════════════════════════════════════════════════════════
// 路由
// ════════════════════════════════════════════════════════════════
async function handleApi(req, res, pathname, query) {
  const ip =
    req.headers['cf-connecting-ip'] ||
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.socket.remoteAddress ||
    'unknown';

  const body = await readJson(req);

  // ── GET /api/config ───────────────────────────────────────────
  if (pathname === '/api/config' && req.method === 'GET') {
    return json(res, {
      ok: true,
      site_title: db.settings.site_title,
      site_description: db.settings.site_description,
      categories: db.settings.categories,
      plaza_mode: db.settings.plaza_mode,
      max_message_length: db.settings.max_message_length,
      allow_messages: db.settings.allow_messages,
    });
  }

  // ── POST /api/visitor  创建匿名身份 ───────────────────────────
  if (pathname === '/api/visitor' && req.method === 'POST') {
    const existing = isUuid(body.visitorId) ? db.visitors.find(v => v.id === body.visitorId) : null;
    if (existing) return json(res, { ok: true, visitorId: existing.id });
    return json(res, { ok: true, visitorId: ensureVisitor(uid()).id });
  }

  // ── GET /api/messages  帖子流 ─────────────────────────────────
  if (pathname === '/api/messages' && req.method === 'GET') {
    const viewerId = isUuid(query.viewer) ? query.viewer : null;
    const category = query.category && CATEGORIES.includes(query.category) ? query.category : null;
    const sort = query.sort === 'hot' ? 'hot' : 'new';
    const limit = Math.min(Number(query.limit) || 30, 100);

    let list = db.messages.filter(m => m.is_public && !m.is_blocked && !m.is_word_blocked);
    if (category) list = list.filter(m => m.category === category);

    list.sort((a, b) =>
      sort === 'hot'
        ? (b.like_count * 2 + b.reply_count * 3) - (a.like_count * 2 + a.reply_count * 3) ||
          new Date(b.created_at) - new Date(a.created_at)
        : new Date(b.created_at) - new Date(a.created_at)
    );

    const pinned = !category ? list.filter(m => m.is_pinned) : [];
    const rest = list.filter(m => !m.is_pinned);
    const page = pinned.concat(rest).slice(0, limit);

    return json(res, {
      ok: true,
      total: list.length,
      today: db.messages.filter(
        m => m.is_public && m.created_at.slice(0, 10) === now().slice(0, 10)
      ).length,
      items: page.map(m => messageDto(m, viewerId)),
    });
  }

  // ── GET /api/messages/:id/replies ─────────────────────────────
  const replyMatch = pathname.match(/^\/api\/messages\/([\w-]+)\/replies$/);
  if (replyMatch && req.method === 'GET') {
    const mid = replyMatch[1];
    const list = db.replies
      .filter(r => r.message_id === mid && !r.is_blocked)
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    return json(res, { ok: true, items: list.map((r, i) => replyDto(r, i)) });
  }

  // ── POST /api/message  发帖 ───────────────────────────────────
  if (pathname === '/api/message' && req.method === 'POST') {
    if (body._hp) return json(res, { ok: true });          // 蜜罐：假装成功，静默丢弃

    const { visitorId } = body;
    const content = sanitize(body.content ?? '', MAX_CONTENT);
    const category = CATEGORIES.includes(body.category) ? body.category : CATEGORIES[0];

    if (!isUuid(visitorId)) return json(res, { error: '访客身份无效' }, 400);
    if (!content) return json(res, { error: '内容不能为空' }, 400);

    const gate = rateCheck(ip);
    if (!gate.ok) return json(res, { error: gate.error }, gate.status);

    const v = ensureVisitor(visitorId);
    if (v.is_blocked) return json(res, { error: '无法发送' }, 403);
    if (!db.settings.allow_messages) return json(res, { error: '暂时关闭了发布' }, 403);

    const isWordBlocked = db.blocked_words.some(w =>
      content.toLowerCase().includes(w.word.toLowerCase())
    );

    const msg = {
      id: uid(),
      visitor_id: visitorId,
      content,
      image_url: sanitize(body.imageUrl ?? '', 500) || null,
      category,
      created_at: now(),
      is_public: !!db.settings.plaza_mode,   // 【关键改造】广场模式所发即公开
      is_blocked: false,
      is_word_blocked: isWordBlocked,
      is_pinned: false,
      like_count: 0,
      reply_count: 0,
    };
    db.messages.push(msg);
    saveDb();

    return json(res, { ok: true, id: msg.id });
  }

  // ── POST /api/reply  楼层回复 ─────────────────────────────────
  if (pathname === '/api/reply' && req.method === 'POST') {
    if (body._hp) return json(res, { ok: true });

    const { visitorId, messageId } = body;
    const content = sanitize(body.content ?? '', MAX_REPLY);

    if (!isUuid(visitorId)) return json(res, { error: '访客身份无效' }, 400);
    if (!content) return json(res, { error: '回复不能为空' }, 400);

    const msg = db.messages.find(m => m.id === messageId);
    if (!msg || !msg.is_public || msg.is_blocked) return json(res, { error: '帖子不存在' }, 404);

    const gate = rateCheck(ip);
    if (!gate.ok) return json(res, { error: gate.error }, gate.status);

    const v = ensureVisitor(visitorId);
    if (v.is_blocked) return json(res, { error: '无法回复' }, 403);

    const reply = {
      id: uid(),
      message_id: messageId,
      visitor_id: visitorId,
      content,
      is_admin: false,
      is_blocked: false,
      created_at: now(),
    };
    db.replies.push(reply);
    msg.reply_count = db.replies.filter(r => r.message_id === messageId && !r.is_blocked).length;
    saveDb();

    const idx = msg.reply_count - 1;
    return json(res, { ok: true, item: replyDto(reply, idx), reply_count: msg.reply_count });
  }

  // ── POST /api/like  点赞 / 取消 ───────────────────────────────
  if (pathname === '/api/like' && req.method === 'POST') {
    const { visitorId, messageId } = body;
    if (!isUuid(visitorId)) return json(res, { error: '访客身份无效' }, 400);

    const msg = db.messages.find(m => m.id === messageId);
    if (!msg) return json(res, { error: '帖子不存在' }, 404);

    const existing = db.likes.find(l => l.message_id === messageId && l.visitor_id === visitorId);
    let liked;
    if (existing) {
      db.likes = db.likes.filter(l => l !== existing);
      liked = false;
    } else {
      db.likes.push({ id: uid(), message_id: messageId, visitor_id: visitorId, created_at: now() });
      liked = true;
    }
    msg.like_count = db.likes.filter(l => l.message_id === messageId).length;
    saveDb();

    return json(res, { ok: true, liked, like_count: msg.like_count });
  }

  // ── POST /api/me  我的资料 ────────────────────────────────────
  if (pathname === '/api/me' && req.method === 'POST') {
    const { visitorId } = body;
    if (!isUuid(visitorId)) return json(res, { error: '访客身份无效' }, 400);

    const v = ensureVisitor(visitorId);
    if (typeof body.nickname === 'string') v.nickname = sanitize(body.nickname, MAX_NICKNAME) || null;
    if (typeof body.bio === 'string') v.bio = sanitize(body.bio, MAX_BIO) || null;
    if (typeof body.avatarUrl === 'string') v.avatar_url = sanitize(body.avatarUrl, 500) || null;
    saveDb();

    const idy = deriveIdentity(visitorId);
    return json(res, {
      ok: true,
      me: {
        nickname: v.nickname,
        bio: v.bio,
        avatar_url: v.avatar_url,
        emoji: idy.emoji,
        default_name: `匿名${idy.name}`,
        color_a: idy.a,
        color_b: idy.b,
        ...statsFor(visitorId, db),
      },
    });
  }

  return json(res, { error: 'Not Found' }, 404);
}

// ════════════════════════════════════════════════════════════════
// 静态文件 / 请求解析
// ════════════════════════════════════════════════════════════════
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

// ── CORS：站点与后端不同源时必需。默认 * (匿名公开留言板,无 cookie 凭据) ──
// 生产可用环境变量 TREEHOLE_ALLOWED_ORIGINS 收紧,逗号分隔白名单。
const ALLOWED_ORIGINS = (process.env.TREEHOLE_ALLOWED_ORIGINS || "*")
  .split(",").map(s => s.trim()).filter(Boolean);

function applyCors(req, res) {
  const origin = req.headers.origin || "";
  if (!origin) return true;
  const allow = ALLOWED_ORIGINS.includes("*") ? "*"
    : (ALLOWED_ORIGINS.includes(origin) ? origin : "");
  if (!allow) return false;
  res.setHeader("Access-Control-Allow-Origin", allow);
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Max-Age", "86400");
  if (allow !== "*") res.setHeader("Vary", "Origin");
  return true;
}
function serveStatic(res, pathname) {
  const rel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const target = path.join(PUBLIC_DIR, rel);
  if (!target.startsWith(PUBLIC_DIR)) return json(res, { error: 'Forbidden' }, 403);
  if (!fs.existsSync(target) || fs.statSync(target).isDirectory()) {
    return json(res, { error: 'Not Found' }, 404);
  }
  res.writeHead(200, {
    'Content-Type': MIME[path.extname(target).toLowerCase()] || 'application/octet-stream',
    'Cache-Control': 'no-store',
  });
  fs.createReadStream(target).pipe(res);
}

function readJson(req) {
  return new Promise(resolve => {
    if (req.method !== 'POST') return resolve({});
    let raw = '';
    req.on('data', c => {
      raw += c;
      if (raw.length > 1e6) req.destroy();
    });
    req.on('end', () => {
      try { resolve(JSON.parse(raw || '{}')); } catch { resolve({}); }
    });
    req.on('error', () => resolve({}));
  });
}

// ════════════════════════════════════════════════════════════════
// 启动
// ════════════════════════════════════════════════════════════════
loadDb();

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    const corsOk = applyCors(req, res);
    if (req.method === 'OPTIONS') {
      res.writeHead(corsOk ? 204 : 403);
      return res.end();
    }
    if (url.pathname.startsWith('/api/')) {
      await handleApi(req, res, url.pathname, Object.fromEntries(url.searchParams));
    } else {
      serveStatic(res, url.pathname);
    }
  } catch (e) {
    console.error('[error]', e);
    json(res, { error: '服务异常' }, 500);
  }
});

server.listen(PORT, () => {
  const posts = db.messages.filter(m => m.is_public).length;
  console.log('');
  console.log('  🕳️  树洞广场 · 本地后端已启动');
  console.log(`      → http://localhost:${PORT}`);
  console.log(`      帖子 ${posts} 条 · 回复 ${db.replies.length} 条 · 赞 ${db.likes.length} 个`);
  console.log('');
});