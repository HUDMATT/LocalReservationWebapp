PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS tables (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  defaultX INTEGER NOT NULL,
  defaultY INTEGER NOT NULL,
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  capacity INTEGER
);

CREATE TABLE IF NOT EXISTS layout_instances (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS table_groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  layoutInstanceId INTEGER NOT NULL,
  FOREIGN KEY (layoutInstanceId) REFERENCES layout_instances(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS table_state (
  layoutInstanceId INTEGER NOT NULL,
  tableId INTEGER NOT NULL,
  x INTEGER NOT NULL,
  y INTEGER NOT NULL,
  groupId INTEGER,
  PRIMARY KEY (layoutInstanceId, tableId),
  FOREIGN KEY (layoutInstanceId) REFERENCES layout_instances(id) ON DELETE CASCADE,
  FOREIGN KEY (tableId) REFERENCES tables(id) ON DELETE CASCADE,
  FOREIGN KEY (groupId) REFERENCES table_groups(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS reservations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  layoutInstanceId INTEGER NOT NULL,
  groupId INTEGER NOT NULL,
  time TEXT NOT NULL,
  name TEXT NOT NULL,
  partySize INTEGER NOT NULL,
  notes TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  FOREIGN KEY (layoutInstanceId) REFERENCES layout_instances(id) ON DELETE CASCADE,
  FOREIGN KEY (groupId) REFERENCES table_groups(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_table_state_layout ON table_state(layoutInstanceId);
CREATE INDEX IF NOT EXISTS idx_table_state_group ON table_state(groupId);
CREATE INDEX IF NOT EXISTS idx_reservations_group ON reservations(groupId);
