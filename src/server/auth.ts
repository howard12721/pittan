import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { all, one, run, type DB } from "./db.js";
import { GameError, requireCondition as check } from "./errors.js";
import type { Profile } from "./rooms.js";

export const hashToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");
const api = "https://discord.com/api/v10";
const profileSchema = z.object({
  id: z.string(),
  username: z.string(),
  global_name: z.string().nullable().optional(),
});
const instanceSchema = z.object({
  application_id: z.string(),
  instance_id: z.string(),
  users: z.array(z.string()),
});
export type AuthSession = Profile & { tokenHash: string; expiresAt: number };
export type AuthConfig = {
  clientId: string;
  clientSecret: string;
  botToken: string;
  devAuth: boolean;
};
function displayText(value: string) {
  let result = "";
  for (const c of value) {
    if (Buffer.byteLength(result + c) > 256) break;
    result += c;
  }
  return result;
}
export class Auth {
  private cache = new Map<string, { users: string[]; verifiedAt: number }>();
  private inFlight = new Map<string, Promise<string[]>>();
  private retryAt = new Map<string, number>();
  private tickets = new Map<
    string,
    { roomId: string; memberId: string; tokenHash: string; expiresAt: number }
  >();
  constructor(
    public db: DB,
    public config: AuthConfig,
    public now = Date.now,
    public fetcher: typeof fetch = fetch,
  ) {}
  issue(profile: Profile) {
    const token = randomBytes(32).toString("hex"),
      expiresAt = this.now() + 8 * 60 * 60 * 1000;
    run(
      this.db,
      "INSERT INTO auth_sessions VALUES(?,?,?,?,?)",
      hashToken(token),
      profile.userId,
      displayText(profile.displayName),
      displayText(profile.username),
      expiresAt,
    );
    return { sessionToken: token, expiresAt };
  }
  fromHash(tokenHash: string): AuthSession {
    const r = one<{
      discord_user_id: string;
      display_name: string;
      username: string;
      expires_at: number;
    }>(this.db, "SELECT * FROM auth_sessions WHERE token_hash=?", tokenHash);
    check(r, "UNAUTHENTICATED", 401);
    check(r.expires_at > this.now(), "AUTH_EXPIRED", 401);
    return {
      userId: r.discord_user_id,
      displayName: r.display_name,
      username: r.username,
      expiresAt: r.expires_at,
      tokenHash,
    };
  }
  bearer(header?: string) {
    check(
      header && /^Bearer [a-f0-9]{64}$/.test(header),
      "UNAUTHENTICATED",
      401,
    );
    return this.fromHash(hashToken(header.slice(7)));
  }
  async exchange(code: string) {
    const response = await this.request(`${api}/oauth2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        grant_type: "authorization_code",
        code,
      }),
    });
    const token = z
      .object({ access_token: z.string() })
      .parse(await response.json());
    const userResponse = await this.request(`${api}/users/@me`, {
      headers: { Authorization: `Bearer ${token.access_token}` },
    });
    const user = profileSchema.parse(await userResponse.json());
    return {
      ...this.issue({
        userId: user.id,
        displayName: user.global_name || user.username,
        username: user.username,
      }),
      accessToken: token.access_token,
    };
  }
  private async request(url: string, init: RequestInit) {
    let response: Response;
    try {
      response = await this.fetcher(url, {
        ...init,
        signal: AbortSignal.timeout(8000),
      });
    } catch {
      throw new GameError("UNAUTHENTICATED", 503);
    }
    if (response.status === 429)
      throw new GameError(
        "RATE_LIMITED",
        429,
        Math.max(
          1,
          Math.ceil(Number(response.headers.get("retry-after")) || 5),
        ),
      );
    if (response.status >= 500) throw new GameError("UNAUTHENTICATED", 503);
    check(response.ok, "UNAUTHENTICATED", 401);
    return response;
  }
  async instanceUsers(instanceId: string, force = false): Promise<string[]> {
    if (this.config.devAuth)
      return all<{ discord_user_id: string }>(
        this.db,
        "SELECT DISTINCT discord_user_id FROM auth_sessions",
      ).map((x) => x.discord_user_id);
    const cached = this.cache.get(instanceId);
    if (!force && cached && this.now() - cached.verifiedAt < 15_000)
      return cached.users;
    const pending = this.inFlight.get(instanceId);
    if (pending) return pending;
    if ((this.retryAt.get(instanceId) ?? 0) > this.now())
      throw new GameError(
        "RATE_LIMITED",
        429,
        Math.ceil((this.retryAt.get(instanceId)! - this.now()) / 1000),
      );
    const request = (async () => {
      let r: Response;
      try {
        r = await this.fetcher(
          `${api}/applications/${encodeURIComponent(this.config.clientId)}/activity-instances/${encodeURIComponent(instanceId)}`,
          {
            headers: { Authorization: `Bot ${this.config.botToken}` },
            signal: AbortSignal.timeout(8000),
          },
        );
      } catch {
        throw new GameError("NOT_IN_INSTANCE", 503);
      }
      if (r.status === 429) {
        const seconds = Math.max(1, Number(r.headers.get("retry-after")) || 5);
        this.retryAt.set(instanceId, this.now() + seconds * 1000);
        throw new GameError("RATE_LIMITED", 429, seconds);
      }
      if (r.status >= 500) throw new GameError("NOT_IN_INSTANCE", 503);
      if (r.status === 404) {
        this.cache.set(instanceId, { users: [], verifiedAt: this.now() });
        return [];
      }
      if (!r.ok) {
        this.cache.delete(instanceId);
        throw new GameError("NOT_IN_INSTANCE", 403);
      }
      const data = instanceSchema.safeParse(await r.json());
      check(
        data.success &&
          data.data.application_id === this.config.clientId &&
          data.data.instance_id === instanceId,
        "NOT_IN_INSTANCE",
        403,
      );
      this.cache.set(instanceId, {
        users: data.data.users,
        verifiedAt: this.now(),
      });
      return data.data.users;
    })();
    this.inFlight.set(instanceId, request);
    try {
      return await request;
    } finally {
      this.inFlight.delete(instanceId);
    }
  }
  async verify(instanceId: string, userId: string) {
    let users = await this.instanceUsers(instanceId);
    if (!users.includes(userId))
      users = await this.instanceUsers(instanceId, true);
    check(users.includes(userId), "NOT_IN_INSTANCE", 403);
  }
  withinGrace(instanceId: string, userId: string) {
    if (this.config.devAuth) return true;
    const c = this.cache.get(instanceId);
    return (
      !!c && c.users.includes(userId) && this.now() - c.verifiedAt <= 300_000
    );
  }
  ticket(roomId: string, memberId: string, tokenHash: string) {
    this.pruneTickets();
    // Bound unused tickets even when a client repeatedly abandons the handshake.
    for (const [key, t] of this.tickets)
      if (t.tokenHash === tokenHash && t.roomId === roomId)
        this.tickets.delete(key);
    const ticket = randomBytes(32).toString("hex"),
      expiresAt = this.now() + 30_000;
    this.tickets.set(hashToken(ticket), {
      roomId,
      memberId,
      tokenHash,
      expiresAt,
    });
    return { ticket, expiresAt };
  }
  consumeTicket(ticket: string) {
    const hash = hashToken(ticket),
      data = this.tickets.get(hash);
    this.tickets.delete(hash);
    check(data && data.expiresAt > this.now(), "UNAUTHENTICATED", 401);
    this.fromHash(data.tokenHash);
    return data;
  }
  pruneTickets() {
    for (const [key, t] of this.tickets)
      if (t.expiresAt <= this.now()) this.tickets.delete(key);
  }
}
