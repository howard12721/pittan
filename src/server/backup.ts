import Database from "better-sqlite3";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
  copyFile,
} from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { pipeline } from "node:stream/promises";

const magic = Buffer.from("PITB1");
function key(value: string) {
  if (!/^[a-f0-9]{64}$/i.test(value))
    throw new Error("BACKUP_KEY must contain 32 bytes encoded as hex");
  return Buffer.from(value, "hex");
}
export async function backup(
  source: string,
  directory: string,
  secret: string,
) {
  const encryptionKey = key(secret);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const temporary = await mkdtemp(join(directory, ".backup-"));
  const destination = join(
    directory,
    `pittan-${Date.now()}-${randomBytes(4).toString("hex")}.pittan`,
  );
  try {
    const plain = join(temporary, "snapshot.sqlite");
    const db = new Database(source, { readonly: true, fileMustExist: true });
    try {
      await db.backup(plain);
    } finally {
      db.close();
    }
    const nonce = randomBytes(12),
      cipher = createCipheriv("aes-256-gcm", encryptionKey, nonce);
    await writeFile(destination, Buffer.concat([magic, nonce]), {
      flag: "wx",
      mode: 0o600,
    });
    await pipeline(
      createReadStream(plain),
      cipher,
      createWriteStream(destination, { flags: "a" }),
    );
    await writeFile(destination, cipher.getAuthTag(), { flag: "a" });
    for (const name of await readdir(directory)) {
      if (!/^pittan-\d+-[a-f0-9]{8}\.pittan$/.test(name)) continue;
      const path = join(directory, name);
      if (Date.now() - (await stat(path)).mtimeMs > 7 * 86_400_000)
        await rm(path);
    }
    return destination;
  } catch (error) {
    await rm(destination, { force: true });
    throw error;
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}
export async function restore(
  source: string,
  destination: string,
  secret: string,
) {
  const encryptionKey = key(secret);
  // Backups are bounded by the application's small SQLite store; authenticate before writing any database.
  const bytes = await readFile(source);
  if (bytes.length < 33 || !bytes.subarray(0, 5).equals(magic))
    throw new Error("Invalid backup");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey,
    bytes.subarray(5, 17),
  );
  decipher.setAuthTag(bytes.subarray(-16));
  const plain = Buffer.concat([
    decipher.update(bytes.subarray(17, -16)),
    decipher.final(),
  ]);
  await mkdir(dirname(destination), { recursive: true, mode: 0o700 });
  const temporary = await mkdtemp(join(dirname(destination), ".restore-"));
  try {
    const staged = join(temporary, "snapshot.sqlite");
    await writeFile(staged, plain, { mode: 0o600 });
    const db = new Database(staged, { readonly: true });
    try {
      if (
        db.pragma("integrity_check", { simple: true }) !== "ok" ||
        (db.pragma("foreign_key_check") as unknown[]).length
      )
        throw new Error("Backup integrity check failed");
    } finally {
      db.close();
    }
    await copyFile(staged, destination, constants.COPYFILE_EXCL);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  if (process.argv[2] === "restore") {
    if (!process.argv[3] || !process.argv[4])
      throw new Error("Usage: backup.js restore backup.pittan new.sqlite");
    await restore(
      process.argv[3],
      process.argv[4],
      process.env.BACKUP_KEY || "",
    );
    console.log("Backup restored and verified");
  } else
    console.log(
      await backup(
        process.env.DATABASE_PATH || "./data/pittan.sqlite",
        process.env.BACKUP_DIR || "./backups",
        process.env.BACKUP_KEY || "",
      ),
    );
}
