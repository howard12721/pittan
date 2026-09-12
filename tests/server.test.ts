import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import WebSocket from "ws";
import { openDatabase } from "../src/server/db.js";
import { Rooms } from "../src/server/rooms.js";
import { Auth } from "../src/server/auth.js";
import { createApp } from "../src/server/app.js";
import {
  CommandSchema,
  RoomViewSchema,
  type Command,
  type RoomView,
} from "../src/shared/protocol.js";
import { validText, textLength } from "../src/shared/text.js";

const dispose: (() => unknown | Promise<unknown>)[] = [];
afterEach(async () => {
  for (const cleanup of dispose.splice(0).reverse()) await cleanup();
});
function game(count = 3) {
  const directory = mkdtempSync(join(tmpdir(), "pittan-test-")),
    path = join(directory, "game.sqlite");
  let now = Date.now();
  const db = openDatabase(path),
    online = new Set<string>();
  const rooms = new Rooms(
    db,
    "app",
    () => online,
    () => now,
  );
  dispose.push(() => {
    if (db.open) db.close();
    rmSync(directory, { recursive: true });
  });
  const joined = Array.from({ length: count }, (_, i) =>
    rooms.join("instance", {
      userId: `u${i}`,
      displayName: `user${i}`,
      username: `user${i}`,
      avatarUrl: `https://cdn.discordapp.com/embed/avatars/${i % 6}.png`,
    }),
  );
  const roomId = joined[0].roomId;
  joined.forEach((m) => online.add(m.memberId));
  const ids = joined.map((m) => m.memberId);
  const view = (i = 0) => rooms.projection(roomId, ids[i]);
  function cmd(
    i: number,
    name: Command["name"],
    payload: object = {},
    commandId = randomUUID(),
  ) {
    const v = view(i);
    const defaults: Record<string, object> = {
      "role.set": { expectedMemberVersion: v.me.memberVersion },
      "session.start": {
        hostEpoch: v.host.epoch,
        expectedPhaseVersion: v.phaseVersion,
        expectedQueueVersion: v.queueVersion,
      },
      "topic.reorder": {
        hostEpoch: v.host.epoch,
        expectedQueueVersion: v.queueVersion,
      },
      "topic.delete": {
        hostEpoch: v.host.epoch,
        expectedQueueVersion: v.queueVersion,
      },
      "round.next": {
        hostEpoch: v.host.epoch,
        expectedPhaseVersion: v.phaseVersion,
        expectedQueueVersion: v.queueVersion,
      },
      "guessing.start": {
        hostEpoch: v.host.epoch,
        expectedPhaseVersion: v.phaseVersion,
      },
      "results.reveal": {
        hostEpoch: v.host.epoch,
        expectedPhaseVersion: v.phaseVersion,
        allowIncomplete: false,
      },
      "session.restart": {
        hostEpoch: v.host.epoch,
        expectedPhaseVersion: v.phaseVersion,
      },
      "answer.submit": {
        topicId: v.currentRound?.topicId,
        expectedVersion: v.me.submission?.version ?? 0,
      },
      "answer.withdraw": {
        topicId: v.currentRound?.topicId,
        expectedVersion: v.me.submission?.version ?? 0,
      },
      "round.publish": {
        hostEpoch: v.host.epoch,
        expectedPhaseVersion: v.phaseVersion,
      },
      "prediction.save": { expectedVersion: v.me.prediction?.version },
      "prediction.complete": { expectedVersion: v.me.prediction?.version },
      "prediction.reopen": { expectedVersion: v.me.prediction?.version },
    };
    const command = CommandSchema.parse({
      type: "command",
      wireVersion: 1,
      commandId,
      sessionId: v.sessionId,
      name,
      payload: { ...defaults[name], ...payload },
    });
    return { command, ack: rooms.execute(roomId, ids[i], command) };
  }
  function start(respondents = count - 1) {
    for (let i = 0; i < respondents; i++)
      expect(cmd(i, "role.set", { role: "respondent" }).ack.status).toBe(
        "applied",
      );
    expect(
      cmd(0, "topic.create", { text: "1週間だけ別の仕事をするなら？" }).ack
        .status,
    ).toBe("applied");
    expect(cmd(0, "session.start").ack.status).toBe("applied");
  }
  return {
    db,
    rooms,
    ids,
    roomId,
    online,
    view,
    cmd,
    start,
    path,
    advance: (ms: number) => {
      now += ms;
    },
  };
}
describe("server-authoritative game", () => {
  it("publishes atomically, never exposes a private answer or identity, scores and restarts", () => {
    const g = game();
    expect(
      g.view().members.find((m) => m.memberId === g.ids[0])?.avatarUrl,
    ).toBe("https://cdn.discordapp.com/embed/avatars/0.png");
    g.start();
    expect(
      g.cmd(0, "answer.submit", { text: "PRIVATE-ANSWER-1" }).ack.status,
    ).toBe("applied");
    const viewer = g.view(2);
    RoomViewSchema.parse(viewer);
    expect(JSON.stringify(viewer)).not.toContain("PRIVATE-ANSWER-1");
    expect(viewer.result).toBeUndefined();
    expect(viewer.me.myAnonymousId).toBeUndefined();
    expect(viewer.currentRound?.submittedCount).toBe(1);
    expect(g.cmd(0, "round.publish").ack.errorCode).toBe("INCOMPLETE");
    expect(
      g.cmd(1, "answer.submit", { text: "PRIVATE-ANSWER-2" }).ack.status,
    ).toBe("applied");
    expect(g.view(2).phase).toBe("ANSWERING");
    expect(g.view(2).currentRound?.submittedCount).toBe(2);
    expect(g.view(2).currentRound?.publishedAnswers).toBeUndefined();
    expect(() =>
      g.rooms.history(
        g.roomId,
        g.ids[2],
        g.view().sessionId,
        "topic",
        g.view().currentRound!.topicId,
      ),
    ).toThrow("NOT_FOUND");
    expect(g.cmd(1, "round.publish").ack.errorCode).toBe("FORBIDDEN");
    expect(g.cmd(0, "round.publish").ack.status).toBe("applied");
    expect(g.view(2).phase).toBe("DISCUSSING");
    expect(g.view(2).currentRound?.publishedAnswers).toHaveLength(2);
    for (const answer of g.view(2).currentRound!.publishedAnswers!)
      expect(Object.keys(answer).sort()).toEqual(["anonymousId", "text"]);
    const anonymousHistory = g.rooms.history(
      g.roomId,
      g.ids[2],
      g.view().sessionId,
      "topic",
      g.view().currentRound!.topicId,
    );
    for (const answer of anonymousHistory.entries[0].answers)
      expect(Object.keys(answer).sort()).toEqual(["anonymousId", "text"]);
    expect(g.cmd(0, "answer.withdraw").ack.errorCode).toBe("PHASE_CHANGED");
    expect(g.cmd(2, "guessing.start").ack.errorCode).toBe("FORBIDDEN");
    expect(g.cmd(0, "guessing.start").ack.status).toBe("applied");
    const correct = Object.fromEntries(
      [g.view(0), g.view(1)].map((v) => [v.me.myAnonymousId!, v.me.memberId]),
    );
    for (let i = 0; i < 3; i++)
      expect(
        g.cmd(i, "prediction.complete", { choices: correct }).ack.status,
      ).toBe("applied");
    expect(g.view(2).guessing.completedCount).toBe(3);
    expect(g.cmd(0, "results.reveal").ack.status).toBe("applied");
    expect(g.view(0).me.score).toEqual({ correct: 1, total: 1 });
    expect(g.view(2).me.score).toEqual({ correct: 2, total: 2 });
    expect(g.view(2).result?.identities).toHaveLength(2);
    const revealedHistory = g.rooms.history(
      g.roomId,
      g.ids[2],
      g.view().sessionId,
      "topic",
      g.view().currentRound!.topicId,
    );
    for (const answer of revealedHistory.entries[0].answers) {
      const person = g
        .view()
        .respondents.find((m) => m.memberId === answer.memberId)!;
      expect(answer.avatarUrl).toBe(person.avatarUrl);
    }
    const old = g.view().sessionId;
    expect(g.cmd(0, "session.restart").ack.status).toBe("applied");
    expect(g.view().sessionId).not.toBe(old);
    expect(g.view().topics).toEqual([]);
  });
  it("preserves order, handles queue conflicts, and rejects changing current topics", () => {
    const g = game();
    g.start();
    const t = g.view().currentRound!.topicId;
    expect(g.cmd(0, "topic.delete", { topicId: t }).ack.errorCode).toBe(
      "INVALID_INPUT",
    );
    g.cmd(1, "topic.create", { text: "two" });
    g.cmd(2, "topic.create", { text: "three" });
    const queued = g
      .view()
      .topics.filter((t) => t.status === "queued")
      .map((t) => t.topicId);
    expect(
      g.cmd(0, "topic.reorder", { orderedTopicIds: [...queued].reverse() }).ack
        .status,
    ).toBe("applied");
    expect(
      g.cmd(0, "topic.reorder", {
        orderedTopicIds: queued,
        expectedQueueVersion: 0,
      }).ack.errorCode,
    ).toBe("VERSION_CONFLICT");
    g.cmd(0, "answer.submit", { text: "one" });
    g.cmd(1, "answer.submit", { text: "two" });
    expect(g.cmd(0, "round.publish").ack.status).toBe("applied");
    expect(g.cmd(0, "round.next").ack.status).toBe("applied");
    expect(g.view().currentRound?.topicId).toBe(queued[1]);
    expect(g.view().currentRound?.roundNumber).toBe(2);
  });
  it("rolls back failed commands and returns the same receipt after a restart", () => {
    const g = game();
    g.start();
    const result = g.cmd(0, "answer.submit", { text: "durable" });
    const revision = g.view().revision,
      identity = g.view().me.myAnonymousId;
    g.db.close();
    const db = openDatabase(g.path);
    dispose.push(() => db.close());
    const restored = new Rooms(db, "app", () => g.online);
    expect(restored.execute(g.roomId, g.ids[0], result.command)).toEqual(
      result.ack,
    );
    expect(restored.projection(g.roomId, g.ids[0]).revision).toBe(revision);
    expect(restored.projection(g.roomId, g.ids[0]).me.myAnonymousId).toBe(
      identity,
    );
    const changed = {
      ...result.command,
      payload: { ...result.command.payload, text: "changed" },
    } as Command;
    expect(restored.execute(g.roomId, g.ids[0], changed).errorCode).toBe(
      "COMMAND_ID_REUSED",
    );
    db.exec(
      "CREATE TRIGGER deny_write BEFORE INSERT ON answers BEGIN SELECT RAISE(ABORT, 'disk failure'); END",
    );
    const command = CommandSchema.parse({
      type: "command",
      wireVersion: 1,
      commandId: randomUUID(),
      sessionId: result.command.sessionId,
      name: "answer.submit",
      payload: {
        topicId: restored.projection(g.roomId, g.ids[1]).currentRound!.topicId,
        expectedVersion: 0,
        text: "two",
      },
    });
    expect(restored.execute(g.roomId, g.ids[1], command).errorCode).toBe(
      "STORAGE_UNAVAILABLE",
    );
    expect(restored.projection(g.roomId, g.ids[1]).phase).toBe("ANSWERING");
  });
  it("locks self choices, prevents duplicates, freezes eligibility and requires incomplete confirmation", () => {
    const g = game();
    g.start();
    g.cmd(0, "answer.submit", { text: "a" });
    g.cmd(1, "answer.submit", { text: "b" });
    expect(g.cmd(0, "round.publish").ack.status).toBe("applied");
    g.cmd(0, "guessing.start");
    const mine = g.view().me.myAnonymousId!;
    expect(
      g.cmd(0, "prediction.save", { choices: { [mine]: g.ids[1] } }).ack
        .errorCode,
    ).toBe("INVALID_INPUT");
    expect(
      g.cmd(2, "prediction.save", { choices: { A: g.ids[0], B: g.ids[0] } }).ack
        .errorCode,
    ).toBe("INVALID_INPUT");
    const late = g.rooms.join("instance", {
      userId: "late",
      displayName: "late",
      username: "late",
    });
    expect(g.rooms.projection(g.roomId, late.memberId).me.guessEligible).toBe(
      false,
    );
    expect(g.cmd(0, "results.reveal").ack.errorCode).toBe("INCOMPLETE");
    expect(
      g.cmd(0, "results.reveal", { allowIncomplete: true }).ack.status,
    ).toBe("applied");
    expect(g.view(2).me.score).toEqual({ correct: 0, total: 2 });
  });
  it("isolates unpublished history, rooms and old sessions; maintains host and retention", () => {
    const g = game();
    g.start();
    const s = g.view().sessionId;
    expect(() =>
      g.rooms.history(
        g.roomId,
        g.ids[2],
        s,
        "topic",
        g.view().currentRound!.topicId,
      ),
    ).toThrow("NOT_FOUND");
    g.online.delete(g.ids[0]);
    g.rooms.presenceChanged(g.roomId);
    g.advance(60_001);
    g.rooms.maintain();
    expect(g.view(1).me.isHost).toBe(true);
    expect(g.cmd(0, "guessing.start").ack.errorCode).toBe("FORBIDDEN");
    expect(g.rooms.abortIfEmpty(g.roomId, s)).toBe(false);
    g.online.clear();
    g.rooms.presenceChanged(g.roomId);
    expect(g.rooms.abortIfEmpty(g.roomId, s)).toBe(true);
    expect(() =>
      g.rooms.history(g.roomId, g.ids[2], s, "respondent", "A"),
    ).toThrow("SESSION_CHANGED");
    g.online.clear();
    g.rooms.presenceChanged(g.roomId);
    g.advance(86_400_001);
    g.rooms.maintain();
    expect(() => g.rooms.room(g.roomId)).toThrow("NOT_FOUND");
  });
  it("enforces strict input and grapheme/byte limits", () => {
    expect(textLength("👨‍👩‍👧‍👦")).toBe(1);
    expect(validText("あ".repeat(140), 140)).toBe(true);
    expect(validText("あ".repeat(141), 140)).toBe(false);
    expect(validText("a" + "\u0301".repeat(4096), 140)).toBe(false);
    const g = game();
    const c = g.cmd(0, "topic.create", { text: "topic" }).command;
    expect(CommandSchema.safeParse({ ...c, actorId: g.ids[1] }).success).toBe(
      false,
    );
  });
});
describe("authentication and WebSocket boundary", () => {
  it("verifies the instance and consumes room-bound tickets exactly once", async () => {
    const db = openDatabase(":memory:");
    dispose.push(() => db.close());
    let now = 0;
    const auth = new Auth(
      db,
      {
        clientId: "app",
        clientSecret: "secret",
        botToken: "bot",
        devAuth: false,
      },
      () => now,
      (async () =>
        new Response(
          JSON.stringify({
            application_id: "app",
            instance_id: "i-test",
            users: ["u1"],
          }),
        )) as typeof fetch,
    );
    await auth.verify("i-test", "u1");
    await expect(auth.verify("i-test", "u2")).rejects.toThrow(
      "NOT_IN_INSTANCE",
    );
    const session = auth.issue({
      userId: "u1",
      displayName: "a",
      username: "a",
    });
    const verified = auth.bearer(`Bearer ${session.sessionToken}`),
      ticket = auth.ticket("room", "member", verified.tokenHash);
    expect(auth.consumeTicket(ticket.ticket).roomId).toBe("room");
    expect(() => auth.consumeTicket(ticket.ticket)).toThrow("UNAUTHENTICATED");
    now = 8 * 60 * 60 * 1000 + 1;
    expect(() => auth.bearer(`Bearer ${session.sessionToken}`)).toThrow(
      "AUTH_EXPIRED",
    );
  });
  it("publishes once for ten real WS clients, rejects foreign origins and has no production dev route", async () => {
    const server = await createApp({
      clientId: "test",
      clientSecret: "",
      botToken: "",
      devAuth: true,
      databasePath: ":memory:",
      allowedOrigin: "http://127.0.0.1:5173",
      maintenance: false,
    });
    dispose.push(() => server.app.close());
    const address = await server.app.listen({ host: "127.0.0.1", port: 0 });
    const connect = (origin: string) =>
      new Promise<WebSocket>((resolve, reject) => {
        const socket = new WebSocket(address.replace("http:", "ws:") + "/ws", {
          origin,
        });
        socket.once("open", () => resolve(socket));
        socket.once("error", reject);
      });
    const clients: {
      socket: import("ws").WebSocket;
      view: RoomView;
      messages: unknown[];
    }[] = [];
    dispose.push(() => {
      clients.forEach((c) => c.socket.terminate());
    });
    for (let i = 0; i < 10; i++) {
      const token = server.auth.issue({
        userId: `u${i}`,
        username: `u${i}`,
        displayName: `u${i}`,
      }).sessionToken;
      const headers = { authorization: `Bearer ${token}` };
      const joined = (
        await server.app.inject({
          method: "POST",
          url: "/api/rooms/join",
          headers,
          payload: { instanceId: "test" },
        })
      ).json();
      const ticket = (
        await server.app.inject({
          method: "POST",
          url: `/api/rooms/${joined.roomId}/ws-ticket`,
          headers,
        })
      ).json().ticket;
      const socket = await connect("http://127.0.0.1:5173");
      const client = {
        socket,
        view: undefined as unknown as RoomView,
        messages: [] as unknown[],
      };
      clients.push(client);
      socket.on("message", (data) => {
        const message = JSON.parse(data.toString());
        client.messages.push(message);
        if (message.type === "snapshot")
          client.view = RoomViewSchema.parse(message.view);
      });
      socket.send(JSON.stringify({ type: "authenticate", ticket }));
      await waitFor(() => !!client.view);
    }
    async function send(i: number, name: Command["name"], payload: object) {
      const c = clients[i],
        commandId = randomUUID();
      c.socket.send(
        JSON.stringify({
          type: "command",
          wireVersion: 1,
          commandId,
          sessionId: c.view.sessionId,
          name,
          payload,
        }),
      );
      await waitFor(() =>
        c.messages.some(
          (m: any) => m.type === "ack" && m.commandId === commandId,
        ),
      );
      const ack = c.messages.find(
        (m: any) => m.type === "ack" && m.commandId === commandId,
      ) as any;
      expect(ack.status).toBe("applied");
      await waitFor(() => c.view.revision >= ack.appliedRevision);
    }
    for (let i = 0; i < 10; i++)
      await send(i, "role.set", {
        role: "respondent",
        expectedMemberVersion: 0,
      });
    await send(0, "topic.create", { text: "question" });
    const v = clients[0].view;
    await send(0, "session.start", {
      hostEpoch: v.host.epoch,
      expectedPhaseVersion: v.phaseVersion,
      expectedQueueVersion: v.queueVersion,
    });
    await waitFor(() => clients.every((c) => c.view.phase === "ANSWERING"));
    await Promise.all(
      clients.map((c, i) =>
        send(i, "answer.submit", {
          topicId: c.view.currentRound!.topicId,
          expectedVersion: 0,
          text: `answer${i}`,
        }),
      ),
    );
    await waitFor(() =>
      clients.every(
        (c) =>
          c.view.phase === "ANSWERING" &&
          c.view.currentRound?.submittedCount === 10 &&
          c.view.currentRound.publishedAnswers === undefined,
      ),
    );
    const ready = clients[0].view;
    await send(0, "round.publish", {
      hostEpoch: ready.host.epoch,
      expectedPhaseVersion: ready.phaseVersion,
    });
    await waitFor(() => clients.every((c) => c.view.phase === "DISCUSSING"));
    expect(clients[0].view.phaseVersion).toBe(2);
    expect(clients[0].view.currentRound?.publishedAnswers).toHaveLength(10);
    await expect(connect("https://evil.invalid")).rejects.toThrow();
    const production = await createApp({
      clientId: "app",
      clientSecret: "s",
      botToken: "b",
      devAuth: false,
      databasePath: ":memory:",
      allowedOrigin: "https://app.discordsays.com",
      maintenance: false,
    });
    dispose.push(() => production.app.close());
    expect(
      (
        await production.app.inject({
          method: "POST",
          url: "/api/auth/dev",
          payload: { name: "a", user: "a" },
        })
      ).statusCode,
    ).toBe(404);
  });
});
async function waitFor(predicate: () => boolean) {
  const limit = Date.now() + 5000;
  while (!predicate()) {
    if (Date.now() > limit) throw new Error("Timed out");
    await new Promise((r) => setTimeout(r, 5));
  }
}
