async (page) => {
  const browser = page.context().browser();
  const contexts = [
    await browser.newContext({ viewport: { width: 1280, height: 800 } }),
    await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    }),
  ];
  const [a, b] = await Promise.all(contexts.map((c) => c.newPage()));
  const room = "qa-" + Date.now(),
    errors = [];
  for (const p of [a, b]) p.on("pageerror", (e) => errors.push(e.message));
  try {
    await a.goto("http://127.0.0.1:5173/?room=" + room + "&user=alpha");
    await a.locator(".role-card").first().waitFor();
    await b.goto("http://127.0.0.1:5173/?room=" + room + "&user=beta");
    await Promise.all(
      [a, b].map((p) =>
        p.locator(".role-card").first().getByRole("button").click(),
      ),
    );
    const host = (await a
      .getByRole("button", { name: "セッションをはじめる", exact: true })
      .isVisible())
      ? a
      : b;
    const other = host === a ? b : a;
    await host
      .locator(".desktop-nav")
      .getByRole("button", { name: "お題", exact: true })
      .click();
    await host.getByRole("button", { name: "お題を投稿", exact: true }).click();
    await host
      .getByRole("textbox", { name: "お題を投稿", exact: true })
      .fill("1週間だけ別の仕事をするなら？");
    await host.getByRole("button", { name: "投稿する", exact: true }).click();
    await host
      .locator(".desktop-nav")
      .getByRole("button", { name: "プレイ", exact: true })
      .click();
    await host
      .getByRole("button", { name: "セッションをはじめる", exact: true })
      .click();
    await a
      .getByRole("textbox", { name: "ここに回答を書く" })
      .fill("深夜のラジオDJ。好きな曲だけ流したい。");
    await b
      .getByRole("textbox", { name: "ここに回答を書く" })
      .fill("水族館の飼育員。ペンギンの相関図を作る。");
    await a
      .getByRole("button", { name: "回答を送信する", exact: true })
      .click();
    await a.getByRole("heading", { name: "待機中" }).waitFor();
    const privacy = !(await b.locator("body").innerText()).includes(
      "深夜のラジオDJ",
    );
    await b
      .getByRole("button", { name: "回答を送信する", exact: true })
      .click();
    await host
      .getByRole("button", { name: "回答を公開する", exact: true })
      .click();
    await Promise.all(
      [a, b].map((p) => p.locator(".answer-card").first().waitFor()),
    );
    await host
      .getByRole("button", { name: "回答フェーズに進む", exact: true })
      .click();
    await Promise.all(
      [a, b].map((p) => p.locator(".guess-row").first().waitFor()),
    );
    for (const p of [a, b]) {
      await p.locator(".guess-row>button:not([disabled])").first().click();
      await p.locator(".candidate-list button:not([disabled])").first().click();
      await p
        .getByRole("button", { name: "予想を完了する", exact: true })
        .click();
    }
    await host.getByRole("button", { name: "正解発表へ", exact: true }).click();
    await Promise.all(
      [a, b].map((p) =>
        p.getByRole("heading", { name: "正解発表", exact: true }).waitFor(),
      ),
    );
    const scores = await Promise.all(
      [a, b].map((p) => p.locator(".score").innerText()),
    );
    await host
      .getByRole("button", { name: "回答を振り返る", exact: true })
      .click();
    await host.locator(".answer-card.revealed").first().waitFor();
    const review = await host.locator(".answer-card.revealed").count();
    await host
      .getByRole("button", { name: "もう一度あそぶ", exact: true })
      .click();
    await Promise.all(
      [a, b].map((p) =>
        p.getByRole("heading", { name: "ぴったん", exact: true }).waitFor(),
      ),
    );
    return { privacy, scores, review, restarted: true, errors };
  } finally {
    for (const c of contexts) await c.close();
  }
}
