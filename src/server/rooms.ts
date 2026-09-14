import { createHash, randomUUID } from "node:crypto";
import { all, one, run, type DB } from "./db.js";
import { GameError, requireCondition as check } from "./errors.js";
import { assignIdentities, scoreChoices, validateChoices } from "./game.js";
import { initial } from "../shared/text.js";
import {
  type Ack,
  type AnonymousId,
  type Choices,
  type Command,
  type HistoryView,
  type Phase,
  type Role,
  type RoomView,
} from "../shared/protocol.js";

export type Profile = {
  userId: string;
  displayName: string;
  username: string;
  avatarUrl?: string;
};
export type Room = {
  room_id: string;
  instance_id: string;
  current_session_id: string;
  host_member_id: string;
  host_epoch: number;
  revision: number;
  empty_since: number | null;
  host_missing_since: number | null;
};
type Session = {
  session_id: string;
  phase: Phase;
  current_topic_id: string | null;
  phase_version: number;
  queue_version: number;
  history_version: number;
};
type Member = {
  member_id: string;
  discord_user_id: string;
  display_name: string;
  username: string;
  avatar_url: string | null;
  lobby_role: Role;
  version: number;
  joined_at: number;
};
type Seat = {
  member_id: string;
  role: Role;
  anonymous_id: AnonymousId | null;
  display_name: string;
  username: string;
  avatar_url: string | null;
  guess_eligible: number;
};
type Topic = {
  topic_id: string;
  text: string;
  status: "queued" | "current" | "published" | "deleted";
  queue_position: number;
  round_number: number | null;
};
type Answer = {
  member_id: string;
  text: string;
  submitted: number;
  version: number;
};
type Prediction = {
  completed: number;
  version: number;
  score: number | null;
  score_total: number | null;
};

export class Rooms {
  constructor(
    public db: DB,
    public applicationId: string,
    public online: (roomId: string) => Set<string>,
    public now = Date.now,
  ) {}
  room(roomId: string) {
    const room = one<Room>(
      this.db,
      "SELECT * FROM rooms WHERE room_id=?",
      roomId,
    );
    check(room, "NOT_FOUND", 404);
    return room;
  }
  session(room: Room) {
    const s = one<Session>(
      this.db,
      "SELECT * FROM sessions WHERE session_id=? AND room_id=?",
      room.current_session_id,
      room.room_id,
    );
    check(s, "NOT_FOUND", 404);
    return s;
  }
  member(roomId: string, memberId: string) {
    const m = one<Member>(
      this.db,
      "SELECT * FROM room_members WHERE room_id=? AND member_id=?",
      roomId,
      memberId,
    );
    check(m, "FORBIDDEN", 403);
    return m;
  }
  members(roomId: string) {
    return all<Member>(
      this.db,
      "SELECT * FROM room_members WHERE room_id=? ORDER BY display_name,member_id",
      roomId,
    );
  }
  seats(sessionId: string) {
    return all<Seat>(
      this.db,
      "SELECT * FROM session_members WHERE session_id=? ORDER BY display_name,member_id",
      sessionId,
    );
  }
  topics(sessionId: string) {
    return all<Topic>(
      this.db,
      "SELECT * FROM topics WHERE session_id=? ORDER BY queue_position,topic_id",
      sessionId,
    );
  }
  choices(sessionId: string, memberId: string): Choices {
    return Object.fromEntries(
      all<{ anonymous_id: AnonymousId; target_member_id: string | null }>(
        this.db,
        "SELECT anonymous_id,target_member_id FROM predictions WHERE session_id=? AND guesser_member_id=?",
        sessionId,
        memberId,
      ).map((p) => [p.anonymous_id, p.target_member_id]),
    );
  }
  bump(roomId: string) {
    run(
      this.db,
      "UPDATE rooms SET revision=revision+1 WHERE room_id=?",
      roomId,
    );
  }
  join(instanceId: string, profile: Profile) {
    return this.db.transaction(() => {
      let room = one<Room>(
        this.db,
        "SELECT * FROM rooms WHERE application_id=? AND instance_id=?",
        this.applicationId,
        instanceId,
      );
      const memberId = randomUUID();
      if (!room) {
        const roomId = randomUUID(),
          sessionId = randomUUID();
        run(
          this.db,
          "INSERT INTO rooms(room_id,application_id,instance_id,current_session_id,host_member_id,empty_since) VALUES(?,?,?,?,?,?)",
          roomId,
          this.applicationId,
          instanceId,
          sessionId,
          memberId,
          this.now(),
        );
        run(
          this.db,
          "INSERT INTO sessions(session_id,room_id) VALUES(?,?)",
          sessionId,
          roomId,
        );
        room = this.room(roomId);
      }
      const existing = one<Member>(
        this.db,
        "SELECT * FROM room_members WHERE room_id=? AND discord_user_id=?",
        room.room_id,
        profile.userId,
      );
      const s = this.session(room);
      const seats = this.seats(s.session_id);
      const id = existing?.member_id ?? memberId;
      if (s.phase === "LOBBY")
        check(
          this.online(room.room_id).has(id) ||
            this.online(room.room_id).size < 32,
          "ROOM_FULL",
        );
      else
        check(
          seats.some((x) => x.member_id === id) || seats.length < 32,
          "ROOM_FULL",
        );
      if (existing)
        run(
          this.db,
          "UPDATE room_members SET display_name=?,username=?,avatar_url=? WHERE member_id=?",
          profile.displayName,
          profile.username,
          profile.avatarUrl ?? null,
          id,
        );
      else
        run(
          this.db,
          "INSERT INTO room_members(member_id,room_id,discord_user_id,display_name,username,joined_at,avatar_url) VALUES(?,?,?,?,?,?,?)",
          id,
          room.room_id,
          profile.userId,
          profile.displayName,
          profile.username,
          this.now(),
          profile.avatarUrl ?? null,
        );
      if (s.phase !== "LOBBY" && !seats.some((x) => x.member_id === id)) {
        run(
          this.db,
          "INSERT INTO session_members(session_id,member_id,role,display_name,username,avatar_url) VALUES(?,?,'viewer',?,?,?)",
          s.session_id,
          id,
          profile.displayName,
          profile.username,
          profile.avatarUrl ?? null,
        );
      }
      this.bump(room.room_id);
      return {
        roomId: room.room_id,
        memberId: id,
        currentSessionId: s.session_id,
      };
    })();
  }
  projection(roomId: string, memberId: string): RoomView {
    const room = this.room(roomId),
      s = this.session(room),
      member = this.member(roomId, memberId);
    const live = this.online(roomId),
      seats = this.seats(s.session_id),
      mySeat = seats.find((x) => x.member_id === memberId);
    const respondents = seats.filter((x) => x.role === "respondent");
    const identities = respondents
      .map((x) => ({ memberId: x.member_id, anonymousId: x.anonymous_id! }))
      .sort((a, b) => a.anonymousId.localeCompare(b.anonymousId));
    const topics = this.topics(s.session_id).filter(
      (t) => t.status !== "deleted",
    );
    const current = topics.find((t) => t.topic_id === s.current_topic_id);
    const answers = current
      ? all<Answer>(
          this.db,
          "SELECT * FROM answers WHERE session_id=? AND topic_id=?",
          s.session_id,
          current.topic_id,
        )
      : [];
    const submission = answers.find((a) => a.member_id === memberId);
    const p = one<Prediction>(
      this.db,
      "SELECT * FROM prediction_status WHERE session_id=? AND member_id=?",
      s.session_id,
      memberId,
    );
    const completedCount = one<{ n: number }>(
      this.db,
      "SELECT count(*) AS n FROM prediction_status WHERE session_id=? AND completed=1",
      s.session_id,
    )!.n;
    const revealedPredictions =
      s.phase === "REVEALED"
        ? all<Prediction & { member_id: string }>(
            this.db,
            "SELECT * FROM prediction_status WHERE session_id=? ORDER BY member_id",
            s.session_id,
          )
        : [];
    const publicMembers =
      s.phase === "LOBBY"
        ? this.members(roomId)
            .filter((m) => live.has(m.member_id) || m.member_id === memberId)
            .map((m) => ({
              memberId: m.member_id,
              displayName: m.display_name,
              avatarInitial: initial(m.display_name),
              avatarUrl: m.avatar_url ?? undefined,
              role: m.lobby_role,
              online: live.has(m.member_id),
            }))
        : seats.map((m) => ({
            memberId: m.member_id,
            displayName: m.display_name,
            avatarInitial: initial(m.display_name),
            avatarUrl: m.avatar_url ?? undefined,
            role: m.role,
            online: live.has(m.member_id),
          }));
    let queuedNumber = topics.filter((t) => t.round_number !== null).length;
    return {
      wireVersion: 1,
      roomId,
      revision: room.revision,
      serverTime: this.now(),
      sessionId: s.session_id,
      phase: s.phase,
      phaseVersion: s.phase_version,
      queueVersion: s.queue_version,
      historyVersion: s.history_version,
      host: { memberId: room.host_member_id, epoch: room.host_epoch },
      members: publicMembers,
      respondents: respondents.map((m) => ({
        memberId: m.member_id,
        displayName: m.display_name,
        username: m.username,
        avatarInitial: initial(m.display_name),
        avatarUrl: m.avatar_url ?? undefined,
      })),
      identities: identities.map((i) => ({ anonymousId: i.anonymousId })),
      topics: topics.map((t) => ({
        topicId: t.topic_id,
        text: t.text,
        status: t.status as "queued" | "current" | "published",
        displayNumber: t.round_number ?? ++queuedNumber,
        roundNumber: t.round_number,
      })),
      currentRound: current
        ? {
            topicId: current.topic_id,
            roundNumber: current.round_number!,
            submittedCount: answers.filter((a) => a.submitted).length,
            requiredCount: respondents.length,
            ...(current.status === "published"
              ? {
                  publishedAnswers: identities.map((i) => ({
                    anonymousId: i.anonymousId,
                    text:
                      answers.find((a) => a.member_id === i.memberId)?.text ??
                      "",
                  })),
                }
              : {}),
          }
        : null,
      guessing: {
        eligibleCount: seats.filter((m) => m.guess_eligible).length,
        completedCount,
      },
      ...(s.phase === "REVEALED"
        ? {
            result: {
              identities,
              predictions: revealedPredictions.map((prediction) => ({
                memberId: prediction.member_id,
                choices: this.choices(s.session_id, prediction.member_id),
                score: {
                  correct: prediction.score ?? 0,
                  total: prediction.score_total ?? 0,
                },
              })),
            },
          }
        : {}),
      me: {
        memberId,
        memberVersion: member.version,
        role: s.phase === "LOBBY" ? member.lobby_role : mySeat!.role,
        isHost: room.host_member_id === memberId,
        guessEligible: !!mySeat?.guess_eligible,
        ...(mySeat?.anonymous_id ? { myAnonymousId: mySeat.anonymous_id } : {}),
        ...(submission && current
          ? {
              submission: {
                topicId: current.topic_id,
                text: submission.text,
                submitted: !!submission.submitted,
                version: submission.version,
              },
            }
          : {}),
        ...(p
          ? {
              prediction: {
                choices: this.choices(s.session_id, memberId),
                completed: !!p.completed,
                version: p.version,
              },
            }
          : {}),
        ...(s.phase === "REVEALED" && p && p.score !== null
          ? { score: { correct: p.score, total: p.score_total! } }
          : {}),
      },
    };
  }
  history(
    roomId: string,
    memberId: string,
    sessionId: string,
    view: "topic" | "respondent",
    subject: string,
    cursor = 0,
    limit = 20,
  ): HistoryView {
    const room = this.room(roomId);
    this.member(roomId, memberId);
    check(room.current_session_id === sessionId, "SESSION_CHANGED");
    const s = this.session(room),
      seats = this.seats(sessionId),
      revealed = s.phase === "REVEALED";
    check(
      seats.some((m) => m.member_id === memberId),
      "FORBIDDEN",
      403,
    );
    const respondents = seats
      .filter((x) => x.role === "respondent")
      .sort((a, b) => a.anonymous_id!.localeCompare(b.anonymous_id!));
    const topics = this.topics(sessionId)
      .filter((t) => t.status === "published")
      .sort((a, b) => b.round_number! - a.round_number!);
    if (view === "topic")
      check(
        topics.some((t) => t.topic_id === subject),
        "NOT_FOUND",
        404,
      );
    else
      check(
        respondents.some((m) => m.anonymous_id === subject),
        "NOT_FOUND",
        404,
      );
    const selected =
      view === "topic"
        ? topics.filter((t) => t.topic_id === subject)
        : topics.slice(cursor, cursor + limit);
    return {
      sessionId,
      historyVersion: s.history_version,
      visibility: revealed ? "revealed" : "anonymous",
      view,
      subject,
      nextCursor:
        view === "respondent" && cursor + limit < topics.length
          ? cursor + limit
          : null,
      entries: selected.map((t) => ({
        topicId: t.topic_id,
        roundNumber: t.round_number!,
        question: t.text,
        answers: respondents
          .filter((m) => view === "topic" || m.anonymous_id === subject)
          .map((m) => {
            const answer = one<Answer>(
              this.db,
              "SELECT * FROM answers WHERE topic_id=? AND session_id=? AND member_id=? AND submitted=1",
              t.topic_id,
              sessionId,
              m.member_id,
            )!;
            return {
              anonymousId: m.anonymous_id!,
              text: answer.text,
              ...(revealed
                ? {
                    memberId: m.member_id,
                    displayName: m.display_name,
                    avatarInitial: initial(m.display_name),
                    avatarUrl: m.avatar_url ?? undefined,
                  }
                : {}),
            };
          }),
      })),
    };
  }
  execute(roomId: string, memberId: string, command: Command): Ack {
    const base = {
      type: "ack" as const,
      wireVersion: 1 as const,
      commandId: command.commandId,
    };
    try {
      return this.db.transaction((): Ack => {
        const hash = createHash("sha256")
          .update(JSON.stringify(command))
          .digest("hex");
        const receipt = one<{ request_hash: string; applied_revision: number }>(
          this.db,
          "SELECT * FROM command_receipts WHERE room_id=? AND session_id=? AND member_id=? AND command_id=?",
          roomId,
          command.sessionId,
          memberId,
          command.commandId,
        );
        if (receipt) {
          check(receipt.request_hash === hash, "COMMAND_ID_REUSED");
          return {
            ...base,
            status: "applied",
            appliedRevision: receipt.applied_revision,
          };
        }
        const room = this.room(roomId),
          s = this.session(room),
          member = this.member(roomId, memberId);
        check(s.session_id === command.sessionId, "SESSION_CHANGED");
        const payload = command.payload;
        if ("hostEpoch" in payload)
          check(
            room.host_member_id === memberId &&
              room.host_epoch === payload.hostEpoch,
            "FORBIDDEN",
            403,
          );
        if ("expectedPhaseVersion" in payload)
          check(
            s.phase_version === payload.expectedPhaseVersion,
            "PHASE_CHANGED",
          );
        if ("expectedQueueVersion" in payload)
          check(
            s.queue_version === payload.expectedQueueVersion,
            "VERSION_CONFLICT",
          );
        const seats = this.seats(s.session_id),
          seat = seats.find((x) => x.member_id === memberId);
        const inPhase = (...phases: Phase[]) =>
          check(phases.includes(s.phase), "PHASE_CHANGED");
        const queueChanged = () =>
          run(
            this.db,
            "UPDATE sessions SET queue_version=queue_version+1 WHERE session_id=?",
            s.session_id,
          );
        const nextRound = () => {
          const next = this.topics(s.session_id).find(
            (t) => t.status === "queued",
          );
          check(next, "INVALID_INPUT");
          const number =
            this.topics(s.session_id).filter((t) => t.round_number !== null)
              .length + 1;
          run(
            this.db,
            "UPDATE topics SET status='current',round_number=?,version=version+1 WHERE topic_id=?",
            number,
            next.topic_id,
          );
          run(
            this.db,
            "UPDATE sessions SET phase='ANSWERING',current_topic_id=?,phase_version=phase_version+1,queue_version=queue_version+1 WHERE session_id=?",
            next.topic_id,
            s.session_id,
          );
        };
        switch (command.name) {
          case "role.set": {
            inPhase("LOBBY");
            check(
              member.version === command.payload.expectedMemberVersion,
              "VERSION_CONFLICT",
            );
            const count = this.members(roomId).filter(
              (m) =>
                m.member_id !== memberId &&
                m.lobby_role === "respondent" &&
                this.online(roomId).has(m.member_id),
            ).length;
            check(
              command.payload.role === "viewer" || count < 10,
              "RESPONDENTS_FULL",
            );
            run(
              this.db,
              "UPDATE room_members SET lobby_role=?,version=version+1 WHERE member_id=?",
              command.payload.role,
              memberId,
            );
            break;
          }
          case "topic.create": {
            inPhase("LOBBY", "ANSWERING", "DISCUSSING");
            const topics = this.topics(s.session_id);
            check(topics.length < 50, "TOPIC_LIMIT");
            run(
              this.db,
              "INSERT INTO topics(topic_id,session_id,author_member_id,text,queue_position) VALUES(?,?,?,?,?)",
              randomUUID(),
              s.session_id,
              memberId,
              command.payload.text,
              Math.max(-1, ...topics.map((t) => t.queue_position)) + 1,
            );
            queueChanged();
            break;
          }
          case "topic.delete": {
            inPhase("LOBBY", "ANSWERING", "DISCUSSING");
            check(
              this.topics(s.session_id).some(
                (t) =>
                  t.topic_id === command.payload.topicId &&
                  t.status === "queued",
              ),
              "INVALID_INPUT",
            );
            run(
              this.db,
              "UPDATE topics SET status='deleted',version=version+1 WHERE topic_id=?",
              command.payload.topicId,
            );
            queueChanged();
            break;
          }
          case "topic.reorder": {
            inPhase("LOBBY", "ANSWERING", "DISCUSSING");
            const queued = this.topics(s.session_id).filter(
                (t) => t.status === "queued",
              ),
              ids = command.payload.orderedTopicIds;
            check(
              ids.length === queued.length &&
                new Set(ids).size === ids.length &&
                ids.every((id) => queued.some((t) => t.topic_id === id)),
              "INVALID_INPUT",
            );
            const start = Math.min(...queued.map((t) => t.queue_position));
            ids.forEach((id, i) =>
              run(
                this.db,
                "UPDATE topics SET queue_position=?,version=version+1 WHERE topic_id=?",
                start + i,
                id,
              ),
            );
            queueChanged();
            break;
          }
          case "session.start": {
            inPhase("LOBBY");
            const live = this.members(roomId).filter((m) =>
              this.online(roomId).has(m.member_id),
            );
            const respondents = live.filter(
              (m) => m.lobby_role === "respondent",
            );
            check(
              respondents.length >= 2 &&
                respondents.length <= 10 &&
                live.length <= 32,
              "INVALID_INPUT",
            );
            const identities = assignIdentities(
              respondents.map((m) => m.member_id),
            );
            for (const m of live)
              run(
                this.db,
                "INSERT INTO session_members(session_id,member_id,role,anonymous_id,display_name,username,avatar_url) VALUES(?,?,?,?,?,?,?)",
                s.session_id,
                m.member_id,
                m.lobby_role,
                identities.find((i) => i.memberId === m.member_id)
                  ?.anonymousId ?? null,
                m.display_name,
                m.username,
                m.avatar_url,
              );
            run(
              this.db,
              "UPDATE sessions SET started_at=? WHERE session_id=?",
              this.now(),
              s.session_id,
            );
            nextRound();
            break;
          }
          case "answer.submit":
          case "answer.withdraw": {
            inPhase("ANSWERING");
            check(seat?.role === "respondent", "FORBIDDEN", 403);
            check(
              command.payload.topicId === s.current_topic_id,
              "INVALID_INPUT",
            );
            const answer = one<Answer>(
              this.db,
              "SELECT * FROM answers WHERE topic_id=? AND member_id=?",
              s.current_topic_id,
              memberId,
            );
            check(
              (answer?.version ?? 0) === command.payload.expectedVersion,
              "VERSION_CONFLICT",
            );
            if (command.name === "answer.submit") {
              check(!answer?.submitted, "INVALID_INPUT");
              run(
                this.db,
                "INSERT INTO answers(session_id,topic_id,member_id,text,submitted,version) VALUES(?,?,?,?,1,1) ON CONFLICT(topic_id,member_id) DO UPDATE SET text=excluded.text,submitted=1,version=answers.version+1",
                s.session_id,
                s.current_topic_id,
                memberId,
                command.payload.text,
              );
            } else {
              check(answer?.submitted, "INVALID_INPUT");
              run(
                this.db,
                "UPDATE answers SET submitted=0,version=version+1 WHERE topic_id=? AND member_id=?",
                s.current_topic_id,
                memberId,
              );
            }
            break;
          }
          case "round.publish": {
            inPhase("ANSWERING");
            const submitted = one<{ n: number }>(
              this.db,
              "SELECT count(*) AS n FROM answers WHERE topic_id=? AND submitted=1",
              s.current_topic_id,
            )!.n;
            check(
              submitted === seats.filter((x) => x.role === "respondent").length,
              "INCOMPLETE",
            );
            run(
              this.db,
              "UPDATE topics SET status='published',version=version+1 WHERE topic_id=?",
              s.current_topic_id,
            );
            run(
              this.db,
              "UPDATE sessions SET phase='DISCUSSING',phase_version=phase_version+1,history_version=history_version+1 WHERE session_id=?",
              s.session_id,
            );
            break;
          }
          case "round.next":
            inPhase("DISCUSSING");
            nextRound();
            break;
          case "guessing.start": {
            inPhase("DISCUSSING");
            for (const m of seats.filter((m) =>
              this.online(roomId).has(m.member_id),
            )) {
              run(
                this.db,
                "UPDATE session_members SET guess_eligible=1 WHERE session_id=? AND member_id=?",
                s.session_id,
                m.member_id,
              );
              run(
                this.db,
                "INSERT INTO prediction_status(session_id,member_id) VALUES(?,?)",
                s.session_id,
                m.member_id,
              );
              for (const respondent of seats.filter(
                (x) => x.role === "respondent",
              ))
                run(
                  this.db,
                  "INSERT INTO predictions VALUES(?,?,?,?)",
                  s.session_id,
                  m.member_id,
                  respondent.anonymous_id,
                  respondent.member_id === m.member_id ? m.member_id : null,
                );
            }
            run(
              this.db,
              "UPDATE sessions SET phase='GUESSING',phase_version=phase_version+1 WHERE session_id=?",
              s.session_id,
            );
            break;
          }
          case "prediction.save":
          case "prediction.complete":
          case "prediction.reopen": {
            inPhase("GUESSING");
            check(seat?.guess_eligible, "FORBIDDEN", 403);
            const p = one<Prediction>(
              this.db,
              "SELECT * FROM prediction_status WHERE session_id=? AND member_id=?",
              s.session_id,
              memberId,
            )!;
            check(
              p.version === command.payload.expectedVersion,
              "VERSION_CONFLICT",
            );
            if (command.name === "prediction.reopen") {
              check(p.completed, "INVALID_INPUT");
              run(
                this.db,
                "UPDATE prediction_status SET completed=0,version=version+1 WHERE session_id=? AND member_id=?",
                s.session_id,
                memberId,
              );
            } else {
              check(!p.completed, "INVALID_INPUT");
              const identities = seats
                .filter((x) => x.role === "respondent")
                .map((x) => ({
                  memberId: x.member_id,
                  anonymousId: x.anonymous_id!,
                }));
              const choices = validateChoices(
                command.payload.choices,
                identities,
                memberId,
                command.name === "prediction.complete",
              );
              run(
                this.db,
                "DELETE FROM predictions WHERE session_id=? AND guesser_member_id=?",
                s.session_id,
                memberId,
              );
              for (const [id, target] of Object.entries(choices))
                run(
                  this.db,
                  "INSERT INTO predictions VALUES(?,?,?,?)",
                  s.session_id,
                  memberId,
                  id,
                  target,
                );
              run(
                this.db,
                "UPDATE prediction_status SET completed=?,version=version+1 WHERE session_id=? AND member_id=?",
                command.name === "prediction.complete" ? 1 : 0,
                s.session_id,
                memberId,
              );
            }
            break;
          }
          case "results.reveal": {
            inPhase("GUESSING");
            const predictions = all<Prediction & { member_id: string }>(
              this.db,
              "SELECT * FROM prediction_status WHERE session_id=?",
              s.session_id,
            );
            check(
              command.payload.allowIncomplete ||
                predictions.every((p) => p.completed),
              "INCOMPLETE",
            );
            const identities = seats
              .filter((x) => x.role === "respondent")
              .map((x) => ({
                memberId: x.member_id,
                anonymousId: x.anonymous_id!,
              }));
            for (const p of predictions) {
              const score = scoreChoices(
                this.choices(s.session_id, p.member_id),
                identities,
                p.member_id,
              );
              run(
                this.db,
                "UPDATE prediction_status SET score=?,score_total=? WHERE session_id=? AND member_id=?",
                score.correct,
                score.total,
                s.session_id,
                p.member_id,
              );
            }
            run(
              this.db,
              "UPDATE sessions SET phase='REVEALED',phase_version=phase_version+1,history_version=history_version+1,revealed_at=? WHERE session_id=?",
              this.now(),
              s.session_id,
            );
            break;
          }
          case "session.restart": {
            inPhase("REVEALED");
            run(
              this.db,
              "UPDATE sessions SET retired_at=? WHERE session_id=?",
              this.now(),
              s.session_id,
            );
            const id = randomUUID();
            run(
              this.db,
              "INSERT INTO sessions(session_id,room_id) VALUES(?,?)",
              id,
              roomId,
            );
            run(
              this.db,
              "UPDATE rooms SET current_session_id=? WHERE room_id=?",
              id,
              roomId,
            );
            break;
          }
        }
        this.bump(roomId);
        const revision = this.room(roomId).revision;
        run(
          this.db,
          "INSERT INTO command_receipts VALUES(?,?,?,?,?,'applied',?)",
          roomId,
          s.session_id,
          memberId,
          command.commandId,
          hash,
          revision,
        );
        return { ...base, status: "applied", appliedRevision: revision };
      })();
    } catch (error) {
      return {
        ...base,
        status: "rejected",
        errorCode:
          error instanceof GameError ? error.code : "STORAGE_UNAVAILABLE",
      };
    }
  }
  presenceChanged(roomId: string) {
    this.db.transaction(() => {
      const room = this.room(roomId),
        live = this.online(roomId);
      run(
        this.db,
        "UPDATE rooms SET empty_since=?,host_missing_since=? WHERE room_id=?",
        live.size ? null : (room.empty_since ?? this.now()),
        live.has(room.host_member_id)
          ? null
          : (room.host_missing_since ?? this.now()),
        roomId,
      );
      this.bump(roomId);
    })();
  }
  abortIfEmpty(roomId: string, sessionId: string) {
    return this.db.transaction(() => {
      const room = this.room(roomId),
        session = this.session(room);
      if (
        this.online(roomId).size ||
        session.session_id !== sessionId ||
        !["ANSWERING", "DISCUSSING", "GUESSING"].includes(session.phase)
      )
        return false;
      run(
        this.db,
        "UPDATE sessions SET phase='ABORTED',retired_at=? WHERE session_id=?",
        this.now(),
        sessionId,
      );
      const next = randomUUID();
      run(
        this.db,
        "INSERT INTO sessions(session_id,room_id) VALUES(?,?)",
        next,
        roomId,
      );
      run(
        this.db,
        "UPDATE rooms SET current_session_id=?,revision=revision+1 WHERE room_id=?",
        next,
        roomId,
      );
      return true;
    })();
  }
  maintain() {
    return this.db.transaction(() => {
      const changed: string[] = [],
        now = this.now();
      for (const room of all<Room>(this.db, "SELECT * FROM rooms")) {
        const live = this.online(room.room_id);
        if (
          room.empty_since !== null &&
          now - room.empty_since >= 86_400_000 &&
          !live.size
        ) {
          run(this.db, "DELETE FROM rooms WHERE room_id=?", room.room_id);
          continue;
        }
        if (
          !live.has(room.host_member_id) &&
          room.host_missing_since !== null &&
          now - room.host_missing_since >= 60_000
        ) {
          const next = all<Member>(
            this.db,
            "SELECT * FROM room_members WHERE room_id=? ORDER BY joined_at,rowid",
            room.room_id,
          ).find((m) => live.has(m.member_id));
          if (next) {
            run(
              this.db,
              "UPDATE rooms SET host_member_id=?,host_epoch=host_epoch+1,host_missing_since=NULL,revision=revision+1 WHERE room_id=?",
              next.member_id,
              room.room_id,
            );
            changed.push(room.room_id);
          }
        }
      }
      run(
        this.db,
        "DELETE FROM sessions WHERE retired_at IS NOT NULL AND retired_at < ?",
        now - 86_400_000,
      );
      run(this.db, "DELETE FROM auth_sessions WHERE expires_at < ?", now);
      return changed;
    })();
  }
}
