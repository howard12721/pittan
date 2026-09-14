import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PredictionReview } from "../src/client/screens";
import type { RoomView } from "../src/shared/protocol";

const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

function revealedRoom(): RoomView {
  const names = ["yui", "ren", "mika", "sora"];
  const members: RoomView["members"] = names.map((displayName, index) => ({
    memberId: id(index + 1),
    displayName,
    avatarInitial: displayName[0],
    role: "respondent",
    online: true,
  }));
  const respondents = members.map(({ online, role, ...member }) => ({
    ...member,
    username: member.displayName,
  }));
  return {
    wireVersion: 1,
    roomId: id(20),
    revision: 1,
    serverTime: 0,
    sessionId: id(21),
    phase: "REVEALED",
    phaseVersion: 1,
    queueVersion: 1,
    historyVersion: 1,
    host: { memberId: members[0].memberId, epoch: 0 },
    members,
    respondents,
    identities: ["A", "B", "C", "D"].map((anonymousId) => ({
      anonymousId: anonymousId as "A" | "B" | "C" | "D",
    })),
    topics: [],
    currentRound: null,
    guessing: { eligibleCount: 1, completedCount: 1 },
    result: {
      identities: ["A", "B", "C", "D"].map((anonymousId, index) => ({
        anonymousId: anonymousId as "A" | "B" | "C" | "D",
        memberId: members[index].memberId,
      })),
      predictions: [
        {
          memberId: members[1].memberId,
          choices: {
            A: members[0].memberId,
            B: members[1].memberId,
            C: members[3].memberId,
            D: members[2].memberId,
          },
          score: { correct: 1, total: 3 },
        },
      ],
    },
    me: {
      memberId: members[0].memberId,
      memberVersion: 0,
      role: "respondent",
      isHost: true,
      myAnonymousId: "A",
      guessEligible: false,
    },
  };
}

describe("PredictionReview", () => {
  it("shows another participant's revealed choices and score", () => {
    const html = renderToStaticMarkup(
      createElement(PredictionReview, {
        room: revealedRoom(),
        busy: false,
        onBack: () => {},
        onRestart: () => {},
      }),
    );

    expect(html).toContain("みんなの予想");
    expect(html).toContain("ren の予想");
    expect(html).toContain("1 / 3");
    expect(html).toContain("✓ 正解");
    expect(html).toContain("本人");
    expect(html).toContain("× sora と予想");
    expect(html).toContain('aria-label="予想した人を選択。現在 ren"');
  });

  it("labels choices left blank by an incomplete reveal", () => {
    const room = revealedRoom();
    room.result!.predictions[0].choices.C = null;
    const html = renderToStaticMarkup(
      createElement(PredictionReview, {
        room,
        busy: false,
        onBack: () => {},
        onRestart: () => {},
      }),
    );

    expect(html).toContain("未回答");
  });
});
