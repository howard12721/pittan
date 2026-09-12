import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type {
  AnonymousId,
  CommandName,
  Payload,
  TopicView,
} from "../shared/protocol";
import { RequestError, type GameConnection } from "./connection";
import { Button, Modal, Navigation, type Tab } from "./components/primitives";
import { Feedback, type FeedbackKind } from "./components/feedback";
import { HistoryBrowser, type HistorySelection } from "./components/history";
import {
  AnswerScreen,
  DiscussionScreen,
  GuessingScreen,
  LobbyScreen,
  ResultsScreen,
  TopicComposer,
  TopicsScreen,
} from "./screens";
import { useDraft, useMobile, useViewport } from "./hooks";

type Overlay = "post" | "delete" | "reveal" | FeedbackKind;
export function App({
  connection,
  initialTab = "play",
  initialSelection,
  initialOverlay,
}: {
  connection: GameConnection;
  initialTab?: Tab;
  initialSelection?: HistorySelection;
  initialOverlay?: Overlay;
}) {
  const state = useSyncExternalStore(
      connection.subscribe,
      connection.getSnapshot,
    ),
    room = state.view;
  const [tab, setTab] = useState<Tab>(initialTab),
    [selection, setSelection] = useState<HistorySelection>(
      initialSelection || { mode: "topic", subject: "" },
    );
  const [connectionDismissed, setConnectionDismissed] = useState(false);
  useEffect(() => {
    if (state.status !== "failed") setConnectionDismissed(false);
  }, [state.status]);
  const [overlay, setOverlay] = useState<Overlay | undefined>(initialOverlay),
    [deleting, setDeleting] = useState<TopicView>(),
    [pending, setBusy] = useState(false);
  const busy = pending || state.status !== "connected";
  const busyRef = useRef(false),
    retryAction = useRef<() => void>(() => {}),
    previousPhase = useRef<string | undefined>(undefined);
  const mobile = useMobile();
  useViewport();
  const [topicDraft, setTopicDraft] = useDraft(
    `pittan:topic:${room?.roomId || ""}:${room?.sessionId || ""}:${room?.me.memberId || ""}`,
  );
  useEffect(() => {
    connection.start();
    return () => connection.stop();
  }, [connection]);
  useEffect(() => {
    if (!room) return;
    const key = `${room.sessionId}:${room.phase}`;
    try {
      for (const key of Object.keys(sessionStorage)) {
        const match = /^pittan:(?:topic|answer):([^:]+):([^:]+):/.exec(key);
        if (match?.[1] === room.roomId && match[2] !== room.sessionId)
          sessionStorage.removeItem(key);
      }
    } catch {
      /* Storage can be disabled by the embedder. */
    }
    if (previousPhase.current && previousPhase.current !== key) {
      setTab("play");
      setOverlay(undefined);
    }
    previousPhase.current = key;
    const published = room.topics.filter((t) => t.status === "published");
    setSelection((s) =>
      s.mode === "topic"
        ? {
            ...s,
            subject: published.some((t) => t.topicId === s.subject)
              ? s.subject
              : published.at(-1)?.topicId || "",
          }
        : {
            ...s,
            subject: room.identities.some((i) => i.anonymousId === s.subject)
              ? s.subject
              : room.identities[0]?.anonymousId || "",
          },
    );
  }, [room?.sessionId, room?.phase, room?.historyVersion]);
  const current = () => connection.getSnapshot().view!;
  const phase = () => ({
    hostEpoch: current().host.epoch,
    expectedPhaseVersion: current().phaseVersion,
  });
  const queue = () => ({
    hostEpoch: current().host.epoch,
    expectedQueueVersion: current().queueVersion,
  });
  function perform(action: () => Promise<void>, done?: () => void) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    retryAction.current = () => {
      setOverlay(undefined);
      perform(action, done);
    };
    void action()
      .then(done)
      .catch((error) => {
        const code =
          error instanceof RequestError ? error.code : "STORAGE_UNAVAILABLE";
        setOverlay(
          [
            "ROOM_FULL",
            "RESPONDENTS_FULL",
            "TOPIC_LIMIT",
            "RATE_LIMITED",
          ].includes(code)
            ? "limit"
            : code === "NOT_IN_INSTANCE"
              ? "instance"
              : "failure",
        );
      })
      .finally(() => {
        busyRef.current = false;
        setBusy(false);
      });
  }
  function send<N extends CommandName>(
    name: N,
    payload: () => Payload<N>,
    done?: () => void,
  ) {
    perform(() => connection.command(name, payload()), done);
  }
  function history(id?: AnonymousId) {
    if (!room?.topics.some((t) => t.status === "published")) {
      setOverlay("history");
      return;
    }
    if (id) setSelection({ mode: "respondent", subject: id });
    setTab("history");
  }
  function navigate(t: Tab) {
    if (t === "history") history();
    else {
      setTab(t);
      if (t === "topics" && room && !room.topics.length) setOverlay("topics");
    }
  }
  function start() {
    const r = current(),
      count = r.members.filter(
        (m) => m.online && m.role === "respondent",
      ).length;
    if (
      count < 2 ||
      count > 10 ||
      !r.topics.some((t) => t.status === "queued")
    ) {
      setOverlay("start");
      return;
    }
    send("session.start", () => ({
      ...phase(),
      expectedQueueVersion: current().queueVersion,
    }));
  }
  function next() {
    if (!current().topics.some((t) => t.status === "queued")) {
      setOverlay("topics");
      return;
    }
    send("round.next", () => ({
      ...phase(),
      expectedQueueVersion: current().queueVersion,
    }));
  }
  function reveal() {
    const r = current();
    if (r.guessing.completedCount < r.guessing.eligibleCount)
      setOverlay("reveal");
    else send("results.reveal", () => ({ ...phase(), allowIncomplete: false }));
  }
  const post = () => setOverlay("post"),
    close = () => setOverlay(undefined),
    historyError = (retry: () => void) => {
      retryAction.current = () => {
        close();
        retry();
      };
      setOverlay("failure");
    };
  let screen;
  if (room) {
    if (tab === "topics")
      screen = (
        <TopicsScreen
          room={room}
          busy={busy}
          onPost={post}
          onDelete={(topic) => {
            setDeleting(topic);
            setOverlay("delete");
          }}
          onReorder={(orderedTopicIds) =>
            send("topic.reorder", () => ({ ...queue(), orderedTopicIds }))
          }
          onNext={next}
        />
      );
    else if (tab === "history")
      screen = (
        <main
          className={`page history-page ${room.phase === "REVEALED" ? "review-page" : ""}`}
        >
          <HistoryBrowser
            room={room}
            connection={connection}
            selection={selection}
            onSelect={setSelection}
            mobile={mobile}
            onError={historyError}
          />
          {room.phase === "REVEALED" && (
            <div className="results-actions">
              <Button variant="secondary" onClick={() => setTab("play")}>
                正解発表に戻る
              </Button>
              {room.me.isHost && (
                <Button
                  disabled={busy}
                  onClick={() => send("session.restart", phase)}
                >
                  もう一度あそぶ
                </Button>
              )}
            </div>
          )}
        </main>
      );
    else if (room.phase === "LOBBY")
      screen = (
        <LobbyScreen
          room={room}
          busy={busy}
          onRole={(role) => {
            if (role !== room.me.role)
              send("role.set", () => ({
                role,
                expectedMemberVersion: current().me.memberVersion,
              }));
          }}
          onStart={start}
        />
      );
    else if (room.phase === "ANSWERING")
      screen = (
        <AnswerScreen
          key={`${room.sessionId}:${room.currentRound?.topicId}`}
          room={room}
          busy={busy}
          onPost={post}
          onHistory={() => history()}
          onSubmit={(text) => {
            const topicId = room.currentRound!.topicId;
            send("answer.submit", () => ({
              topicId,
              text,
              expectedVersion: current().me.submission?.version || 0,
            }));
          }}
          onWithdraw={() => {
            const topicId = room.currentRound!.topicId;
            send("answer.withdraw", () => ({
              topicId,
              expectedVersion: current().me.submission?.version || 0,
            }));
          }}
        />
      );
    else if (room.phase === "DISCUSSING")
      screen = (
        <DiscussionScreen
          room={room}
          busy={busy}
          onHistory={history}
          onPost={post}
          onNext={next}
          onGuess={() => send("guessing.start", phase)}
        />
      );
    else if (room.phase === "GUESSING")
      screen = (
        <GuessingScreen
          room={room}
          connection={connection}
          busy={busy}
          mobile={mobile}
          selection={selection}
          onSelect={setSelection}
          onChoices={(choices) =>
            send("prediction.save", () => ({
              choices,
              expectedVersion: current().me.prediction?.version || 0,
            }))
          }
          onComplete={() =>
            room.me.prediction?.completed
              ? send("prediction.reopen", () => ({
                  expectedVersion: current().me.prediction!.version,
                }))
              : send("prediction.complete", () => ({
                  choices: current().me.prediction!.choices,
                  expectedVersion: current().me.prediction!.version,
                }))
          }
          onReveal={reveal}
          onError={historyError}
        />
      );
    else if (room.phase === "REVEALED")
      screen = (
        <ResultsScreen
          room={room}
          busy={busy}
          onReview={() => history()}
          onRestart={() => send("session.restart", phase)}
        />
      );
  }
  const feedbackKind =
    state.status === "connecting"
      ? "connecting"
      : state.status === "failed" && !connectionDismissed
        ? state.error === "NOT_IN_INSTANCE"
          ? "instance"
          : "connection"
        : overlay && !["post", "delete", "reveal"].includes(overlay)
          ? (overlay as FeedbackKind)
          : undefined;
  return (
    <div className="app">
      {room && (
        <Navigation
          value={tab}
          onChange={navigate}
          revealed={room.phase === "REVEALED"}
        />
      )}
      {screen}
      {state.status === "connected" && overlay === "post" && (
        <TopicComposer
          draft={topicDraft}
          onDraft={setTopicDraft}
          busy={busy}
          onClose={close}
          onSubmit={() =>
            send(
              "topic.create",
              () => ({ text: topicDraft }),
              () => {
                setTopicDraft("");
                close();
              },
            )
          }
        />
      )}
      {state.status === "connected" && overlay === "delete" && deleting && (
        <Modal
          title="お題を削除しますか？"
          onClose={close}
          actions={
            <>
              <Button variant="secondary" onClick={close}>
                キャンセル
              </Button>
              <Button
                disabled={busy}
                onClick={() =>
                  send(
                    "topic.delete",
                    () => ({ ...queue(), topicId: deleting.topicId }),
                    close,
                  )
                }
              >
                削除する
              </Button>
            </>
          }
        >
          <div className="delete-question">{deleting.text}</div>
        </Modal>
      )}
      {state.status === "connected" && overlay === "reveal" && (
        <Modal
          className="reveal-confirm"
          title="正解発表に進みますか？"
          onClose={close}
          actions={
            <>
              <Button variant="secondary" onClick={close}>
                予想に戻る
              </Button>
              <Button
                disabled={busy}
                onClick={() =>
                  send(
                    "results.reveal",
                    () => ({ ...phase(), allowIncomplete: true }),
                    close,
                  )
                }
              >
                正解を発表する
              </Button>
            </>
          }
        />
      )}
      {feedbackKind && (
        <Feedback
          kind={feedbackKind}
          onClose={
            state.status === "connected"
              ? close
              : () => setConnectionDismissed(true)
          }
          onAction={() => {
            if (state.status !== "connected") {
              if (feedbackKind === "instance") setConnectionDismissed(true);
              else connection.retry();
            } else if (["topics", "start"].includes(feedbackKind)) post();
            else if (feedbackKind === "history") {
              close();
              setTab("play");
            } else if (feedbackKind === "failure") retryAction.current();
            else close();
          }}
        />
      )}
    </div>
  );
}
