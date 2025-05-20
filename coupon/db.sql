

-- 1. users & proxy credentials
CREATE TABLE IF NOT EXISTS users (
  username TEXT PRIMARY KEY,
  passhash TEXT NOT NULL,              -- bcrypt hash
  remaining_seconds INTEGER DEFAULT 0,
  state TEXT DEFAULT 'paused',         -- running | paused
  last_tick INTEGER
);

-- seed the two children (password = "kid123" for demo)
INSERT OR IGNORE INTO users VALUES
 ('user1', '$2b$10$l.qY8A3N…', 0, 'paused', NULL),
 ('user2',    '$2b$10$GpGnvkN…', 0, 'paused', NULL);

-- 2. vouchers (one-shot top-ups)
CREATE TABLE IF NOT EXISTS vouchers (
  code TEXT PRIMARY KEY,
  minutes INTEGER NOT NULL,
  username TEXT NOT NULL,              -- who may redeem
  used INTEGER DEFAULT 0
);
