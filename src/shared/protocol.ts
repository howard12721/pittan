import { z } from "zod";
import { normalizeText, validText } from "./text.js";

export const WIRE_VERSION = 1 as const;
export const ANONYMOUS_IDS = [
  "A",
  "B",
  "C",
  "D",
  "E",
  "F",
  "G",
  "H",
  "I",
  "J",
] as const;
export const Id = z.uuid();
export const AnonymousId = z.enum(ANONYMOUS_IDS);
export type AnonymousId = z.infer<typeof AnonymousId>;
export const Role = z.enum(["respondent", "viewer"]);
export type Role = z.infer<typeof Role>;
export const Phase = z.enum([
  "LOBBY",
  "ANSWERING",
  "DISCUSSING",
  "GUESSING",
  "REVEALED",
  "ABORTED",
]);
export type Phase = z.infer<typeof Phase>;
const Version = z.number().int().nonnegative();
const topicText = z
  .string()
  .max(4096)
  .transform(normalizeText)
  .refine((t) => validText(t, 80));
const answerText = z
  .string()
  .max(4096)
  .transform(normalizeText)
  .refine((t) => validText(t, 140));
export const Choices = z.partialRecord(AnonymousId, Id.nullable());
export type Choices = z.infer<typeof Choices>;
const host = { hostEpoch: Version };
const phase = { ...host, expectedPhaseVersion: Version };
const queue = { ...host, expectedQueueVersion: Version };
const prediction = { choices: Choices, expectedVersion: Version };
const envelope = {
  type: z.literal("command"),
  wireVersion: z.literal(1),
  commandId: Id,
  sessionId: Id,
};
function command<N extends string, S extends z.ZodRawShape>(
  name: N,
  payload: S,
) {
  return z.strictObject({
    ...envelope,
    name: z.literal(name),
    payload: z.strictObject(payload),
  });
}
export const CommandSchema = z.discriminatedUnion("name", [
  command("role.set", { role: Role, expectedMemberVersion: Version }),
  command("topic.create", { text: topicText }),
  command("topic.reorder", { ...queue, orderedTopicIds: z.array(Id).max(50) }),
  command("topic.delete", { ...queue, topicId: Id }),
  command("session.start", { ...phase, expectedQueueVersion: Version }),
  command("answer.submit", {
    topicId: Id,
    text: answerText,
    expectedVersion: Version,
  }),
  command("answer.withdraw", { topicId: Id, expectedVersion: Version }),
  command("round.publish", phase),
  command("round.next", { ...phase, expectedQueueVersion: Version }),
  command("guessing.start", phase),
  command("prediction.save", prediction),
  command("prediction.complete", prediction),
  command("prediction.reopen", { expectedVersion: Version }),
  command("results.reveal", { ...phase, allowIncomplete: z.boolean() }),
  command("session.restart", phase),
]);
export type Command = z.infer<typeof CommandSchema>;
export type CommandName = Command["name"];
export type Payload<N extends CommandName> = Extract<
  Command,
  { name: N }
>["payload"];
export const ClientMessage = z.union([
  CommandSchema,
  z.strictObject({
    type: z.literal("authenticate"),
    ticket: z.string().regex(/^[a-f0-9]{64}$/),
  }),
  z.strictObject({
    type: z.literal("sync.request"),
    wireVersion: z.literal(1),
  }),
]);
export const ErrorCode = z.enum([
  "UNAUTHENTICATED",
  "AUTH_EXPIRED",
  "NOT_IN_INSTANCE",
  "FORBIDDEN",
  "SESSION_CHANGED",
  "PHASE_CHANGED",
  "VERSION_CONFLICT",
  "INVALID_INPUT",
  "ROOM_FULL",
  "RESPONDENTS_FULL",
  "TOPIC_LIMIT",
  "RATE_LIMITED",
  "STORAGE_UNAVAILABLE",
  "UPDATE_REQUIRED",
  "COMMAND_ID_REUSED",
  "INCOMPLETE",
  "NOT_FOUND",
]);
export type ErrorCode = z.infer<typeof ErrorCode>;
export const AckSchema = z.strictObject({
  type: z.literal("ack"),
  wireVersion: z.literal(1),
  commandId: Id,
  status: z.enum(["applied", "rejected"]),
  appliedRevision: Version.optional(),
  errorCode: ErrorCode.optional(),
});
export type Ack = z.infer<typeof AckSchema>;
const AvatarUrl = z
  .string()
  .regex(
    /^https:\/\/cdn\.discordapp\.com\/(?:avatars\/\d{1,20}\/(?:a_)?[a-f0-9]{32}\.png\?size=128|embed\/avatars\/[0-5]\.png)$/,
  );
const person = {
  memberId: Id,
  displayName: z.string(),
  avatarInitial: z.string(),
  avatarUrl: AvatarUrl.optional(),
};
const ScoreSchema = z.strictObject({
  correct: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
});
export const AnswerViewSchema = z.strictObject({
  anonymousId: AnonymousId,
  text: z.string(),
  memberId: Id.optional(),
  displayName: z.string().optional(),
  avatarInitial: z.string().optional(),
  avatarUrl: AvatarUrl.optional(),
});
export type AnswerView = z.infer<typeof AnswerViewSchema>;
export const TopicViewSchema = z.strictObject({
  topicId: Id,
  text: z.string(),
  status: z.enum(["queued", "current", "published"]),
  displayNumber: z.number().int(),
  roundNumber: z.number().int().nullable(),
});
export type TopicView = z.infer<typeof TopicViewSchema>;
export const RoomViewSchema = z.strictObject({
  wireVersion: z.literal(1),
  roomId: Id,
  revision: Version,
  serverTime: z.number(),
  sessionId: Id,
  phase: Phase,
  phaseVersion: Version,
  queueVersion: Version,
  historyVersion: Version,
  host: z.strictObject({ memberId: Id, epoch: Version }),
  members: z.array(
    z.strictObject({ ...person, role: Role, online: z.boolean() }),
  ),
  respondents: z.array(z.strictObject({ ...person, username: z.string() })),
  identities: z.array(z.strictObject({ anonymousId: AnonymousId })),
  topics: z.array(TopicViewSchema),
  currentRound: z
    .strictObject({
      topicId: Id,
      roundNumber: z.number(),
      submittedCount: z.number(),
      requiredCount: z.number(),
      publishedAnswers: z.array(AnswerViewSchema).optional(),
    })
    .nullable(),
  guessing: z.strictObject({
    eligibleCount: z.number(),
    completedCount: z.number(),
  }),
  result: z
    .strictObject({
      identities: z.array(
        z.strictObject({ anonymousId: AnonymousId, memberId: Id }),
      ),
      predictions: z.array(
        z.strictObject({
          memberId: Id,
          choices: Choices,
          score: ScoreSchema,
        }),
      ),
    })
    .optional(),
  me: z.strictObject({
    memberId: Id,
    memberVersion: Version,
    role: Role,
    isHost: z.boolean(),
    myAnonymousId: AnonymousId.optional(),
    guessEligible: z.boolean(),
    submission: z
      .strictObject({
        topicId: Id,
        text: z.string(),
        submitted: z.boolean(),
        version: Version,
      })
      .optional(),
    prediction: z
      .strictObject({
        choices: Choices,
        completed: z.boolean(),
        version: Version,
      })
      .optional(),
    score: ScoreSchema.optional(),
  }),
});
export type RoomView = z.infer<typeof RoomViewSchema>;
export const HistoryViewSchema = z.strictObject({
  sessionId: Id,
  historyVersion: Version,
  visibility: z.enum(["anonymous", "revealed"]),
  view: z.enum(["topic", "respondent"]),
  subject: z.string(),
  nextCursor: z.number().nullable(),
  entries: z.array(
    z.strictObject({
      topicId: Id,
      roundNumber: z.number(),
      question: z.string(),
      answers: z.array(AnswerViewSchema),
    }),
  ),
});
export type HistoryView = z.infer<typeof HistoryViewSchema>;
export const ServerMessage = z.union([
  AckSchema,
  z.strictObject({ type: z.literal("snapshot"), view: RoomViewSchema }),
  z.strictObject({ type: z.literal("error"), errorCode: ErrorCode }),
]);
