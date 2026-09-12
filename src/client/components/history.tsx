import { useEffect, useRef, useState } from "react";
import { IconChevronDown } from "@tabler/icons-react";
import type { AnonymousId, HistoryView, RoomView } from "../../shared/protocol";
import type { GameConnection } from "../connection";
import { Avatar, Button, Identity, Modal, QuestionHeading } from "./primitives";
import { AnswerCard, TopicRow } from "./game";

export type HistorySelection = {
  mode: "topic" | "respondent";
  subject: string;
};
export function HistoryBrowser({
  room,
  connection,
  selection,
  onSelect,
  mobile = false,
  compact = false,
  onError,
}: {
  room: RoomView;
  connection: GameConnection;
  selection: HistorySelection;
  onSelect: (value: HistorySelection) => void;
  mobile?: boolean;
  compact?: boolean;
  onError: (retry: () => void) => void;
}) {
  const [reload, setReload] = useState(0);
  const [data, setData] = useState<HistoryView>(),
    [picker, setPicker] = useState(false),
    loading = useRef(false),
    generation = useRef(0),
    scroll = useRef<HTMLDivElement>(null);
  const { mode, subject } = selection,
    topics = room.topics.filter((t) => t.status === "published"),
    revealed = room.phase === "REVEALED";
  useEffect(() => {
    const current = ++generation.current;
    loading.current = true;
    setData(undefined);
    scroll.current?.scrollTo(0, 0);
    if (!subject) return;
    void connection
      .history(mode, subject)
      .then(
        (value) => {
          if (generation.current === current) setData(value);
        },
        () => {
          if (generation.current === current)
            onError(() => setReload((value) => value + 1));
        },
      )
      .finally(() => {
        if (generation.current === current) loading.current = false;
      });
    return () => {
      generation.current++;
    };
  }, [connection, room.sessionId, room.historyVersion, mode, subject, reload]);
  function loadMore() {
    if (loading.current || data?.nextCursor == null) return;
    loading.current = true;
    const current = generation.current;
    void connection
      .history(mode, subject, data.nextCursor)
      .then(
        (next) => {
          if (generation.current === current)
            setData(
              (old) =>
                old && { ...next, entries: [...old.entries, ...next.entries] },
            );
        },
        () => {
          if (generation.current === current) onError(loadMore);
        },
      )
      .finally(() => {
        if (generation.current === current) loading.current = false;
      });
  }
  function select(mode: HistorySelection["mode"], subject: string) {
    onSelect({ mode, subject });
    setPicker(false);
  }
  const personFor = (id: string) =>
    room.respondents.find(
      (p) =>
        p.memberId ===
        room.result?.identities.find((i) => i.anonymousId === id)?.memberId,
    );
  const index =
    mode === "topic"
      ? topics.map((t) => (
          <TopicRow
            key={t.topicId}
            topic={t}
            selected={t.topicId === subject}
            onSelect={() => select("topic", t.topicId)}
          />
        ))
      : room.identities.map((i) => (
          <button
            key={i.anonymousId}
            className={`respondent-index ${subject === i.anonymousId ? "selected" : ""}`}
            onClick={() => select("respondent", i.anonymousId)}
          >
            {revealed && personFor(i.anonymousId) && (
              <>
                <Avatar initial={personFor(i.anonymousId)!.avatarInitial} />
                <b>{personFor(i.anonymousId)!.displayName}</b>
              </>
            )}
            <Identity id={i.anonymousId} />
          </button>
        ));
  return (
    <div
      className={`history-browser ${compact ? "compact" : ""} ${revealed ? "revealed" : ""}`}
    >
      <aside className="history-index">
        <h2>{revealed ? "振り返り" : "回答履歴"}</h2>
        <div className="browse-mode" role="tablist">
          {(["topic", "respondent"] as const).map((m) => (
            <button
              key={m}
              role="tab"
              aria-selected={mode === m}
              onClick={() =>
                select(
                  m,
                  m === "topic"
                    ? topics.at(-1)?.topicId || ""
                    : room.identities[0]?.anonymousId || "",
                )
              }
            >
              {m === "topic" ? "お題ごと" : "回答者ごと"}
            </button>
          ))}
        </div>
        {mobile ? (
          <Button variant="secondary" onClick={() => setPicker(true)}>
            {mode === "topic" ? "お題を選ぶ" : "回答者を選ぶ"}
            <IconChevronDown size={16} aria-hidden />
          </Button>
        ) : (
          <div className="history-index-list scroll">{index}</div>
        )}
      </aside>
      <div className="history-detail">
        {mode === "topic" ? (
          <>
            {topics.find((t) => t.topicId === subject) && (
              <QuestionHeading
                number={topics.find((t) => t.topicId === subject)!.roundNumber!}
              >
                {topics.find((t) => t.topicId === subject)!.text}
              </QuestionHeading>
            )}
            <div ref={scroll} className="history-answer-grid scroll">
              {data?.entries[0]?.answers.map((a) => (
                <AnswerCard
                  key={a.anonymousId}
                  answer={a}
                  onHistory={() => select("respondent", a.anonymousId)}
                />
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="respondent-heading">
              {revealed && personFor(subject) ? (
                <Avatar initial={personFor(subject)!.avatarInitial} />
              ) : (
                <Identity id={subject as AnonymousId} />
              )}
              <h2>
                {revealed ? personFor(subject)?.displayName : subject} の回答
              </h2>
            </div>
            <div
              ref={scroll}
              className="respondent-history scroll"
              onScroll={(e) => {
                const n = e.currentTarget;
                if (n.scrollHeight - n.scrollTop - n.clientHeight < 160)
                  loadMore();
              }}
            >
              {data?.entries.map((entry) => (
                <article key={entry.topicId} className="respondent-answer">
                  <QuestionHeading number={entry.roundNumber}>
                    {entry.question}
                  </QuestionHeading>
                  <p>{entry.answers[0]?.text}</p>
                </article>
              ))}
            </div>
          </>
        )}
      </div>
      {picker && (
        <Modal
          title={mode === "topic" ? "お題を選ぶ" : "回答者を選ぶ"}
          onClose={() => setPicker(false)}
        >
          <div
            className={`history-picker scroll ${mode} ${revealed ? "revealed" : ""}`}
          >
            {mode === "topic"
              ? [...topics].reverse().map((t) => (
                  <button
                    className="history-topic-choice"
                    key={t.topicId}
                    aria-pressed={t.topicId === subject}
                    onClick={() => select("topic", t.topicId)}
                  >
                    <QuestionHeading number={t.roundNumber!}>
                      {t.text}
                    </QuestionHeading>
                  </button>
                ))
              : index}
          </div>
        </Modal>
      )}
    </div>
  );
}
