import { test, expect } from "vitest";
import { createApp } from "../src/server/app";
test("malformed, oversized and rate limited requests retain their HTTP status", async () => {
  const { app } = await createApp({
    clientId: "test",
    clientSecret: "test",
    botToken: "test",
    devAuth: false,
    databasePath: ":memory:",
    allowedOrigin: "https://test.discordsays.com",
    maintenance: false,
  });
  try {
    const malformed = await app.inject({
      method: "POST",
      url: "/api/auth/discord",
      headers: { "content-type": "application/json" },
      payload: "{",
    });
    expect(malformed.statusCode).toBe(400);
    expect(malformed.json().errorCode).toBe("INVALID_INPUT");
    const oversized = await app.inject({
      method: "POST",
      url: "/api/auth/discord",
      payload: { code: "x".repeat(20_000) },
    });
    expect(oversized.statusCode).toBe(413);
    let limited = malformed;
    for (let i = 0; i < 61; i++)
      limited = await app.inject({
        method: "POST",
        url: "/api/auth/discord",
        payload: {},
      });
    expect(limited.statusCode).toBe(429);
    expect(limited.json().errorCode).toBe("RATE_LIMITED");
    expect(Number(limited.headers["retry-after"])).toBeGreaterThan(0);
  } finally {
    await app.close();
  }
});
