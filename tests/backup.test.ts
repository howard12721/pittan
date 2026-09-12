import { test, expect } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { openDatabase } from "../src/server/db";
import { backup, restore } from "../src/server/backup";

test("online encrypted backup restores committed data and rejects corruption and overwrite", async () => {
  const directory = await mkdtemp(join(tmpdir(), "pittan-backup-")),
    source = join(directory, "live.sqlite"),
    secret = randomBytes(32).toString("hex");
  const db = openDatabase(source);
  try {
    db.exec(
      "CREATE TABLE backup_probe (value TEXT); INSERT INTO backup_probe VALUES ('unpublished-private-answer')",
    );
    const encrypted = await backup(source, join(directory, "backups"), secret),
      bytes = await readFile(encrypted);
    expect(bytes.includes(Buffer.from("unpublished-private-answer"))).toBe(
      false,
    );
    const target = join(directory, "restored.sqlite");
    await restore(encrypted, target, secret);
    const restored = openDatabase(target);
    try {
      expect(restored.prepare("SELECT value FROM backup_probe").get()).toEqual({
        value: "unpublished-private-answer",
      });
    } finally {
      restored.close();
    }
    await expect(restore(encrypted, target, secret)).rejects.toThrow();
    bytes[bytes.length - 20] ^= 1;
    const bad = join(directory, "tampered.pittan");
    await writeFile(bad, bytes);
    await expect(
      restore(bad, join(directory, "bad.sqlite"), secret),
    ).rejects.toThrow();
  } finally {
    db.close();
    await rm(directory, { recursive: true, force: true });
  }
});
