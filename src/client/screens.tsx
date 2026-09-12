import { useState } from "react";
import { IconPlus } from "@tabler/icons-react";
import { DragDropProvider } from "@dnd-kit/react";
import { isSortableOperation } from "@dnd-kit/dom/sortable";
import type {
  AnonymousId,
  Choices,
  Role,
  RoomView,
  TopicView,
} from "../shared/protocol";
import { validText } from "../shared/text";
import type { GameConnection } from "./connection";
import {
  Avatar,
  Button,
  Identity,
  Modal,
  QuestionHeading,
} from "./components/primitives";
import {
  AnswerCard,
  AnswerMemo,
  CharacterCount,
  GuessRow,
  ParticipantList,
  PredictionCompletion,
  ResponseStatus,
  RevealRow,
  RoleCard,
  SortableTopic,
  TopicRow,
} from "./components/game";
import { HistoryBrowser, type HistorySelection } from "./components/history";
import { useDraft } from "./hooks";

export function LobbyScreen({
  room,
  busy,
  onRole,
  onStart,
}: {
  room: RoomView;
  busy: boolean;
  onRole: (role: Role) => void;
  onStart: () => void;
}) {
  return (
    <main className="page lobby-page">
      <div className="lobby-welcome">
        <h1>ぴったん</h1>
        <div className="role-cards">
          <RoleCard
            role="respondent"
            selected={room.me.role === "respondent"}
            pending={busy}
            onSelect={() => onRole("respondent")}
          />
          <RoleCard
            role="viewer"
            selected={room.me.role === "viewer"}
            pending={busy}
            onSelect={() => onRole("viewer")}
          />
        </div>
        {room.me.isHost && (
          <Button
            className="lobby-start pc-only"
            disabled={busy}
            onClick={onStart}
          >
            セッションをはじめる
          </Button>
        )}
      </div>
      <ParticipantList members={room.members} />
      {room.me.isHost && (
        <Button
          className="lobby-start mobile-only"
          disabled={busy}
          onClick={onStart}
        >
          セッションをはじめる
        </Button>
      )}
    </main>
  );
}
export function AnswerScreen({
  room,
  busy,
  onSubmit,
  onWithdraw,
  onHistory,
  onPost,
}: {
  room: RoomView;
  busy: boolean;
  onSubmit: (text: string) => void;
  onWithdraw: () => void;
  onHistory: () => void;
  onPost: () => void;
}) {
  const round = room.currentRound!,
    topic = room.topics.find((t) => t.topicId === round.topicId)!;
  const [draft, setDraft] = useDraft(
    `pittan:answer:${room.roomId}:${room.sessionId}:${room.me.memberId}:${topic.topicId}`,
    room.me.submission?.text,
  );
  const waiting = room.me.role === "viewer" || room.me.submission?.submitted;
  return (
    <main className="page answer-page">
      <div className="answer-main">
        <QuestionHeading number={round.roundNumber}>
          {topic.text}
        </QuestionHeading>
        <div className="answer-form">
          <AnswerMemo
            value={draft}
            onChange={setDraft}
            waiting={waiting}
            disabled={busy}
          />
          {!waiting && <CharacterCount text={draft} max={140} />}
          <div className="answer-actions">
            <Button variant="secondary" className="pc-only" onClick={onHistory}>
              回答履歴を見る
            </Button>
            {room.me.role === "respondent" &&
              (waiting ? (
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={onWithdraw}
                >
                  <span className="pc-only">提出を取り消して編集</span>
                  <span className="mobile-only">取り消して編集</span>
                </Button>
              ) : (
                <Button
                  disabled={busy || !validText(draft, 140)}
                  onClick={() => onSubmit(draft)}
                >
                  回答を送信する
                </Button>
              ))}
          </div>
        </div>
      </div>
      <ResponseStatus
        count={round.submittedCount}
        total={round.requiredCount}
        onPost={onPost}
      />
    </main>
  );
}
export function DiscussionScreen({
  room,
  busy,
  onHistory,
  onPost,
  onNext,
  onGuess,
}: {
  room: RoomView;
  busy: boolean;
  onHistory: (id?: AnonymousId) => void;
  onPost: () => void;
  onNext: () => void;
  onGuess: () => void;
}) {
  const round = room.currentRound!,
    topic = room.topics.find((t) => t.topicId === round.topicId)!;
  return (
    <main className="page discussion-page">
      <QuestionHeading number={round.roundNumber}>{topic.text}</QuestionHeading>
      <div className="discussion-grid scroll">
        {round.publishedAnswers?.map((a) => (
          <AnswerCard
            key={a.anonymousId}
            answer={a}
            onHistory={() => onHistory(a.anonymousId)}
          />
        ))}
      </div>
      <div className="discussion-actions">
        <div className="pc-only">
          <Button variant="secondary" onClick={() => onHistory()}>
            回答履歴を見る
          </Button>
          <Button variant="secondary" onClick={onPost}>
            <IconPlus size={18} aria-hidden />
            お題を投稿
          </Button>
        </div>
        {room.me.isHost && (
          <div>
            <Button disabled={busy} onClick={onNext}>
              次のお題に進む
            </Button>
            <Button variant="secondary" disabled={busy} onClick={onGuess}>
              回答フェーズに進む
            </Button>
          </div>
        )}
      </div>
    </main>
  );
}
export function TopicsScreen({
  room,
  busy,
  onPost,
  onDelete,
  onReorder,
  onNext,
}: {
  room: RoomView;
  busy: boolean;
  onPost: () => void;
  onDelete: (topic: TopicView) => void;
  onReorder: (ids: string[]) => void;
  onNext: () => void;
}) {
  const queued = room.topics.filter((t) => t.status === "queued"),
    current = room.topics.find((t) => t.topicId === room.currentRound?.topicId);
  const canManage =
    room.me.isHost && ["LOBBY", "ANSWERING", "DISCUSSING"].includes(room.phase);
  return (
    <main className="page topics-page">
      <section className="topic-queue">
        <div className="queue-heading">
          <h2>お題リスト</h2>
          {!["REVEALED", "GUESSING"].includes(room.phase) && (
            <Button onClick={onPost}>
              <IconPlus size={18} aria-hidden />
              <span className="pc-only">お題を投稿する</span>
              <span className="mobile-only">投稿</span>
            </Button>
          )}
        </div>
        <div className="queue-body">
          {current && <TopicRow topic={current} selected />}
          <div className="waiting-topics">
            <b>待っているお題&nbsp; {queued.length}件</b>
            <div className="queue-list scroll">
              <DragDropProvider
                onDragEnd={(event) => {
                  if (event.canceled || !isSortableOperation(event.operation))
                    return;
                  const { source } = event.operation;
                  if (!source || source.initialIndex === source.index) return;
                  const ids = queued.map((t) => t.topicId);
                  const [moved] = ids.splice(source.initialIndex, 1);
                  if (!moved) return;
                  ids.splice(source.index, 0, moved);
                  onReorder(ids);
                }}
              >
                {queued.map((t, i) =>
                  canManage ? (
                    <SortableTopic
                      key={t.topicId}
                      topic={t}
                      index={i}
                      disabled={busy}
                      onDelete={() => onDelete(t)}
                    />
                  ) : (
                    <TopicRow key={t.topicId} topic={t} />
                  ),
                )}
              </DragDropProvider>
            </div>
          </div>
        </div>
        {room.me.isHost && room.phase === "DISCUSSING" && (
          <div className="queue-actions">
            <Button disabled={busy} onClick={onNext}>
              次のお題をはじめる
            </Button>
          </div>
        )}
      </section>
    </main>
  );
}
export function GuessingScreen({
  room,
  connection,
  busy,
  mobile,
  selection,
  onSelect,
  onChoices,
  onComplete,
  onReveal,
  onError,
}: {
  room: RoomView;
  connection: GameConnection;
  busy: boolean;
  mobile: boolean;
  selection: HistorySelection;
  onSelect: (s: HistorySelection) => void;
  onChoices: (c: Choices) => void;
  onComplete: () => void;
  onReveal: () => void;
  onError: (retry: () => void) => void;
}) {
  const [active, setActive] = useState<AnonymousId>(
      () =>
        room.identities.find((i) => i.anonymousId !== room.me.myAnonymousId)
          ?.anonymousId || "A",
    ),
    [picking, setPicking] = useState<AnonymousId>();
  const prediction = room.me.prediction,
    choices = prediction?.choices || {},
    used = Object.values(choices).filter((v): v is string => !!v),
    disabled = busy || !!prediction?.completed || !room.me.guessEligible;
  const complete = !!prediction?.completed,
    canComplete = room.identities.every((i) => choices[i.anonymousId]);
  const row = (id: AnonymousId) => (
    <GuessRow
      key={id}
      id={id}
      value={choices[id]}
      people={room.respondents}
      used={used}
      disabled={disabled}
      self={id === room.me.myAnonymousId}
      mobile={mobile}
      onOpen={() => setPicking(id)}
      onChange={(memberId) => onChoices({ ...choices, [id]: memberId })}
    />
  );
  const completion = (
    <PredictionCompletion
      count={room.guessing.completedCount}
      total={room.guessing.eligibleCount}
      complete={complete}
      host={room.me.isHost}
      disabled={busy}
      canComplete={canComplete && room.me.guessEligible}
      onComplete={onComplete}
      onReveal={onReveal}
    />
  );
  return (
    <main className="page guessing-page">
      {mobile ? (
        <>
          <h2>正体を選択</h2>
          <div className="identity-tabs scroll">
            {room.identities.map((i) => (
              <button
                key={i.anonymousId}
                aria-pressed={active === i.anonymousId}
                onClick={() => setActive(i.anonymousId)}
              >
                <Identity id={i.anonymousId} />
              </button>
            ))}
          </div>
          {row(active)}
          <HistoryBrowser
            room={room}
            connection={connection}
            selection={{ mode: "respondent", subject: active }}
            onSelect={onSelect}
            mobile
            compact
            onError={onError}
          />
          {completion}
        </>
      ) : (
        <>
          <HistoryBrowser
            room={room}
            connection={connection}
            selection={selection}
            onSelect={onSelect}
            compact
            onError={onError}
          />
          <section className="guess-panel">
            <h3>正体を選択</h3>
            <div className="guess-list scroll">
              {room.identities.map((i) => row(i.anonymousId))}
            </div>
            {completion}
          </section>
        </>
      )}
      {picking && (
        <Modal title="正体を選ぶ" onClose={() => setPicking(undefined)}>
          <div className="candidate-list">
            {room.respondents.map((p) => (
              <button
                key={p.memberId}
                aria-pressed={choices[picking] === p.memberId}
                disabled={
                  used.includes(p.memberId) && choices[picking] !== p.memberId
                }
                onClick={() => {
                  onChoices({ ...choices, [picking]: p.memberId });
                  setPicking(undefined);
                }}
              >
                <Avatar initial={p.avatarInitial} />
                {p.displayName}
              </button>
            ))}
          </div>
        </Modal>
      )}
    </main>
  );
}
export function ResultsScreen({
  room,
  busy,
  onReview,
  onRestart,
}: {
  room: RoomView;
  busy: boolean;
  onReview: () => void;
  onRestart: () => void;
}) {
  return (
    <main className="page results-page">
      <div className="results-heading">
        <h2>正解発表</h2>
        {room.me.score && (
          <div className="score">
            <b>正解数</b>
            <strong>
              {room.me.score.correct} / {room.me.score.total}
            </strong>
          </div>
        )}
      </div>
      <div className="reveal-grid scroll">
        {room.result?.identities.map((i) => (
          <RevealRow
            key={i.anonymousId}
            id={i.anonymousId}
            person={room.respondents.find((p) => p.memberId === i.memberId)!}
          />
        ))}
      </div>
      <div className="results-actions">
        <Button variant="secondary" onClick={onReview}>
          回答を振り返る
        </Button>
        {room.me.isHost && (
          <Button disabled={busy} onClick={onRestart}>
            もう一度あそぶ
          </Button>
        )}
      </div>
    </main>
  );
}
export function TopicComposer({
  draft,
  onDraft,
  busy,
  onClose,
  onSubmit,
}: {
  draft: string;
  onDraft: (v: string) => void;
  busy: boolean;
  onClose: () => void;
  onSubmit: () => void;
}) {
  return (
    <Modal
      title="お題を投稿"
      onClose={onClose}
      actions={
        <>
          <Button variant="secondary" onClick={onClose}>
            キャンセル
          </Button>
          <Button disabled={busy || !validText(draft, 80)} onClick={onSubmit}>
            投稿する
          </Button>
        </>
      }
    >
      <div className="topic-composer">
        <textarea
          aria-label="お題を投稿"
          autoFocus
          value={draft}
          onChange={(e) => onDraft(e.target.value)}
        />
        <CharacterCount text={draft} max={80} />
      </div>
    </Modal>
  );
}
