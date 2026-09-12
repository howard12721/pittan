import { useRef, type ReactNode } from "react";
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
            <Avatar initial={m.avatarInitial} />
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
  onPost,
}: {
  count: number;
  total: number;
  onPost: () => void;
}) {
  return (
    <section className="response-status">
      <h3>回答状況</h3>
      <strong>
        {count} / {total}
      </strong>
      <progress value={count} max={Math.max(1, total)} />
      <Button variant="secondary" onClick={onPost}>
        <IconPlus size={18} aria-hidden />
        <span className="pc-only">お題を投稿</span>
        <span className="mobile-only">お題</span>
      </Button>
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
            <Avatar initial={answer.avatarInitial || ""} />
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
  return (
    <div
      className={`topic-row ${selected ? "selected" : ""} ${controls ? "with-controls" : ""}`}
    >
      <span className="topic-number">
        {String(topic.displayNumber).padStart(2, "0")}
      </span>
      {onSelect ? (
        <button className="topic-text" onClick={onSelect}>
          {topic.text}
        </button>
      ) : (
        <b className="topic-text">{topic.text}</b>
      )}
      {controls}
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
  used,
  mobile,
  onChange,
  onOpen,
}: {
  id: AnonymousId;
  value?: string | null;
  people: RoomView["respondents"];
  disabled?: boolean;
  self?: boolean;
  used: string[];
  mobile?: boolean;
  onChange: (memberId: string) => void;
  onOpen: () => void;
}) {
  const current = people.find((p) => p.memberId === value),
    select = useRef<HTMLSelectElement>(null);
  return (
    <div className="guess-row">
      <Identity id={id} />
      {mobile ? (
        <button disabled={disabled || self} onClick={onOpen}>
          {current?.displayName || "誰だと思う？"}
          {!self && <IconChevronDown size={14} aria-hidden />}
        </button>
      ) : (
        <div className="guess-select">
          <select
            ref={select}
            aria-label={`${id} 正体を選択`}
            value={value || ""}
            disabled={disabled || self}
            onChange={(e) => onChange(e.target.value)}
          >
            <option value="" disabled>
              誰だと思う？
            </option>
            {people.map((p) => (
              <option
                key={p.memberId}
                value={p.memberId}
                disabled={used.includes(p.memberId) && p.memberId !== value}
              >
                {p.displayName}
              </option>
            ))}
          </select>
          {!self && <IconChevronDown size={12} aria-hidden />}
        </div>
      )}
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
}: {
  id: AnonymousId;
  person: RoomView["respondents"][number];
}) {
  return (
    <div className="reveal-row">
      <Identity id={id} />
      <Avatar initial={person.avatarInitial} />
      <b>{person.displayName}</b>
    </div>
  );
}
