-- words table
CREATE TABLE IF NOT EXISTS words (
  id TEXT PRIMARY KEY,
  phrase TEXT NOT NULL UNIQUE,
  meaning TEXT NOT NULL,
  example TEXT,
  source TEXT,
  createdAt TEXT,
  updatedAt TEXT
);

-- srs state
CREATE TABLE IF NOT EXISTS srs_state (
  wordId TEXT PRIMARY KEY,
  nextDueDate TEXT NOT NULL,
  intervalDays INTEGER NOT NULL,
  stability REAL NOT NULL,
  reps INTEGER NOT NULL DEFAULT 0,
  lapses INTEGER NOT NULL DEFAULT 0,
  updatedAt TEXT
);

-- review logs
CREATE TABLE IF NOT EXISTS review_log (
  id TEXT PRIMARY KEY,
  wordId TEXT,
  reviewedAt TEXT,
  grade TEXT CHECK(grade IN ('EASY','NORMAL','HARD')),
  newInterval INTEGER,
  newDueDate TEXT
);

-- indices
CREATE UNIQUE INDEX IF NOT EXISTS uniq_phrase ON words(phrase);
CREATE INDEX IF NOT EXISTS idx_due ON srs_state(nextDueDate);

-- calendar events
CREATE TABLE IF NOT EXISTS calendar_events (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  memo TEXT,
  color TEXT NOT NULL DEFAULT 'white',
  dateKey TEXT NOT NULL,
  startMinutes INTEGER NOT NULL,
  endMinutes INTEGER NOT NULL,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_calendar_events_date ON calendar_events(dateKey, startMinutes);
