-- Initial schema (ARCHITECTURE section 4). Paths are relative to the library root,
-- forward slashes. Timestamps are ISO 8601 UTC strings.

CREATE TABLE products (
  id TEXT PRIMARY KEY,
  full_name TEXT NOT NULL,
  short_name TEXT,
  slug TEXT NOT NULL UNIQUE,
  image_path TEXT,
  last_used_at TEXT,
  archived_at TEXT,                -- set = hidden from pickers, videos and history kept
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE media (               -- every normalized file (ugc clips and b-roll)
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('ugc','broll','image')),
  product_id TEXT REFERENCES products(id) ON DELETE CASCADE, -- set for broll
  path TEXT NOT NULL,              -- relative
  thumb_path TEXT,
  filmstrip_path TEXT,
  original_name TEXT,
  duration REAL NOT NULL,
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  recorded_at TEXT,                -- from metadata, nullable
  was_hdr INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE captions (
  id TEXT PRIMARY KEY,
  text TEXT NOT NULL,
  slot TEXT NOT NULL CHECK (slot IN ('before','after','broll','any')),
  product_id TEXT REFERENCES products(id) ON DELETE CASCADE, -- null = generic
  use_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- No ON DELETE action on purpose: a product with videos cannot be hard deleted
-- (archive it instead).
CREATE TABLE videos (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id),
  status TEXT NOT NULL CHECK (status IN ('draft','exported','failed')),
  recipe_json TEXT NOT NULL,
  export_path TEXT,                -- relative
  batch_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_media_product_id ON media(product_id);
CREATE INDEX idx_media_kind ON media(kind);
CREATE INDEX idx_captions_product_id ON captions(product_id);
CREATE INDEX idx_videos_product_id ON videos(product_id);
CREATE INDEX idx_videos_status ON videos(status);
