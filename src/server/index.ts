import { createApp } from "./app.js";

const devAuth = process.env.DEV_AUTH === "true";
const clientId =
  process.env.DISCORD_CLIENT_ID || (devAuth ? "local-pittan" : "");
const clientSecret = process.env.DISCORD_CLIENT_SECRET || "",
  botToken = process.env.DISCORD_BOT_TOKEN || "";
if (!devAuth && (!clientId || !clientSecret || !botToken))
  throw new Error("Discord credentials are required");
const host = process.env.HOST || "127.0.0.1";
if (devAuth && !["127.0.0.1", "::1"].includes(host))
  throw new Error("Development authentication requires loopback binding");
const { app } = await createApp({
  clientId,
  clientSecret,
  botToken,
  devAuth,
  databasePath: process.env.DATABASE_PATH || "./data/pittan.sqlite",
  allowedOrigin:
    process.env.ALLOWED_ACTIVITY_ORIGIN ||
    (devAuth ? "http://127.0.0.1:5173" : `https://${clientId}.discordsays.com`),
  staticDir:
    process.env.NODE_ENV === "production"
      ? new URL("../../client", import.meta.url).pathname
      : undefined,
});
for (const signal of ["SIGTERM", "SIGINT"])
  process.once(signal, () => {
    void app.close().then(() => process.exit(0));
  });
await app.listen({ host, port: Number(process.env.PORT || 3000) });
console.log(`pittan listening at ${host}:${process.env.PORT || 3000}`);
