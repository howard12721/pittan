import { feedback } from "./components/feedback";
import {
  ANONYMOUS_IDS,
  type AnswerView,
  type HistoryView,
  type RoomView,
} from "../shared/protocol";
import type { ConnectionState, GameConnection } from "./connection";
import type { HistorySelection } from "./components/history";
import type { Tab } from "./components/primitives";

// Imported only inside import.meta.env.DEV. These Figma samples never enter the production bundle.
const uuid = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const names = [
  "yui",
  "ren",
  "mika",
  "sora",
  "nagi",
  "riku",
  "mei",
  "kei",
  "nao",
  "kai",
  "haru",
  "ao",
];
const questions = [
  "自由に使える100万円があったら？",
  "最近、密かにハマっていることは？",
  "1週間だけ別の仕事をするなら？",
  "最近あった、小さな幸せは？",
  "無人島にひとつだけ持っていくなら？",
  "自分だけの、ちょっとしたこだわりは？",
];
const answers = [
  "深夜のラジオDJ。\n好きな曲だけ流したい。",
  "水族館の飼育員。ペンギンの\n相関図を作る。",
  "パン屋さん。開店前の匂いを\n独り占めしたい。",
  "宇宙飛行士。\nまずは地球を眺める。",
  "映画館の映写スタッフ。\n一番いい席を探したい。",
  "図書館の司書。\nおすすめの本で棚を作る。",
  "プロ野球の実況。\n人生で一度は叫んでみたい。",
  "島の郵便屋さん。\n毎日ちがう海が見たい。",
  "ゲームのサウンドデザイナー。\n宝箱を開ける音を作りたい。",
  "植物園のスタッフ。\n巨大な温室で一日過ごしたい。",
];
export const fixtureNames = [
  "lobby",
  "answer",
  "next-answer",
  "waiting-respondent",
  "waiting-viewer",
  "publish-ready",
  "discussion-host",
  "discussion-viewer",
  "guessing-host",
  "guessing-viewer",
  "guessing-complete",
  "history-topic",
  "history-respondent",
  "topics-host",
  "topics-participant",
  "topics-reordered",
  "topics-deleted",
  "topics-dragging",
  "results",
  "review-topic",
  "review-respondent",
  "topic-composer",
  "delete-confirm",
  "reveal-confirm",
  "topic-picker",
  "respondent-picker",
  "prediction-picker",
] as const;
export function fixture(name: string) {
  const revealed = name === "results" || name.startsWith("review-"),
    viewer = name.includes("viewer"),
    host = !viewer && name !== "topics-participant";
  const guessing =
    name.includes("guessing") ||
    name.includes("prediction") ||
    name === "reveal-confirm";
  const answering = [
    "answer",
    "next-answer",
    "waiting-respondent",
    "waiting-viewer",
    "publish-ready",
  ].includes(name);
  const members: RoomView["members"] = names.map((displayName, i) => ({
    memberId: uuid(i + 10),
    displayName,
    avatarInitial: displayName[0],
    role: i < 10 ? "respondent" : "viewer",
    online: true,
  }));
  const respondents = members
    .slice(0, 10)
    .map((m) => ({ ...m, username: m.displayName }))
    .map(({ online, role, ...m }) => m);
  const phase = revealed
    ? "REVEALED"
    : name === "lobby"
      ? "LOBBY"
      : guessing
        ? "GUESSING"
        : answering
          ? "ANSWERING"
          : "DISCUSSING";
  const currentIndex = name === "next-answer" ? 3 : 2,
    round =
      answering || name.startsWith("discussion")
        ? name === "next-answer"
          ? 2
          : 1
        : 3;
  let topics: RoomView["topics"] = questions.map((text, i) => ({
    topicId: uuid(100 + i),
    text,
    status:
      i <= currentIndex
        ? phase === "ANSWERING" && i === currentIndex
          ? "current"
          : "published"
        : "queued",
    displayNumber: i + 1,
    roundNumber: i <= currentIndex ? i + 1 : null,
  }));
  if (name === "topics-reordered") {
    [topics[3], topics[4]] = [
      { ...topics[4], displayNumber: 4 },
      { ...topics[3], displayNumber: 5 },
    ];
  }
  if (name === "topics-deleted")
    topics = topics
      .filter((_, i) => i !== 3)
      .map((t, i) => ({ ...t, displayNumber: i + 1 }));
  const published: AnswerView[] = ANONYMOUS_IDS.map((anonymousId, i) => ({
    anonymousId,
    text: answers[i],
    ...(revealed
      ? {
          memberId: members[i].memberId,
          displayName: names[i],
          avatarInitial: names[i][0],
        }
      : {}),
  }));
  const choices = Object.fromEntries(
    ANONYMOUS_IDS.map((id, i) => [
      id,
      members[i === 2 ? 3 : i === 3 ? 2 : i].memberId,
    ]),
  );
  const room: RoomView = {
    wireVersion: 1,
    roomId: uuid(1),
    sessionId: uuid(2),
    revision: 1,
    serverTime: Date.now(),
    phase,
    phaseVersion: 1,
    queueVersion: 1,
    historyVersion: 1,
    host: { memberId: members[0].memberId, epoch: 0 },
    members,
    respondents,
    identities: ANONYMOUS_IDS.map((anonymousId) => ({ anonymousId })),
    topics,
    currentRound:
      phase === "LOBBY"
        ? null
        : {
            topicId: uuid(100 + currentIndex),
            roundNumber: round,
            submittedCount: name.startsWith("waiting")
              ? 8
              : name === "publish-ready"
                ? 10
              : name === "next-answer" && innerWidth >= 1024
                ? 0
                : 7,
            requiredCount: 10,
            ...(!answering ? { publishedAnswers: published } : {}),
          },
    guessing: {
      eligibleCount: 12,
      completedCount: name === "guessing-complete" ? 7 : 6,
    },
    ...(revealed
      ? {
          result: {
            identities: ANONYMOUS_IDS.map((anonymousId, i) => ({
              anonymousId,
              memberId: members[i].memberId,
            })),
            predictions: members.map((member, i) => ({
              memberId: member.memberId,
              choices,
              score: {
                correct: i < 10 ? 7 : 8,
                total: i < 10 ? 9 : 10,
              },
            })),
          },
        }
      : {}),
    me: {
      memberId: members[viewer ? 10 : 0].memberId,
      memberVersion: 0,
      role: viewer ? "viewer" : "respondent",
      isHost: host,
      guessEligible: true,
      ...(!viewer ? { myAnonymousId: "A" as const } : {}),
      ...(answering && !viewer
        ? {
            submission: {
              topicId: uuid(100 + currentIndex),
              text:
                name === "next-answer"
                  ? ""
                  : "深夜のラジオDJ。好きな曲だけ流したい。",
              submitted:
                name === "waiting-respondent" || name === "publish-ready",
              version: 0,
            },
          }
        : {}),
      ...(guessing
        ? {
            prediction: {
              choices,
              completed: name === "guessing-complete",
              version: 1,
            },
          }
        : {}),
      ...(revealed ? { score: { correct: 7, total: 9 } } : {}),
    },
  };
  if (new URLSearchParams(location.search).has("stress")) {
    const longAnswer = "あ".repeat(69) + "\n" + "w".repeat(70);
    room.members.forEach((m, i) => {
      m.displayName = "長い表示名".repeat(6) + String(i).padStart(2, "0");
    });
    room.respondents.forEach((m, i) => {
      m.displayName = room.members[i].displayName;
    });
    room.topics.forEach((t) => {
      t.text = "長いお題".repeat(20);
    });
    published.forEach((a, i) => {
      a.text = longAnswer;
      if (revealed) a.displayName = room.members[i].displayName;
    });
    if (room.me.submission) room.me.submission.text = longAnswer;
  }
  if (new URLSearchParams(location.search).has("avatars")) {
    room.members.forEach((m, i) => {
      m.avatarUrl = `https://cdn.discordapp.com/embed/avatars/${i % 6}.png`;
    });
    room.respondents.forEach((m) => {
      m.avatarUrl = room.members.find(
        (p) => p.memberId === m.memberId,
      )?.avatarUrl;
    });
    if (revealed)
      published.forEach((a) => {
        a.avatarUrl = room.respondents.find(
          (p) => p.memberId === a.memberId,
        )?.avatarUrl;
      });
  }
  const state: ConnectionState = { view: room, status: "connected" };
  const connection: GameConnection = {
    subscribe: () => () => {},
    getSnapshot: () => state,
    start: () => {},
    stop: () => {},
    retry: () => {},
    command: async () => {},
    history: async (view, subject): Promise<HistoryView> => ({
      sessionId: room.sessionId,
      historyVersion: 1,
      visibility: revealed ? "revealed" : "anonymous",
      view,
      subject,
      nextCursor: null,
      entries:
        view === "topic"
          ? [
              {
                topicId: subject,
                roundNumber: Number(subject.slice(-3)) - 99,
                question: questions[Number(subject.slice(-3)) - 100],
                answers: published,
              },
            ]
          : [2, 1, 0].map((i) => ({
              topicId: uuid(100 + i),
              roundNumber: i + 1,
              question: questions[i],
              answers: [
                {
                  ...published[
                    ANONYMOUS_IDS.indexOf(
                      subject as (typeof ANONYMOUS_IDS)[number],
                    )
                  ],
                  text:
                    subject === "B"
                      ? [
                          "古い喫茶店を借りて、週末だけお店を開きたい。",
                          "朝に散歩して、鳥の名前を調べること。",
                          "水族館の飼育員。ペンギンの相関図を作る。",
                        ][i]
                      : answers[
                          ANONYMOUS_IDS.indexOf(
                            subject as (typeof ANONYMOUS_IDS)[number],
                          )
                        ],
                },
              ],
            })),
    }),
  };
  let initialTab: Tab =
    name.startsWith("topics") || name === "delete-confirm"
      ? "topics"
      : name.includes("history") ||
          name.startsWith("review") ||
          (name.endsWith("-picker") && !name.startsWith("prediction"))
        ? "history"
        : "play";
  const initialSelection: HistorySelection = {
    mode: name.includes("respondent") && !answering ? "respondent" : "topic",
    subject: name.includes("respondent") && !answering ? "B" : uuid(102),
  };
  const proposed = new URLSearchParams(location.search).get("feedback");
  const initialOverlay =
    proposed && proposed in feedback
      ? (proposed as keyof typeof feedback)
      : name === "topic-composer"
        ? ("post" as const)
        : name === "reveal-confirm"
          ? ("reveal" as const)
          : undefined;
  if (initialOverlay === "post")
    sessionStorage.setItem(
      `pittan:topic:${room.roomId}:${room.sessionId}:${room.me.memberId}`,
      questions[3],
    );
  if (new URLSearchParams(location.search).has("safe"))
    document.documentElement.style.setProperty(
      "--safe-bottom",
      `${Number(new URLSearchParams(location.search).get("safe")) || 0}px`,
    );
  return { connection, initialTab, initialSelection, initialOverlay };
}
