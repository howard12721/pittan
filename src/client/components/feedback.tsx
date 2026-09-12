import { Button, Modal } from "./primitives";
export const feedback = {
  connecting: {
    title: "接続しています",
    body: "Discordへの接続を確認しています。",
  },
  connection: {
    title: "接続できませんでした",
    body: "Discordとの接続を確認して、もう一度試してください。",
  },
  topics: {
    title: "お題がまだありません",
    body: "お題を投稿して、セッションをはじめましょう。",
  },
  history: {
    title: "回答履歴はまだありません",
    body: "回答が公開されると、ここに表示されます。",
  },
  failure: {
    title: "操作を完了できませんでした",
    body: "入力内容を残しています。もう一度試してください。",
  },
  start: {
    title: "参加条件を確認してください",
    body: "回答者2〜10人と、お題1件以上が必要です。",
  },
  limit: {
    title: "操作を受け付けられません",
    body: "人数・投稿数の上限、または操作の間隔を確認してください。",
  },
  instance: {
    title: "このActivityに参加してください",
    body: "DiscordからActivityを開き直してください。",
  },
} as const;
export type FeedbackKind = keyof typeof feedback;
export function Feedback({
  kind,
  onClose,
  onAction,
}: {
  kind: FeedbackKind;
  onClose?: () => void;
  onAction?: () => void;
}) {
  const item = feedback[kind];
  const primary =
    kind === "connection" || kind === "failure"
      ? "もう一度試す"
      : kind === "topics" || kind === "start"
        ? "お題を投稿"
        : kind === "history"
          ? "プレイに戻る"
          : "閉じる";
  const two = ["connection", "failure", "start"].includes(kind);
  return (
    <Modal
      title={item.title}
      kind="proposal"
      className={`feedback-${kind}`}
      onClose={kind === "connecting" ? undefined : onClose}
      actions={
        kind === "connecting" ? undefined : (
          <>
            {two && (
              <Button variant="secondary" onClick={onClose}>
                閉じる
              </Button>
            )}
            <Button
              variant={primary === "閉じる" ? "secondary" : "primary"}
              onClick={onAction || onClose}
            >
              {primary}
            </Button>
          </>
        )
      }
    >
      <p>{item.body}</p>
    </Modal>
  );
}
