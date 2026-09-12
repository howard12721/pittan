import { describe, expect, it } from "vitest";
import type { HistoryView } from "../src/shared/protocol";
import {
  historyCacheIsFresh,
  mergeHistoryRefresh,
} from "../src/client/history-cache";

const uuid = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

function history(
  version: number,
  topicNumbers: number[],
  nextCursor: number | null,
): HistoryView {
  return {
    sessionId: uuid(1),
    historyVersion: version,
    visibility: "anonymous",
    view: "respondent",
    subject: "A",
    nextCursor,
    entries: topicNumbers.map((number) => ({
      topicId: uuid(number),
      roundNumber: number,
      question: `question ${number}`,
      answers: [{ anonymousId: "A", text: `answer ${number}` }],
    })),
  };
}

describe("history cache", () => {
  it("keeps immutable topic history and refreshes respondent history by version", () => {
    const cached = history(1, [2, 1], null),
      topic = { ...cached, view: "topic" as const };
    expect(historyCacheIsFresh(topic, "topic", 2)).toBe(true);
    expect(historyCacheIsFresh(cached, "respondent", 1)).toBe(true);
    expect(historyCacheIsFresh(cached, "respondent", 2)).toBe(false);
  });

  it("prepends new respondent entries without dropping cached history", () => {
    const cached = history(1, [2, 1], null),
      fresh = history(2, [3, 2], null),
      merged = mergeHistoryRefresh(cached, fresh);
    expect(merged.entries.map((entry) => entry.roundNumber)).toEqual([3, 2, 1]);
    expect(merged.nextCursor).toBeNull();
    expect(merged.historyVersion).toBe(2);
  });
});
