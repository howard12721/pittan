import Fastify from "fastify";
import websocket from "@fastify/websocket";
import staticFiles from "@fastify/static";
import rateLimit from "@fastify/rate-limit";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { z, ZodError } from "zod";
import type { WebSocket } from "ws";
import { Auth, type AuthConfig } from "./auth.js";
import { openDatabase, one, run, all } from "./db.js";
import { Rooms, type Room } from "./rooms.js";
import { GameError, requireCondition as check } from "./errors.js";
import { ClientMessage, Id, type Ack } from "../shared/protocol.js";

type Config = AuthConfig & {
  databasePath: string;
  allowedOrigin: string;
  staticDir?: string;
  now?: () => number;
  fetcher?: typeof fetch;
  maintenance?: boolean;
};
type Connection = {
  socket: WebSocket;
  roomId: string;
  memberId: string;
  userId: string;
  tokenHash: string;
  lastPong: number;
};
const instanceIdSchema = z
  .string()
  .min(1)
  .max(256)
  .regex(/^[A-Za-z0-9_-]+$/);
export async function createApp(config: Config) {
  if (config.devAuth && process.env.NODE_ENV === "production")
    throw new Error("DEV_AUTH is forbidden in production");
  const now = config.now ?? Date.now;
  const db = openDatabase(config.databasePath);
  // Connections do not survive process restart. Start the host grace period afresh.
  run(
    db,
    "UPDATE rooms SET host_missing_since=?,empty_since=COALESCE(empty_since,?)",
    now(),
    now(),
  );
  const connections = new Set<Connection>();
  let closing = false;
  const auth = new Auth(db, config, now, config.fetcher);
  const rooms = new Rooms(
    db,
    config.clientId,
    (roomId) =>
      new Set(
        [...connections]
          .filter((c) => c.roomId === roomId)
          .map((c) => c.memberId),
      ),
    now,
  );
  const app = Fastify({ logger: false, bodyLimit: 16_384, trustProxy: false });
  await app.register(rateLimit, {
    global: true,
    max: 600,
    timeWindow: "1 minute",
    errorResponseBuilder: () => new GameError("RATE_LIMITED", 429, 60),
  });
  await app.register(websocket, {
    options: { maxPayload: 16_384, perMessageDeflate: false },
  });
  app.addHook("onSend", async (req, reply, payload) => {
    reply
      .header("X-Content-Type-Options", "nosniff")
      .header("Referrer-Policy", "no-referrer");
    if (req.url.startsWith("/api/")) reply.header("Cache-Control", "no-store");
    return payload;
  });
  app.setErrorHandler((error, _req, reply) => {
    const err =
      error instanceof GameError
        ? error
        : error instanceof ZodError ||
            (error as { statusCode?: number }).statusCode === 400
          ? new GameError("INVALID_INPUT")
          : (error as { statusCode?: number }).statusCode === 413
            ? new GameError("INVALID_INPUT", 413)
            : new GameError("STORAGE_UNAVAILABLE", 503);
    if (err.retryAfter) reply.header("Retry-After", err.retryAfter);
    reply.code(err.status).send({
      errorCode: err.code,
      ...(err.retryAfter ? { retryAfter: err.retryAfter } : {}),
    });
  });
  app.get("/health/live", () => ({ ok: true }));
  app.get("/health/ready", () => ({
    ok: !!one(db, "SELECT version FROM schema_migrations WHERE version=1"),
  }));
  app.get("/api/config", () => ({
    clientId: config.clientId,
    devAuth: config.devAuth,
  }));
  app.post(
    "/api/auth/discord",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (req) => {
      const body = z
        .strictObject({ code: z.string().min(1).max(2048) })
        .parse(req.body);
      return auth.exchange(body.code);
    },
  );
  if (config.devAuth)
    app.post("/api/auth/dev", async (req) => {
      check(["127.0.0.1", "::1"].includes(req.ip), "FORBIDDEN", 403);
      const body = z
        .strictObject({
          name: z.string().min(1).max(32),
          user: z.string().regex(/^[a-z0-9-]{1,32}$/),
        })
        .parse(req.body);
      return auth.issue({
        userId: `dev-${body.user}`,
        displayName: body.name,
        username: body.user,
      });
    });
  app.post("/api/rooms/join", async (req) => {
    const session = auth.bearer(req.headers.authorization);
    const { instanceId } = z
      .strictObject({ instanceId: instanceIdSchema })
      .parse(req.body);
    await auth.verify(instanceId, session.userId);
    const joined = rooms.join(instanceId, session);
    broadcast(joined.roomId);
    return joined;
  });
  async function authorizeRoom(header: string | undefined, id: string) {
    const session = auth.bearer(header),
      room = rooms.room(Id.parse(id));
    const member = one<{ member_id: string }>(
      db,
      "SELECT member_id FROM room_members WHERE room_id=? AND discord_user_id=?",
      room.room_id,
      session.userId,
    );
    check(member, "FORBIDDEN", 403);
    await auth.verify(room.instance_id, session.userId);
    return { session, room, memberId: member.member_id };
  }
  app.post<{ Params: { roomId: string } }>(
    "/api/rooms/:roomId/ws-ticket",
    async (req) => {
      const { session, room, memberId } = await authorizeRoom(
        req.headers.authorization,
        req.params.roomId,
      );
      return auth.ticket(room.room_id, memberId, session.tokenHash);
    },
  );
  app.get<{ Params: { roomId: string } }>(
    "/api/rooms/:roomId/snapshot",
    async (req) => {
      const { room, memberId } = await authorizeRoom(
        req.headers.authorization,
        req.params.roomId,
      );
      return rooms.projection(room.room_id, memberId);
    },
  );
  app.get<{ Params: { roomId: string; sessionId: string } }>(
    "/api/rooms/:roomId/sessions/:sessionId/history",
    async (req) => {
      const { room, memberId } = await authorizeRoom(
        req.headers.authorization,
        req.params.roomId,
      );
      const q = z
        .strictObject({
          view: z.enum(["topic", "respondent"]),
          subject: z.string().max(64),
          cursor: z.coerce.number().int().min(0).max(50).default(0),
          limit: z.coerce.number().int().min(1).max(50).default(20),
        })
        .parse(req.query);
      return rooms.history(
        room.room_id,
        memberId,
        Id.parse(req.params.sessionId),
        q.view,
        q.subject,
        q.cursor,
        q.limit,
      );
    },
  );
  function send(socket: WebSocket, message: unknown) {
    if (socket.readyState !== 1) return;
    const data = JSON.stringify(message);
    if (
      socket.bufferedAmount > 1_048_576 ||
      Buffer.byteLength(data) > 524_288
    ) {
      socket.close(1013);
      return;
    }
    socket.send(data);
  }
  function snapshot(c: Connection) {
    send(c.socket, {
      type: "snapshot",
      view: rooms.projection(c.roomId, c.memberId),
    });
  }
  function broadcast(roomId: string) {
    for (const c of connections) if (c.roomId === roomId) snapshot(c);
  }
  const buckets = new Map<
    string,
    { tokens: number; last: number; posts: number[] }
  >();
  function allow(c: Connection, post: boolean) {
    const key = `${c.roomId}:${c.memberId}`;
    const b = buckets.get(key) ?? { tokens: 20, last: now(), posts: [] };
    b.tokens = Math.min(20, b.tokens + (now() - b.last) / 100);
    b.last = now();
    b.posts = b.posts.filter((t) => now() - t < 60_000);
    buckets.set(key, b);
    if (b.tokens < 1 || (post && b.posts.length >= 5)) return false;
    b.tokens--;
    if (post) b.posts.push(now());
    return true;
  }
  app.get(
    "/ws",
    {
      websocket: true,
      preValidation: async (req) => {
        check(req.headers.origin === config.allowedOrigin, "FORBIDDEN", 403);
      },
    },
    (socket) => {
      let c: Connection | undefined;
      const deadline = setTimeout(() => {
        if (!c) socket.close(1008);
      }, 5000);
      socket.on("pong", () => {
        if (c) c.lastPong = now();
      });
      socket.on("error", () => socket.terminate());
      socket.on("message", (raw, isBinary) => {
        if (closing) return;
        try {
          const bytes = Buffer.isBuffer(raw)
            ? raw
            : Array.isArray(raw)
              ? Buffer.concat(raw)
              : Buffer.from(raw);
          check(!isBinary && (c || bytes.length <= 8192), "INVALID_INPUT");
          const json: unknown = JSON.parse(bytes.toString());
          const parsed = ClientMessage.safeParse(json);
          if (!parsed.success) {
            const id = (json as { commandId?: unknown })?.commandId;
            if (c && Id.safeParse(id).success)
              send(socket, {
                type: "ack",
                wireVersion: 1,
                commandId: id,
                status: "rejected",
                errorCode:
                  (json as { wireVersion?: number }).wireVersion !== 1
                    ? "UPDATE_REQUIRED"
                    : "INVALID_INPUT",
              });
            else socket.close(1008);
            return;
          }
          const message = parsed.data;
          if (!c) {
            check(message.type === "authenticate", "UNAUTHENTICATED", 401);
            const ticket = auth.consumeTicket(message.ticket),
              session = auth.fromHash(ticket.tokenHash),
              room = rooms.room(ticket.roomId);
            check(
              auth.withinGrace(room.instance_id, session.userId),
              "NOT_IN_INSTANCE",
              403,
            );
            const sameMember = [...connections].filter(
              (x) =>
                x.roomId === ticket.roomId && x.memberId === ticket.memberId,
            );
            check(
              sameMember.length < 3 &&
                [...connections].filter((x) => x.roomId === ticket.roomId)
                  .length < 96,
              "ROOM_FULL",
            );
            // Also handles the lobby starting between ticket issuance and WS authentication.
            const joined = rooms.join(room.instance_id, session);
            check(joined.memberId === ticket.memberId, "FORBIDDEN");
            c = {
              socket,
              roomId: ticket.roomId,
              memberId: ticket.memberId,
              tokenHash: ticket.tokenHash,
              userId: session.userId,
              lastPong: now(),
            };
            clearTimeout(deadline);
            connections.add(c);
            rooms.presenceChanged(c.roomId);
            broadcast(c.roomId);
            return;
          }
          auth.fromHash(c.tokenHash);
          check(
            auth.withinGrace(rooms.room(c.roomId).instance_id, c.userId),
            "NOT_IN_INSTANCE",
            403,
          );
          check(message.type !== "authenticate", "INVALID_INPUT");
          if (
            !allow(
              c,
              message.type === "command" && message.name === "topic.create",
            )
          ) {
            if (message.type === "command")
              send(socket, {
                type: "ack",
                wireVersion: 1,
                commandId: message.commandId,
                status: "rejected",
                errorCode: "RATE_LIMITED",
              } satisfies Ack);
            return;
          }
          if (message.type === "sync.request") {
            snapshot(c);
            return;
          }
          const ack = rooms.execute(c.roomId, c.memberId, message);
          send(socket, ack);
          if (ack.status === "applied") broadcast(c.roomId);
          else snapshot(c);
        } catch (error) {
          send(socket, {
            type: "error",
            errorCode:
              error instanceof GameError ? error.code : "INVALID_INPUT",
          });
          socket.close(1008);
        }
      });
      socket.on("close", () => {
        clearTimeout(deadline);
        if (c) {
          connections.delete(c);
          if (!closing && db.open) {
            rooms.presenceChanged(c.roomId);
            broadcast(c.roomId);
            void validateEmptyRooms();
          }
        }
      });
    },
  );
  let checkingEmpty = false;
  async function validateEmptyRooms() {
    if (closing || checkingEmpty) return;
    checkingEmpty = true;
    try {
      const empty = all<Room>(
        db,
        "SELECT rooms.* FROM rooms JOIN sessions ON sessions.session_id=rooms.current_session_id WHERE rooms.empty_since IS NOT NULL AND sessions.phase IN ('ANSWERING','DISCUSSING','GUESSING')",
      );
      for (const room of empty) {
        if (closing) break;
        try {
          // Real Activities are ended only after Discord confirms that nobody remains.
          // Local development has no Discord instance; allow a short refresh/reconnect grace.
          const departed = config.devAuth
            ? now() - room.empty_since! >= 15_000
            : (await auth.instanceUsers(room.instance_id, true)).length === 0;
          if (!closing && departed)
            rooms.abortIfEmpty(room.room_id, room.current_session_id);
        } catch {
          /* API failures are not evidence that the Activity is empty. Retry next interval. */
        }
      }
    } finally {
      checkingEmpty = false;
    }
  }
  let validating = false;
  async function validateConnections() {
    if (validating) return;
    validating = true;
    try {
      for (const roomId of new Set([...connections].map((c) => c.roomId))) {
        if (closing) break;
        const room = rooms.room(roomId);
        try {
          const users = await auth.instanceUsers(room.instance_id, true);
          for (const c of connections)
            if (c.roomId === roomId && !users.includes(c.userId)) {
              send(c.socket, { type: "error", errorCode: "NOT_IN_INSTANCE" });
              c.socket.close(1008);
            }
        } catch (e) {
          for (const c of connections)
            if (
              c.roomId === roomId &&
              (!(e instanceof GameError) ||
                e.status === 403 ||
                !auth.withinGrace(room.instance_id, c.userId))
            ) {
              send(c.socket, { type: "error", errorCode: "NOT_IN_INSTANCE" });
              c.socket.close(1008);
            }
        }
      }
    } finally {
      validating = false;
    }
  }
  const tick =
    config.maintenance === false
      ? undefined
      : setInterval(() => {
          for (const c of connections) {
            try {
              auth.fromHash(c.tokenHash);
            } catch {
              send(c.socket, { type: "error", errorCode: "AUTH_EXPIRED" });
              c.socket.close(1008);
              continue;
            }
            if (now() - c.lastPong > 45_000) c.socket.terminate();
            else c.socket.ping();
          }
          for (const id of rooms.maintain()) broadcast(id);
          auth.pruneTickets();
          for (const [key, b] of buckets)
            if (now() - b.last > 300_000) buckets.delete(key);
        }, 20_000);
  const verifier =
    config.maintenance === false
      ? undefined
      : setInterval(() => {
          void validateConnections();
          void validateEmptyRooms();
        }, 60_000);
  tick?.unref();
  verifier?.unref();
  if (config.staticDir && existsSync(config.staticDir)) {
    await app.register(staticFiles, {
      root: resolve(config.staticDir),
      index: "index.html",
    });
    app.setNotFoundHandler((req, reply) =>
      req.url.startsWith("/api/")
        ? reply.code(404).send({ errorCode: "NOT_FOUND" })
        : reply.sendFile("index.html"),
    );
  }
  app.addHook("preClose", async () => {
    closing = true;
    if (tick) clearInterval(tick);
    if (verifier) clearInterval(verifier);
    const active = [...connections];
    connections.clear();
    for (const roomId of new Set(active.map((c) => c.roomId)))
      rooms.presenceChanged(roomId);
    await Promise.all(
      active.map(
        (c) =>
          new Promise<void>((resolve) => {
            if (c.socket.readyState === 3) {
              resolve();
              return;
            }
            const timeout = setTimeout(() => {
              c.socket.terminate();
              resolve();
            }, 1000);
            c.socket.once("close", () => {
              clearTimeout(timeout);
              resolve();
            });
            c.socket.close(1012);
          }),
      ),
    );
  });
  app.addHook("onClose", async () => {
    db.close();
  });
  return {
    app,
    db,
    rooms,
    auth,
    connections,
    validateConnections,
    validateEmptyRooms,
  };
}
