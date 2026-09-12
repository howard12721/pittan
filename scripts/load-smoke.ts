import { randomUUID } from "node:crypto";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { monitorEventLoopDelay, performance } from "node:perf_hooks";
import { WebSocket } from "ws";
import { createApp } from "../src/server/app.js";
import type { CommandName, RoomView } from "../src/shared/protocol.js";

// Local transport/load check. Discord OAuth and proxy latency are outside this measurement.
const directory = await mkdtemp(join(tmpdir(), "pittan-load-"));
const service = await createApp({
  clientId: "load-test",
  clientSecret: "",
  botToken: "",
  devAuth: true,
  databasePath: join(directory, "game.sqlite"),
  allowedOrigin: "http://localhost",
  maintenance: false,
});
const clients: {
  socket: WebSocket;
  view: RoomView;
  acks: Map<string, (value: any) => void>;
}[] = [];
let bytes = 0;
const commits: number[] = [];
const execute = service.rooms.execute.bind(service.rooms);
service.rooms.execute = (...args) => {
  const start = performance.now();
  const ack = execute(...args);
  commits.push(performance.now() - start);
  return ack;
};
const lag = monitorEventLoopDelay({ resolution: 10 });
lag.enable();
const until = async (check: () => boolean) => {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > 15_000) throw Error("Load check timeout");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
};
try {
  const address = await service.app.listen({ host: "127.0.0.1", port: 0 });
  for (let room = 0; room < 10; room++) {
    for (let member = 0; member < 32; member++) {
      const userId = `r${room}-u${member}`;
      const token = service.auth.issue({
        userId,
        displayName: userId,
        username: userId,
      }).sessionToken;
      const auth = service.auth.bearer(`Bearer ${token}`);
      const joined = service.rooms.join(`load-${room}`, auth);
      const ticket = service.auth.ticket(
        joined.roomId,
        joined.memberId,
        auth.tokenHash,
      ).ticket;
      const socket = new WebSocket(address.replace("http:", "ws:") + "/ws", {
        origin: "http://localhost",
      });
      const client = {
        socket,
        view: undefined as unknown as RoomView,
        acks: new Map<string, (value: any) => void>(),
      };
      clients.push(client);
      socket.on("message", (raw) => {
        bytes += Buffer.byteLength(raw.toString());
        const data = JSON.parse(raw.toString());
        if (data.type === "snapshot") client.view = data.view;
        else if (data.type === "ack") {
          client.acks.get(data.commandId)?.(data);
          client.acks.delete(data.commandId);
        }
      });
      await new Promise<void>((resolve, reject) => {
        socket.once("open", resolve);
        socket.once("error", reject);
      });
      socket.send(JSON.stringify({ type: "authenticate", ticket }));
      await until(() => !!client.view);
    }
  }
  async function send(index: number, name: CommandName, payload: object) {
    const client = clients[index],
      commandId = randomUUID();
    const ack = new Promise<any>((resolve, reject) => {
      const timer = setTimeout(() => reject(Error("ACK timeout")), 15_000);
      client.acks.set(commandId, (value) => {
        clearTimeout(timer);
        resolve(value);
      });
    });
    client.socket.send(
      JSON.stringify({
        type: "command",
        wireVersion: 1,
        commandId,
        sessionId: client.view.sessionId,
        name,
        payload,
      }),
    );
    const result = await ack;
    if (result.status !== "applied") throw Error(result.errorCode);
    await until(() => client.view.revision >= result.appliedRevision);
  }
  for (let room = 0; room < 10; room++) {
    const host = room * 32;
    for (let member = 0; member < 10; member++)
      await send(host + member, "role.set", {
        role: "respondent",
        expectedMemberVersion: 0,
      });
    await send(host, "topic.create", { text: "負荷試験のお題" });
    const v = clients[host].view;
    await send(host, "session.start", {
      hostEpoch: v.host.epoch,
      expectedPhaseVersion: v.phaseVersion,
      expectedQueueVersion: v.queueVersion,
    });
  }
  await until(() => clients.every((c) => c.view.phase === "ANSWERING"));
  lag.reset();
  bytes = 0;
  commits.length = 0;
  const started = performance.now();
  await Promise.all(
    Array.from({ length: 100 }, (_, index) => {
      const i = Math.floor(index / 10) * 32 + (index % 10);
      return send(i, "answer.submit", {
        topicId: clients[i].view.currentRound!.topicId,
        expectedVersion: 0,
        text: "試験回答",
      });
    }),
  );
  await until(() =>
    Array.from({ length: 10 }, (_, room) => clients[room * 32]).every(
      (client) =>
        client.view.phase === "ANSWERING" &&
        client.view.currentRound?.submittedCount === 10,
    ),
  );
  await Promise.all(
    Array.from({ length: 10 }, (_, room) => {
      const host = room * 32,
        view = clients[host].view;
      return send(host, "round.publish", {
        hostEpoch: view.host.epoch,
        expectedPhaseVersion: view.phaseVersion,
      });
    }),
  );
  await until(() =>
    clients.every(
      (c) =>
        c.view.phase === "DISCUSSING" &&
        c.view.currentRound?.publishedAnswers?.length === 10,
    ),
  );
  const elapsed = performance.now() - started;
  await new Promise((resolve) => setTimeout(resolve, 20));
  const sorted = commits.toSorted((a, b) => a - b);
  const result = {
    measuredAt: new Date().toISOString(),
    platform: process.platform,
    arch: process.arch,
    node: process.version,
    rooms: 10,
    sockets: clients.length,
    simultaneousSubmissions: 100,
    elapsedMs: elapsed,
    commandCommitP95Ms: sorted[Math.ceil(sorted.length * 0.95) - 1],
    eventLoopP95Ms: lag.percentile(95) / 1e6,
    rssMiB: process.memoryUsage().rss / 1024 ** 2,
    receivedBytes: bytes,
    consistentSnapshots: true,
    scope:
      "Local TCP WS + real SQLite WAL. HTTP/OAuth/proxy excluded. RSS includes test clients.",
  };
  if (result.commandCommitP95Ms > 50)
    throw Error(`Commit p95 exceeded 50ms: ${result.commandCommitP95Ms}`);
  await mkdir("output/verification", { recursive: true });
  await writeFile(
    "output/verification/load.json",
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result, null, 2));
} finally {
  lag.disable();
  clients.forEach((c) => c.socket.terminate());
  await service.app.close();
  await rm(directory, { recursive: true, force: true });
}
