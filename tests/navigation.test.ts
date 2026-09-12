import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Navigation } from "../src/client/components/primitives";

describe("Navigation", () => {
  it("hides the topics tab after identities are revealed", () => {
    const html = renderToStaticMarkup(
      createElement(Navigation, {
        value: "play",
        onChange: () => {},
        revealed: true,
      }),
    );

    expect(html).not.toContain("お題");
  });
});
