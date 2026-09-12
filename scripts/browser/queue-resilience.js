async (page) => {
  const context = await page
      .context()
      .browser()
      .newContext({ viewport: { width: 1280, height: 800 } }),
    p = await context.newPage();
  const room = "queue-" + Date.now(),
    errors = [];
  let stage = "start";
  p.on("pageerror", (e) => errors.push(e.message));
  try {
    await p.goto("http://127.0.0.1:5173/?room=" + room + "&user=queue");
    await p.locator(".role-card").first().waitFor();
    await p
      .locator(".desktop-nav")
      .getByRole("button", { name: "お題", exact: true })
      .click();
    await p.getByRole("button", { name: "お題を投稿", exact: true }).click();
    const questions = [
      "自由に使える100万円があったら？",
      "最近、密かにハマっていることは？",
      "1週間だけ別の仕事をするなら？",
    ];
    for (let i = 0; i < questions.length; i++) {
      if (i)
        await p
          .getByRole("button", { name: "お題を投稿する", exact: false })
          .click();
      await p
        .getByRole("textbox", { name: "お題を投稿", exact: true })
        .fill(questions[i]);
      await p.getByRole("button", { name: "投稿する", exact: true }).click();
      await p.locator("dialog").waitFor({ state: "detached" });
    }
    stage = "mouse";
    const before = await p.locator(".queue-list .topic-text").allTextContents();
    const handle = p.locator(".drag-handle").first(),
      target = p.locator(".sortable-topic").nth(2),
      from = await handle.boundingBox(),
      to = await target.boundingBox();
    await p.mouse.move(from.x + 20, from.y + 20);
    await p.mouse.down();
    await p.mouse.move(from.x + 20, to.y + to.height - 8, { steps: 18 });
    await p.mouse.up();
    await p.waitForFunction(
      (first) =>
        document.querySelector(".queue-list .topic-text")?.textContent !==
        first,
      before[0],
    );
    await p.waitForFunction(
      () => !document.querySelector(".sortable-topic.dragging"),
    );
    await p.waitForFunction(
      () => !document.querySelector(".drag-handle")?.disabled,
    );
    await p.waitForTimeout(500);
    stage = "keyboard";
    const afterMouse = await p
      .locator(".queue-list .topic-text")
      .allTextContents();
    await p.waitForFunction(
      () => !document.querySelector(".drag-handle")?.disabled,
    );
    await p.locator(".drag-handle").first().focus();
    await p.keyboard.press("Space");
    await p.locator(".sortable-topic.dragging:not([inert])").waitFor();
    await p.keyboard.press("ArrowDown");
    await p.waitForTimeout(300);
    await p.keyboard.press("Space");
    await p.waitForFunction(
      (first) =>
        document.querySelector(".queue-list .topic-text")?.textContent !==
        first,
      afterMouse[0],
    );
    await p.waitForFunction(
      () => !document.querySelector(".sortable-topic.dragging"),
    );
    await p.waitForFunction(
      () => !document.querySelector("[data-dnd-placeholder]"),
    );
    await p.waitForTimeout(500);
    stage = "delete";
    const afterKeyboard = await p
      .locator(".queue-list .topic-text")
      .allTextContents();
    await p
      .locator(".sortable-topic")
      .first()
      .getByRole("button", { name: "削除", exact: true })
      .click();
    await p.getByRole("button", { name: "キャンセル", exact: true }).click();
    const afterCancel = await p.locator(".queue-list .topic-text").count();
    if (afterCancel !== 3) throw Error("cancel changed topic count");
    await p
      .locator(".sortable-topic")
      .first()
      .getByRole("button", { name: "削除", exact: true })
      .click();
    await p.getByRole("button", { name: "削除する", exact: true }).click();
    await p.waitForFunction(
      () => document.querySelectorAll(".queue-list .topic-text").length === 2,
    );
    await p
      .getByRole("button", { name: "お題を投稿する", exact: false })
      .click();
    await p
      .getByRole("textbox", { name: "お題を投稿", exact: true })
      .fill("最近あった、小さな幸せは？");
    stage = "draft";
    await p.reload();
    await p.locator(".role-card").first().waitFor();
    await p
      .locator(".desktop-nav")
      .getByRole("button", { name: "お題", exact: true })
      .click();
    await p
      .getByRole("button", { name: "お題を投稿する", exact: false })
      .click();
    const preserved = await p
      .getByRole("textbox", { name: "お題を投稿", exact: true })
      .inputValue();
    await p.getByRole("button", { name: "キャンセル", exact: true }).click();
    stage = "reconnect";
    await p.getByRole('button',{name:'お題を投稿する',exact:false}).click();
  await p.getByRole('textbox',{name:'お題を投稿',exact:true}).fill('自分だけの、ちょっとしたこだわりは？');
  await context.setOffline(true);
  await p.getByRole('heading',{name:'接続しています',exact:true}).waitFor();
  await context.setOffline(false);
  await p.getByRole('textbox',{name:'お題を投稿',exact:true}).waitFor();
  if(await p.getByRole('textbox',{name:'お題を投稿',exact:true}).inputValue()!=='自分だけの、ちょっとしたこだわりは？')throw Error('Reconnect lost draft');
  await p.getByRole('button',{name:'投稿する',exact:true}).click();
  await p.waitForFunction(
      () => document.querySelectorAll(".queue-list .topic-text").length === 3,
      null,
      { timeout: 20000 },
    );
    return {
      before,
      afterMouse,
      afterKeyboard,
      afterCancel,
      preserved,
      reconnected: true,
      errors,
    };
  } catch (e) {
    await p.screenshot({ path: "output/playwright/queue-failure.png" });
    throw new Error(stage + ": " + e.message);
  } finally {
    await context.close();
  }
}
