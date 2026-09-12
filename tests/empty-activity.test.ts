import { test, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { createApp } from "../src/server/app";
import { CommandSchema } from "../src/shared/protocol";

test("all socket disconnects keep the game until Discord confirms an empty Activity", async () => {
  let users = ["one", "two"],
    status = 200;
  const service = await createApp({
    clientId: "app",
    clientSecret: "secret",
    botToken: "bot",
    devAuth: false,
    databasePath: ":memory:",
    allowedOrigin: "https://app.discordsays.com",
    maintenance: false,
    fetcher: async () =>
      new Response(
        status === 200
          ? JSON.stringify({
              application_id: "app",
              instance_id: "room",
              users,
            })
          : "",
        { status },
      ),
  });
  try {
    const { rooms } = service,
      live = new Set<string>();
    rooms.online = () => live;
    const members = users.map((userId) =>
        rooms.join("room", { userId, displayName: userId, username: userId }),
      ),
      roomId = members[0].roomId;
    members.forEach((m) => live.add(m.memberId));
    rooms.presenceChanged(roomId);
    function send(index: number, name: string, payload: object) {
      const v = rooms.projection(roomId, members[index].memberId);
      return rooms.execute(
        roomId,
        members[index].memberId,
        CommandSchema.parse({
          type: "command",
          wireVersion: 1,
          commandId: randomUUID(),
          sessionId: v.sessionId,
          name,
          payload,
        }),
      );
    }
    for (let i = 0; i < 2; i++)
      send(i, "role.set", { role: "respondent", expectedMemberVersion: 0 });
    send(0, "topic.create", { text: "お題" });
    const v = rooms.projection(roomId, members[0].memberId);
    expect(
      send(0, "session.start", {
        hostEpoch: v.host.epoch,
        expectedPhaseVersion: v.phaseVersion,
        expectedQueueVersion: v.queueVersion,
      }).status,
    ).toBe("applied");
    live.clear();
    rooms.presenceChanged(roomId);
    await service.validateEmptyRooms();
    expect(rooms.session(rooms.room(roomId)).phase).toBe("ANSWERING");
    status = 503;
    await service.validateEmptyRooms();
    expect(rooms.room(roomId).current_session_id).toBe(v.sessionId);
    status = 403;
    await service.validateEmptyRooms();
    expect(rooms.room(roomId).current_session_id).toBe(v.sessionId);
    status = 200;
    users = [];
    await service.validateEmptyRooms();
    expect(rooms.session(rooms.room(roomId)).phase).toBe("LOBBY");
    expect(rooms.room(roomId).current_session_id).not.toBe(v.sessionId);
    expect(
      service.db
        .prepare("SELECT phase FROM sessions WHERE session_id=?")
        .get(v.sessionId),
    ).toEqual({ phase: "ABORTED" });
  } finally {
    await service.app.close();
  }
});
