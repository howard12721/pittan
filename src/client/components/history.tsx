import { useEffect, useRef, useState } from "react";
import { IconChevronDown } from "@tabler/icons-react";
import type { AnonymousId, HistoryView, RoomView } from "../../shared/protocol";
import type { GameConnection } from "../connection";
import { historyCacheIsFresh, mergeHistoryRefresh } from "../history-cache";
import { Avatar, Button, Identity, Modal, QuestionHeading } from "./primitives";
import { AnswerCard, TopicRow } from "./game";

export type HistorySelection = {
  mode: "topic" | "respondent";
  subject: string;
};

const historyCaches = new WeakMap<GameConnection, Map<string, HistoryView>>();

function cacheFor(connection: GameConnection) {
  let cache = historyCaches.get(connection);
  if (!cache) {
    cache = new Map();
    historyCaches.set(connection, cache);
  }
  return cache;
}

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
    handledReload = useRef(0),
    previousSelection = useRef(""),
    scroll = useRef<HTMLDivElement>(null);
  const { mode, subject } = selection,
    topics = room.topics.filter((t) => t.status === "published"),
    revealed = room.phase === "REVEALED",
    visibility = revealed ? "revealed" : "anonymous",
    cache = cacheFor(connection),
    cacheKey = `${room.sessionId}:${visibility}:${mode}:${subject}`;
  const matchesSelection = (value?: HistoryView) =>
      value?.sessionId === room.sessionId &&
      value.visibility === visibility &&
      value.view === mode &&
      value.subject === subject,
    displayed = matchesSelection(data) ? data : cache.get(cacheKey);
  useEffect(() => {
    const current = ++generation.current;
    for (const key of cache.keys())
      if (!key.startsWith(`${room.sessionId}:`)) cache.delete(key);
    const force = handledReload.current !== reload,
      cached = cache.get(cacheKey),
      fresh = historyCacheIsFresh(cached, mode, room.historyVersion);
    handledReload.current = reload;
    if (previousSelection.current !== cacheKey) {
      previousSelection.current = cacheKey;
      scroll.current?.scrollTo(0, 0);
    }
    if (cached) setData(cached);
    else setData(undefined);
    if (!subject || (fresh && !force)) {
      loading.current = false;
      return;
    }
    loading.current = true;
    void connection
      .history(mode, subject)
      .then(
        (value) => {
          if (generation.current === current && matchesSelection(value)) {
            const updated = mergeHistoryRefresh(cached, value);
            cache.set(cacheKey, updated);
            setData(updated);
          }
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
  }, [
    connection,
    room.sessionId,
    room.historyVersion,
    visibility,
    mode,
    subject,
    cacheKey,
    reload,
  ]);
  function loadMore() {
    if (loading.current || displayed?.nextCursor == null) return;
    loading.current = true;
    const current = generation.current;
    void connection
      .history(mode, subject, displayed.nextCursor)
      .then(
        (next) => {
          if (generation.current === current && matchesSelection(next)) {
            const merged = {
              ...next,
              entries: [...displayed.entries, ...next.entries],
            };
            cache.set(cacheKey, merged);
            setData(merged);
          }
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
                <Avatar
                  initial={personFor(i.anonymousId)!.avatarInitial}
                  src={personFor(i.anonymousId)!.avatarUrl}
                />
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
              {displayed?.entries[0]?.answers.map((a) => (
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
                <Avatar
                  initial={personFor(subject)!.avatarInitial}
                  src={personFor(subject)!.avatarUrl}
                />
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
              {displayed?.entries.map((entry) => (
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
