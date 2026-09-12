import { randomInt } from "node:crypto";
import {
  ANONYMOUS_IDS,
  type AnonymousId,
  type Choices,
} from "../shared/protocol.js";
import { requireCondition } from "./errors.js";

export function assignIdentities(memberIds: string[], pick = randomInt) {
  const shuffled = [...memberIds];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = pick(i + 1);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.map((memberId, i) => ({
    memberId,
    anonymousId: ANONYMOUS_IDS[i],
  }));
}
export function validateChoices(
  choices: Choices,
  identities: { memberId: string; anonymousId: AnonymousId }[],
  memberId: string,
  complete: boolean,
) {
  const result: Choices = {};
  const used = new Set<string>();
  requireCondition(
    Object.keys(choices).every((id) =>
      identities.some((i) => i.anonymousId === id),
    ),
    "INVALID_INPUT",
  );
  for (const identity of identities) {
    const target = choices[identity.anonymousId] ?? null;
    if (identity.memberId === memberId)
      requireCondition(target === memberId, "INVALID_INPUT");
    if (complete) requireCondition(target !== null, "INCOMPLETE");
    if (target !== null) {
      requireCondition(
        identities.some((i) => i.memberId === target) && !used.has(target),
        "INVALID_INPUT",
      );
      used.add(target);
    }
    result[identity.anonymousId] = target;
  }
  return result;
}
export function scoreChoices(
  choices: Choices,
  identities: { memberId: string; anonymousId: AnonymousId }[],
  memberId: string,
) {
  const scored = identities.filter((i) => i.memberId !== memberId);
  return {
    correct: scored.filter((i) => choices[i.anonymousId] === i.memberId).length,
    total: scored.length,
  };
}
