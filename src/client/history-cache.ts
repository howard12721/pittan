import type { HistoryView } from "../shared/protocol";

export function historyCacheIsFresh(
  cached: HistoryView | undefined,
  mode: HistoryView["view"],
  historyVersion: number,
) {
  return (
    !!cached &&
    cached.view === mode &&
    (mode === "topic" || cached.historyVersion === historyVersion)
  );
}

export function mergeHistoryRefresh(
  cached: HistoryView | undefined,
  fresh: HistoryView,
) {
  if (
    !cached ||
    cached.sessionId !== fresh.sessionId ||
    cached.visibility !== fresh.visibility ||
    cached.view !== fresh.view ||
    cached.subject !== fresh.subject ||
    fresh.view !== "respondent" ||
    cached.historyVersion === fresh.historyVersion
  )
    return fresh;
  const entries = [
    ...fresh.entries,
    ...cached.entries.filter(
      (entry) =>
        !fresh.entries.some((candidate) => candidate.topicId === entry.topicId),
    ),
  ];
  return {
    ...fresh,
    entries,
    nextCursor:
      fresh.nextCursor === null || cached.nextCursor === null
        ? null
        : entries.length,
  };
}
