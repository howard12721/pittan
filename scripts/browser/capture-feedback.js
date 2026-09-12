async (page) => {
  const cases = [
    {
      key: "pc-feedback-connection",
      nodeId: "157:3",
      fixture: "lobby",
      feedback: "connection",
      viewport: { width: 1280, height: 800 },
      screenshot: "output/playwright/pc-feedback-connection.png",
    },
    {
      key: "pc-feedback-connecting",
      nodeId: "158:5",
      fixture: "lobby",
      feedback: "connecting",
      viewport: { width: 1280, height: 800 },
      screenshot: "output/playwright/pc-feedback-connecting.png",
    },
    {
      key: "pc-feedback-topics",
      nodeId: "158:15",
      fixture: "lobby",
      feedback: "topics",
      viewport: { width: 1280, height: 800 },
      screenshot: "output/playwright/pc-feedback-topics.png",
    },
    {
      key: "pc-feedback-history",
      nodeId: "158:25",
      fixture: "lobby",
      feedback: "history",
      viewport: { width: 1280, height: 800 },
      screenshot: "output/playwright/pc-feedback-history.png",
    },
    {
      key: "pc-feedback-failure",
      nodeId: "158:35",
      fixture: "lobby",
      feedback: "failure",
      viewport: { width: 1280, height: 800 },
      screenshot: "output/playwright/pc-feedback-failure.png",
    },
    {
      key: "pc-feedback-start",
      nodeId: "159:23",
      fixture: "lobby",
      feedback: "start",
      viewport: { width: 1280, height: 800 },
      screenshot: "output/playwright/pc-feedback-start.png",
    },
    {
      key: "pc-feedback-limit",
      nodeId: "159:33",
      fixture: "lobby",
      feedback: "limit",
      viewport: { width: 1280, height: 800 },
      screenshot: "output/playwright/pc-feedback-limit.png",
    },
    {
      key: "pc-feedback-instance",
      nodeId: "159:43",
      fixture: "lobby",
      feedback: "instance",
      viewport: { width: 1280, height: 800 },
      screenshot: "output/playwright/pc-feedback-instance.png",
    },
    {
      key: "mobile-feedback-connection",
      nodeId: "160:23",
      fixture: "lobby",
      feedback: "connection",
      viewport: { width: 390, height: 844 },
      screenshot: "output/playwright/mobile-feedback-connection.png",
    },
    {
      key: "mobile-feedback-connecting",
      nodeId: "160:31",
      fixture: "lobby",
      feedback: "connecting",
      viewport: { width: 390, height: 844 },
      screenshot: "output/playwright/mobile-feedback-connecting.png",
    },
    {
      key: "mobile-feedback-topics",
      nodeId: "160:36",
      fixture: "lobby",
      feedback: "topics",
      viewport: { width: 390, height: 844 },
      screenshot: "output/playwright/mobile-feedback-topics.png",
    },
    {
      key: "mobile-feedback-history",
      nodeId: "160:43",
      fixture: "lobby",
      feedback: "history",
      viewport: { width: 390, height: 844 },
      screenshot: "output/playwright/mobile-feedback-history.png",
    },
    {
      key: "mobile-feedback-failure",
      nodeId: "160:50",
      fixture: "lobby",
      feedback: "failure",
      viewport: { width: 390, height: 844 },
      screenshot: "output/playwright/mobile-feedback-failure.png",
    },
    {
      key: "mobile-feedback-start",
      nodeId: "160:66",
      fixture: "lobby",
      feedback: "start",
      viewport: { width: 390, height: 844 },
      screenshot: "output/playwright/mobile-feedback-start.png",
    },
    {
      key: "mobile-feedback-limit",
      nodeId: "160:74",
      fixture: "lobby",
      feedback: "limit",
      viewport: { width: 390, height: 844 },
      screenshot: "output/playwright/mobile-feedback-limit.png",
    },
    {
      key: "mobile-feedback-instance",
      nodeId: "160:81",
      fixture: "lobby",
      feedback: "instance",
      viewport: { width: 390, height: 844 },
      screenshot: "output/playwright/mobile-feedback-instance.png",
    },
  ];
  for (const c of cases) {
    await page.setViewportSize(c.viewport);
    await page.goto(
      "http://127.0.0.1:5173/?fixture=lobby&feedback=" + c.feedback,
    );
    await page.locator("dialog").waitFor();
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: c.screenshot });
    await page
      .locator("dialog")
      .screenshot({ path: c.screenshot.replace(".png", "-panel.png") });
  }
  return { captured: cases.length };
}
