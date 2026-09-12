import { DiscordSDK } from "@discord/embedded-app-sdk";
import {
  CommandSchema,
  HistoryViewSchema,
  ServerMessage,
  type Command,
  type CommandName,
  type ErrorCode,
  type HistoryView,
  type Payload,
  type RoomView,
} from "../shared/protocol";

export class RequestError extends Error {
  constructor(public code: ErrorCode) {
    super(code);
  }
}
export type ConnectionState = {
  view?: RoomView;
  status: "connecting" | "connected" | "failed";
  error?: ErrorCode;
};
export interface GameConnection {
  subscribe(listener: () => void): () => void;
  getSnapshot(): ConnectionState;
  start(): void;
  stop(): void;
  retry(): void;
  command<N extends CommandName>(name: N, payload: Payload<N>): Promise<void>;
  history(
    view: "topic" | "respondent",
    subject: string,
    cursor?: number,
  ): Promise<HistoryView>;
}
type Pending = {
  command: Command;
  resolve: () => void;
  reject: (reason: RequestError) => void;
  revision?: number;
  timer?: ReturnType<typeof setTimeout>;
};
export class ActivityConnection implements GameConnection {
  private state: ConnectionState = { status: "connecting" };
  private listeners = new Set<() => void>();
  private pending = new Map<string, Pending>();
  private token = "";
  private roomId = "";
  private instanceId = "";
  private socket?: WebSocket;
  private retryTimer?: ReturnType<typeof setTimeout>;
  private stopped = false;
  private connecting = false;
  private attempts = 0;
  private sdk?: DiscordSDK;
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  getSnapshot = () => this.state;
  private update(change: Partial<ConnectionState>) {
    this.state = { ...this.state, ...change };
    for (const fn of this.listeners) fn();
  }
  private async request(path: string, body?: unknown) {
    const response = await fetch(path, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    const data = await response.json();
    if (!response.ok)
      throw new RequestError(data.errorCode || "STORAGE_UNAVAILABLE");
    return data;
  }
  private resume = () => {
    if (!document.hidden && !this.stopped) this.retry();
  };
  private offline = () => {
    this.socket?.close();
  };
  start = () => {
    this.stopped = false;
    window.addEventListener("online", this.resume);
    window.addEventListener("offline", this.offline);
    document.addEventListener("visibilitychange", this.resume);
    void this.connect();
  };
  stop = () => {
    this.stopped = true;
    window.removeEventListener("online", this.resume);
    window.removeEventListener("offline", this.offline);
    document.removeEventListener("visibilitychange", this.resume);
    clearTimeout(this.retryTimer);
    for (const p of this.pending.values()) clearTimeout(p.timer);
    this.socket?.close();
  };
  retry = () => {
    this.attempts = 0;
    clearTimeout(this.retryTimer);
    if (
      this.state.error === "AUTH_EXPIRED" ||
      this.state.error === "UNAUTHENTICATED"
    )
      this.token = "";
    const old = this.socket;
    this.socket = undefined;
    old?.close();
    void this.connect();
  };
  private async connect() {
    if (this.stopped || this.connecting) return;
    this.connecting = true;
    this.update({ status: "connecting", error: undefined });
    try {
      if (!this.token) {
        const config = await this.request("/api/config");

        if (config.devAuth && import.meta.env.DEV) {
          const query = new URLSearchParams(location.search),
            user = query.get("user") || "yui";
          const auth = await this.request("/api/auth/dev", {
            user,
            name: query.get("name") || user,
          });
          this.token = auth.sessionToken;
          this.instanceId = query.get("room") || "local-room";
        } else {
          this.sdk ??= new DiscordSDK(config.clientId);
          await this.sdk.ready();
          const { code } = await this.sdk.commands.authorize({
            client_id: config.clientId,
            response_type: "code",
            state: crypto.randomUUID(),
            prompt: "none",
            scope: ["identify"],
          });
          const auth = await this.request("/api/auth/discord", { code });
          await this.sdk.commands.authenticate({
            access_token: auth.accessToken,
          });
          this.token = auth.sessionToken;
          this.instanceId = this.sdk.instanceId;
        }
        this.roomId = "";
      }
      if (!this.roomId)
        this.roomId = (
          await this.request("/api/rooms/join", { instanceId: this.instanceId })
        ).roomId;
      const { ticket } = await this.request(
        `/api/rooms/${this.roomId}/ws-ticket`,
        {},
      );
      if (this.stopped) return;
      const url = new URL("/ws", location.href);
      url.protocol = location.protocol === "https:" ? "wss:" : "ws:";
      const socket = new WebSocket(url);
      this.socket = socket;
      const handshake = setTimeout(() => socket.close(), 10_000);
      socket.onopen = () =>
        socket.send(JSON.stringify({ type: "authenticate", ticket }));
      socket.onmessage = (event) => {
        if (socket !== this.socket || this.stopped) return;
        try {
          const data = ServerMessage.parse(JSON.parse(event.data));
          if (data.type === "snapshot") {
            clearTimeout(handshake);
            const first = this.state.status !== "connected";
            if (
              !this.state.view ||
              data.view.revision >= this.state.view.revision ||
              data.view.roomId !== this.state.view.roomId
            )
              this.update({
                view: data.view,
                status: "connected",
                error: undefined,
              });
            this.attempts = 0;
            for (const [id, item] of this.pending) {
              if (
                item.revision !== undefined &&
                data.view.revision >= item.revision
              ) {
                this.pending.delete(id);
                clearTimeout(item.timer);
                item.resolve();
              } else if (first) this.transmit(item);
            }
          } else if (data.type === "ack") {
            const item = this.pending.get(data.commandId);
            if (!item) return;
            if (data.status === "rejected") {
              this.pending.delete(data.commandId);
              clearTimeout(item.timer);
              item.reject(new RequestError(data.errorCode || "INVALID_INPUT"));
            } else if (
              (this.state.view?.revision ?? -1) >= data.appliedRevision!
            ) {
              this.pending.delete(data.commandId);
              clearTimeout(item.timer);
              item.resolve();
            } else item.revision = data.appliedRevision;
          } else {
            this.update({ error: data.errorCode });
            socket.close();
          }
        } catch {
          this.update({ error: "UPDATE_REQUIRED" });
          socket.close();
        }
      };
      socket.onclose = () => {
        clearTimeout(handshake);
        if (this.socket !== socket || this.stopped) return;
        this.scheduleReconnect();
      };
      socket.onerror = () => socket.close();
    } catch (error) {
      this.update({
        error:
          error instanceof RequestError ? error.code : "STORAGE_UNAVAILABLE",
      });
      this.scheduleReconnect();
    } finally {
      this.connecting = false;
    }
  }
  private scheduleReconnect() {
    if (this.stopped) return;
    if (this.state.error === "NOT_IN_INSTANCE")
      this.update({ view: undefined });
    const fatal = [
      "NOT_IN_INSTANCE",
      "AUTH_EXPIRED",
      "UNAUTHENTICATED",
      "UPDATE_REQUIRED",
      "FORBIDDEN",
    ].includes(this.state.error || "");
    if (fatal || this.attempts >= 5) {
      this.update({ status: "failed" });
      // Keep ambiguous operations and their UUIDs for an explicit reconnect retry.
      for (const p of this.pending.values()) clearTimeout(p.timer);
      return;
    }
    this.update({ status: "connecting" });
    clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(
      () => {
        void this.connect();
      },
      Math.min(5000, 300 * 2 ** this.attempts++),
    );
  }
  command<N extends CommandName>(name: N, payload: Payload<N>): Promise<void> {
    const view = this.state.view;
    if (
      !view ||
      this.state.status !== "connected" ||
      this.socket?.readyState !== WebSocket.OPEN
    )
      return Promise.reject(new RequestError("STORAGE_UNAVAILABLE"));
    const command = CommandSchema.parse({
      type: "command",
      wireVersion: 1,
      commandId: crypto.randomUUID(),
      sessionId: view.sessionId,
      name,
      payload,
    });
    return new Promise((resolve, reject) => {
      const pending = { command, resolve, reject };
      this.pending.set(command.commandId, pending);
      this.transmit(pending);
    });
  }
  private transmit(pending: Pending) {
    clearTimeout(pending.timer);
    const socket = this.socket!;
    socket.send(JSON.stringify(pending.command));
    pending.timer = setTimeout(() => {
      if (socket === this.socket) socket.close();
    }, 10_000);
  }
  async history(view: "topic" | "respondent", subject: string, cursor = 0) {
    const state = this.state.view!;
    return HistoryViewSchema.parse(
      await this.request(
        `/api/rooms/${this.roomId}/sessions/${state.sessionId}/history?${new URLSearchParams({ view, subject, cursor: String(cursor), limit: "20" })}`,
      ),
    );
  }
}
