import { test, expect } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Auth } from "../src/server/auth";
import { openDatabase } from "../src/server/db";
import { Rooms } from "../src/server/rooms";

const config = {
  clientId: "app",
  clientSecret: "secret",
  botToken: "bot",
  devAuth: false,
};

test("Discord OAuth preserves custom and default avatars through authentication and room entry", async () => {
  const db = openDatabase(":memory:");
  try {
    const id = "123456789012345678";
    const hash = "a_" + "a".repeat(32);
    const rooms = new Rooms(db, "app", () => new Set());
    for (const [avatar, discriminator, expected] of [
      [
        hash,
        "0",
        `https://cdn.discordapp.com/avatars/${id}/${hash}.png?size=128`,
      ],
      [
        null,
        "0",
        `https://cdn.discordapp.com/embed/avatars/${(BigInt(id) >> 22n) % 6n}.png`,
      ],
      [null, "1234", "https://cdn.discordapp.com/embed/avatars/4.png"],
    ] as const) {
      const auth = new Auth(db, config, Date.now, (async (url) =>
        Response.json(
          String(url).endsWith("/oauth2/token")
            ? { access_token: "test-access-token" }
            : {
                id,
                username: "person",
                global_name: "Person",
                avatar,
                discriminator,
              },
        )) as typeof fetch);
      const result = await auth.exchange("test-code");
      const profile = auth.bearer(`Bearer ${result.sessionToken}`);
      expect(profile.avatarUrl).toBe(expected);
      const member = rooms.join("instance", profile);
      expect(
        rooms.projection(member.roomId, member.memberId).members[0].avatarUrl,
      ).toBe(expected);
    }
  } finally {
    db.close();
  }
});

test("schema v1 migration keeps existing sessions and remains safe on repeated startup", () => {
  const directory = mkdtempSync(join(tmpdir(), "pittan-avatar-migration-"));
  const path = join(directory, "game.sqlite");
  let db = openDatabase(path);
  try {
    const auth = new Auth(db, config);
    const token = auth.issue({
      userId: "legacy",
      displayName: "Legacy",
      username: "legacy",
    }).sessionToken;
    const rooms = new Rooms(db, "app", () => new Set());
    const joined = rooms.join(
      "existing-instance",
      auth.bearer(`Bearer ${token}`),
    );
    // Reproduce the v1 column layout and keep its existing member and auth records.
    db.exec(`
      ALTER TABLE auth_sessions DROP COLUMN avatar_url;
      ALTER TABLE room_members DROP COLUMN avatar_url;
      ALTER TABLE session_members DROP COLUMN avatar_url;
      DELETE FROM schema_migrations WHERE version=2;
    `);
    db.close();
    for (let i = 0; i < 2; i++) {
      db = openDatabase(path);
      const profile = new Auth(db, config).bearer(`Bearer ${token}`);
      expect(profile.displayName).toBe("Legacy");
      expect(profile.avatarUrl).toBeUndefined();
      expect(
        new Rooms(db, "app", () => new Set()).projection(
          joined.roomId,
          joined.memberId,
        ).sessionId,
      ).toBe(joined.currentSessionId);
      expect(
        db
          .prepare("SELECT max(version) AS version FROM schema_migrations")
          .get(),
      ).toEqual({ version: 2 });
      db.close();
    }
  } finally {
    if (db.open) db.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
