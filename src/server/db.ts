import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export function openDatabase(path: string) {
  if (path !== ":memory:")
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const db = new Database(path);
  db.pragma("foreign_keys = ON");
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = FULL");
  db.pragma("busy_timeout = 5000");
  db.exec(
    "CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL)",
  );
  const version =
    (
      db.prepare("SELECT max(version) AS n FROM schema_migrations").get() as {
        n: number | null;
      }
    ).n ?? 0;
  if (version > 1)
    throw new Error("Database schema is newer than this application");
  if (version === 0)
    db.transaction(() => {
      db.exec(`
      CREATE TABLE rooms (
        room_id TEXT PRIMARY KEY, application_id TEXT NOT NULL, instance_id TEXT NOT NULL,
        current_session_id TEXT NOT NULL, host_member_id TEXT NOT NULL, host_epoch INTEGER NOT NULL DEFAULT 0,
        revision INTEGER NOT NULL DEFAULT 0, empty_since INTEGER, host_missing_since INTEGER,
        UNIQUE(application_id, instance_id)
      );
      CREATE TABLE room_members (
        member_id TEXT PRIMARY KEY, room_id TEXT NOT NULL REFERENCES rooms ON DELETE CASCADE,
        discord_user_id TEXT NOT NULL, display_name TEXT NOT NULL, username TEXT NOT NULL,
        lobby_role TEXT NOT NULL DEFAULT 'viewer' CHECK(lobby_role IN ('respondent','viewer')),
        version INTEGER NOT NULL DEFAULT 0, joined_at INTEGER NOT NULL,
        UNIQUE(room_id, discord_user_id), UNIQUE(room_id, member_id)
      );
      CREATE TABLE sessions (
        session_id TEXT PRIMARY KEY, room_id TEXT NOT NULL REFERENCES rooms ON DELETE CASCADE,
        phase TEXT NOT NULL DEFAULT 'LOBBY', current_topic_id TEXT,
        phase_version INTEGER NOT NULL DEFAULT 0, queue_version INTEGER NOT NULL DEFAULT 0,
        history_version INTEGER NOT NULL DEFAULT 0, started_at INTEGER, revealed_at INTEGER, retired_at INTEGER,
        CHECK(phase IN ('LOBBY','ANSWERING','DISCUSSING','GUESSING','REVEALED','ABORTED')),
        UNIQUE(room_id, session_id)
      );
      CREATE TABLE session_members (
        session_id TEXT NOT NULL REFERENCES sessions ON DELETE CASCADE, member_id TEXT NOT NULL REFERENCES room_members ON DELETE CASCADE,
        role TEXT NOT NULL CHECK(role IN ('respondent','viewer')), anonymous_id TEXT,
        display_name TEXT NOT NULL, username TEXT NOT NULL, guess_eligible INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY(session_id, member_id), UNIQUE(session_id, anonymous_id)
      );
      CREATE TABLE topics (
        topic_id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions ON DELETE CASCADE,
        author_member_id TEXT NOT NULL REFERENCES room_members ON DELETE CASCADE, text TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','current','published','deleted')),
        queue_position INTEGER NOT NULL, round_number INTEGER, version INTEGER NOT NULL DEFAULT 0,
        UNIQUE(session_id, topic_id), UNIQUE(session_id, round_number)
      );
      CREATE TABLE answers (
        session_id TEXT NOT NULL, topic_id TEXT NOT NULL, member_id TEXT NOT NULL,
        text TEXT NOT NULL, submitted INTEGER NOT NULL, version INTEGER NOT NULL,
        PRIMARY KEY(topic_id, member_id),
        FOREIGN KEY(session_id, topic_id) REFERENCES topics(session_id, topic_id) ON DELETE CASCADE,
        FOREIGN KEY(session_id, member_id) REFERENCES session_members(session_id, member_id) ON DELETE CASCADE
      );
      CREATE TABLE prediction_status (
        session_id TEXT NOT NULL, member_id TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0,
        version INTEGER NOT NULL DEFAULT 0, score INTEGER, score_total INTEGER,
        PRIMARY KEY(session_id, member_id),
        FOREIGN KEY(session_id, member_id) REFERENCES session_members(session_id, member_id) ON DELETE CASCADE
      );
      CREATE TABLE predictions (
        session_id TEXT NOT NULL, guesser_member_id TEXT NOT NULL, anonymous_id TEXT NOT NULL, target_member_id TEXT,
        PRIMARY KEY(session_id, guesser_member_id, anonymous_id), UNIQUE(session_id, guesser_member_id, target_member_id),
        FOREIGN KEY(session_id, guesser_member_id) REFERENCES session_members(session_id, member_id) ON DELETE CASCADE,
        FOREIGN KEY(session_id, anonymous_id) REFERENCES session_members(session_id, anonymous_id) ON DELETE CASCADE,
        FOREIGN KEY(session_id, target_member_id) REFERENCES session_members(session_id, member_id) ON DELETE CASCADE
      );
      CREATE TABLE command_receipts (
        room_id TEXT NOT NULL, session_id TEXT NOT NULL, member_id TEXT NOT NULL,
        command_id TEXT NOT NULL, request_hash TEXT NOT NULL, result_code TEXT NOT NULL, applied_revision INTEGER NOT NULL,
        PRIMARY KEY(room_id, session_id, member_id, command_id),
        FOREIGN KEY(room_id, session_id) REFERENCES sessions(room_id, session_id) ON DELETE CASCADE,
        FOREIGN KEY(room_id, member_id) REFERENCES room_members(room_id, member_id) ON DELETE CASCADE
      );
      CREATE TABLE auth_sessions (
        token_hash TEXT PRIMARY KEY, discord_user_id TEXT NOT NULL, display_name TEXT NOT NULL, username TEXT NOT NULL,
        expires_at INTEGER NOT NULL
      );
      CREATE INDEX topics_session ON topics(session_id, status, queue_position);
      CREATE INDEX members_room ON room_members(room_id);
      CREATE INDEX sessions_retired ON sessions(retired_at);
    `);
      db.prepare("INSERT INTO schema_migrations VALUES (1, ?)").run(Date.now());
    })();
  return db;
}
export type DB = ReturnType<typeof openDatabase>;
export function one<T>(db: DB, sql: string, ...args: unknown[]): T | undefined {
  return db.prepare(sql).get(...args) as T | undefined;
}
export function all<T>(db: DB, sql: string, ...args: unknown[]): T[] {
  return db.prepare(sql).all(...args) as T[];
}
export function run(db: DB, sql: string, ...args: unknown[]) {
  return db.prepare(sql).run(...args);
}
