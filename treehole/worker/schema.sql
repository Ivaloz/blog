-- ============================================================
-- 树洞广场 · D1 表结构
--
-- 应用方式（本地）：
--   npx wrangler d1 execute treehole --local  --file=schema.sql
-- 应用方式（线上）：
--   npx wrangler d1 execute treehole --remote --file=schema.sql
--
-- 说明：
--   · 时间统一存 ISO 8601 字符串（UTC），与前端的字符串比较/排序保持一致
--   · 布尔用 INTEGER 0/1（SQLite 无原生布尔）
--   · like_count / reply_count 是冗余计数，随写入同步更新，避免每次 COUNT 全表
-- ============================================================

-- ── 访客 ──────────────────────────────────────────────────
-- 无密码门：visitorId 是浏览器首次访问时生成的随机 UUID，服务端只存 id
-- 昵称/头像/简介都由访客自己填，留空则用 visitorId 派生的小动物身份
CREATE TABLE IF NOT EXISTS visitors (
  id          TEXT PRIMARY KEY,
  created_at  TEXT    NOT NULL,
  is_blocked  INTEGER NOT NULL DEFAULT 0,
  nickname    TEXT,
  avatar_url  TEXT,
  bio         TEXT
);

-- ── 帖子 ──────────────────────────────────────────────────
-- plaza_mode = 所发即公开，因此 is_public 默认 1
CREATE TABLE IF NOT EXISTS messages (
  id              TEXT    PRIMARY KEY,
  visitor_id      TEXT    NOT NULL,
  content         TEXT    NOT NULL,
  image_url       TEXT,
  category        TEXT    NOT NULL,
  created_at      TEXT    NOT NULL,
  is_public       INTEGER NOT NULL DEFAULT 1,
  is_blocked      INTEGER NOT NULL DEFAULT 0,
  is_word_blocked INTEGER NOT NULL DEFAULT 0,
  is_pinned       INTEGER NOT NULL DEFAULT 0,
  like_count      INTEGER NOT NULL DEFAULT 0,
  reply_count     INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_messages_created ON messages (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_cat     ON messages (category, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_author  ON messages (visitor_id);

-- ── 回复 ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS replies (
  id          TEXT    PRIMARY KEY,
  message_id  TEXT    NOT NULL,
  visitor_id  TEXT    NOT NULL,
  content     TEXT    NOT NULL,
  is_admin    INTEGER NOT NULL DEFAULT 0,
  is_blocked  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_replies_msg    ON replies (message_id, created_at);
CREATE INDEX IF NOT EXISTS idx_replies_author ON replies (visitor_id);

-- ── 点赞 ──────────────────────────────────────────────────
-- 复合主键天然保证「同一人对同一条只算一次」，点赞/取消都是一条语句
CREATE TABLE IF NOT EXISTS likes (
  message_id  TEXT NOT NULL,
  visitor_id  TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  PRIMARY KEY (message_id, visitor_id)
);

CREATE INDEX IF NOT EXISTS idx_likes_visitor ON likes (visitor_id);

-- ── 站点配置（键值对，可在后台直接改）────────────────────
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT INTO settings (key, value) VALUES
  ('site_title',         '树洞广场'),
  ('site_description',   '把想说的写下来。匿名、公开、不被评判。'),
  ('plaza_mode',         '1'),
  ('allow_messages',     '1'),
  ('max_message_length', '1000')
ON CONFLICT (key) DO NOTHING;

-- ── 屏蔽词 ────────────────────────────────────────────────
-- 命中后帖子仍会写入，但标记 is_word_blocked 并在列表里隐藏
CREATE TABLE IF NOT EXISTS blocked_words (
  word TEXT PRIMARY KEY
);