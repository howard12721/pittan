import type { ReactNode } from "react";
import {
  IconChevronDown,
  IconGripVertical,
  IconPlus,
} from "@tabler/icons-react";
import { useSortable } from "@dnd-kit/react/sortable";
import type {
  AnonymousId,
  AnswerView,
  Role,
  RoomView,
  TopicView,
} from "../../shared/protocol";
import { textLength } from "../../shared/text";
import { Avatar, Button, HistoryLink, Identity, RoleIcon } from "./primitives";

export function ParticipantList({ members }: { members: RoomView["members"] }) {
  const visible = members.filter((m) => m.online),
    respondents = visible.filter((m) => m.role === "respondent").length;
  return (
    <section className="participants">
      <div className="participants-heading">
        <h3>参加者&nbsp; {visible.length}人</h3>
        <div className="role-counts">
          <span>
            <RoleIcon role="respondent" size={20} />
            {respondents}
          </span>
          <span>
            <RoleIcon role="viewer" size={20} />
            {visible.length - respondents}
          </span>
        </div>
      </div>
      <div className="participant-list scroll">
        {visible.map((m) => (
          <div className="participant" key={m.memberId}>
            <Avatar initial={m.avatarInitial} src={m.avatarUrl} />
            <span>{m.displayName}</span>
            <RoleIcon role={m.role} />
          </div>
        ))}
      </div>
    </section>
  );
}
export function RoleCard({
  role,
  selected,
  pending,
  onSelect,
}: {
  role: Role;
  selected: boolean;
  pending?: boolean;
  onSelect: () => void;
}) {
  return (
    <section className={`role-card ${selected ? "selected" : ""}`}>
      <h3>
        <RoleIcon role={role} />
        {role === "respondent" ? "回答者" : "閲覧者"}
      </h3>
      <Button
        variant={selected ? "primary" : "secondary"}
        aria-pressed={selected}
        disabled={pending}
        onClick={onSelect}
      >
        <span className="pc-only">
          {role === "respondent" && selected
            ? "✓ 回答者として参加中"
            : role === "viewer" && !selected
              ? "閲覧者に切り替える"
              : selected
                ? "参加中"
                : "切り替える"}
        </span>
        <span className="mobile-only">
          {selected ? "参加中" : "切り替える"}
        </span>
      </Button>
    </section>
  );
}
export function AnswerMemo({
  value,
  onChange,
  waiting,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  waiting?: boolean;
  disabled?: boolean;
}) {
  return (
    <div className={`answer-memo ${waiting ? "waiting" : ""}`}>
      <div className="memo-backing" />
      <div className="memo-sheet" />
      <img className="memo-fold" src="/assets/figma/memo-fold.svg" alt="" />
      {waiting ? (
        <div className="waiting-content">
          <span className="waiting-dots" aria-hidden>
            <span>•</span>
            <span>•</span>
            <span>•</span>
          </span>
          <h2>待機中</h2>
        </div>
      ) : (
        <textarea
          aria-label="ここに回答を書く"
          placeholder="ここに回答を書く"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          spellCheck={false}
        />
      )}
    </div>
  );
}
export function CharacterCount({ text, max }: { text: string; max: number }) {
  const count = textLength(text);
  return (
    <span className="character-count" data-invalid={count > max || undefined}>
      {count} / {max}文字
    </span>
  );
}
export function ResponseStatus({
  count,
  total,
  host,
  busy,
  onPost,
  onPublish,
}: {
  count: number;
  total: number;
  host: boolean;
  busy: boolean;
  onPost: () => void;
  onPublish: () => void;
}) {
  const ready = total > 0 && count === total;
  return (
    <section className={`response-status ${ready ? "ready" : ""}`}>
      <h3>回答状況</h3>
      <strong>
        {count} / {total}
      </strong>
      <progress value={count} max={Math.max(1, total)} />
      <div className="response-status-actions">
        {ready &&
          (host ? (
            <Button disabled={busy} onClick={onPublish}>
              回答を公開する
            </Button>
          ) : (
            <p className="publish-wait">ホストの公開を待っています</p>
          ))}
        <Button variant="secondary" onClick={onPost}>
          <IconPlus size={18} aria-hidden />
          <span className="pc-only">お題を投稿</span>
          <span className="mobile-only">お題</span>
        </Button>
      </div>
    </section>
  );
}
export function AnswerCard({
  answer,
  onHistory,
}: {
  answer: AnswerView;
  onHistory: () => void;
}) {
  return (
    <article className={`answer-card ${answer.displayName ? "revealed" : ""}`}>
      <div className="answer-identity">
        {answer.displayName ? (
          <>
            <Avatar
              initial={answer.avatarInitial || ""}
              src={answer.avatarUrl}
            />
            <div className="revealed-person">
              <b>{answer.displayName}</b>
              <Identity id={answer.anonymousId} />
            </div>
          </>
        ) : (
          <Identity id={answer.anonymousId} large />
        )}
        <HistoryLink onClick={onHistory} />
      </div>
      <p>{answer.text}</p>
    </article>
  );
}
export function TopicRow({
  topic,
  selected,
  onSelect,
  controls,
}: {
  topic: TopicView;
  selected?: boolean;
  onSelect?: () => void;
  controls?: ReactNode;
}) {
  const content = (
    <>
      <span className="topic-number">
        {String(topic.displayNumber).padStart(2, "0")}
      </span>
      <b className="topic-text">{topic.text}</b>
      {controls}
    </>
  );
  if (onSelect)
    return (
      <button
        type="button"
        className={`topic-row topic-row-button ${selected ? "selected" : ""}`}
        aria-pressed={selected}
        onClick={onSelect}
      >
        {content}
      </button>
    );
  return (
    <div
      className={`topic-row ${selected ? "selected" : ""} ${controls ? "with-controls" : ""}`}
    >
      {content}
    </div>
  );
}
export function SortableTopic({
  topic,
  index,
  disabled,
  onDelete,
}: {
  topic: TopicView;
  index: number;
  disabled?: boolean;
  onDelete: () => void;
}) {
  const { ref, handleRef, isDragging } = useSortable({
    id: topic.topicId,
    index,
    disabled,
  });
  return (
    <div ref={ref} className={`sortable-topic ${isDragging ? "dragging" : ""}`}>
      <button
        ref={handleRef}
        className="drag-handle"
        aria-label={topic.text}
        disabled={disabled}
      >
        <IconGripVertical size={20} stroke={1.75} aria-hidden />
      </button>
      <TopicRow
        topic={topic}
        controls={
          <Button variant="quiet" onClick={onDelete} disabled={disabled}>
            削除
          </Button>
        }
      />
    </div>
  );
}
export function GuessRow({
  id,
  value,
  people,
  disabled,
  self,
  onOpen,
}: {
  id: AnonymousId;
  value?: string | null;
  people: RoomView["respondents"];
  disabled?: boolean;
  self?: boolean;
  onOpen: () => void;
}) {
  const current = people.find((p) => p.memberId === value);
  return (
    <div className="guess-row">
      <Identity id={id} />
      <button
        className="guess-choice"
        aria-label={`${id} 回答者を選択`}
        aria-haspopup="dialog"
        disabled={disabled || self}
        onClick={onOpen}
      >
        <span>
          {self ? "自分" : current?.username || "回答者を選択"}
        </span>
        {!self && <IconChevronDown size={14} aria-hidden />}
      </button>
    </div>
  );
}
export function PredictionCompletion({
  count,
  total,
  complete,
  host,
  disabled,
  canComplete,
  onComplete,
  onReveal,
}: {
  count: number;
  total: number;
  complete: boolean;
  host: boolean;
  disabled?: boolean;
  canComplete: boolean;
  onComplete: () => void;
  onReveal: () => void;
}) {
  return (
    <div className="prediction-completion">
      <div>
        <b>予想完了</b>
        <strong>
          {count} / {total}人
        </strong>
      </div>
      <div className="prediction-actions">
        <Button
          variant={complete ? "secondary" : "primary"}
          disabled={disabled || (!complete && !canComplete)}
          onClick={onComplete}
        >
          {complete ? "完了を取り消す" : "予想を完了する"}
        </Button>
        {host ? (
          <Button variant="secondary" disabled={disabled} onClick={onReveal}>
            正解発表へ
          </Button>
        ) : (
          <span className="host-wait pc-only">
            ホストの正解発表を待っています
          </span>
        )}
      </div>
    </div>
  );
}
export function RevealRow({
  id,
  person,
  prediction,
}: {
  id: AnonymousId;
  person: RoomView["respondents"][number];
  prediction?:
    | { kind: "correct" }
    | { kind: "self" }
    | { kind: "unanswered" }
    | { kind: "wrong"; guessedName: string };
}) {
  return (
    <div className="reveal-row">
      <Identity id={id} />
      <Avatar initial={person.avatarInitial} src={person.avatarUrl} />
      <b>{person.displayName}</b>
      {prediction && (
        <span className={`prediction-status ${prediction.kind}`}>
          {prediction.kind === "correct" ? (
            "✓ 正解"
          ) : prediction.kind === "self" ? (
            "本人"
          ) : prediction.kind === "unanswered" ? (
            "未回答"
          ) : (
            <>
              <span className="pc-only">
                × {prediction.guessedName} と予想
              </span>
              <span className="mobile-only">
                × {prediction.guessedName}
              </span>
            </>
          )}
        </span>
      )}
    </div>
  );
}
