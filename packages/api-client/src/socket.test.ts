import { describe, expect, it, vi } from "vitest";
import { GameSocket } from "./socket";

class FakeSocket {
  static all: FakeSocket[] = [];
  readyState = 0;
  sent: unknown[] = [];
  onopen: ((ev: unknown) => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onclose: ((ev: { code: number }) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  constructor() {
    FakeSocket.all.push(this);
  }
  send(data: string) {
    this.sent.push(JSON.parse(data));
  }
  close(code = 1000) {
    this.readyState = 3;
    this.onclose?.({ code });
  }
  open() {
    this.readyState = 1;
    this.onopen?.({});
  }
  receive(msg: unknown) {
    this.onmessage?.({ data: JSON.stringify(msg) });
  }
}

const flush = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

describe("GameSocket", () => {
  it("authenticates, attaches, sends against the last seq, and re-syncs after a drop", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    FakeSocket.all = [];
    const got: unknown[] = [];
    const statuses: string[] = [];
    const s = new GameSocket({
      getToken: async () => "tok",
      onMessage: (e) => got.push(e.type),
      onStatus: (st) => statuses.push(st),
      url: "ws://x/ws",
      createSocket: () => new FakeSocket() as never,
    });
    s.connect();
    s.attach("m1");
    const first = FakeSocket.all[0]!;
    first.open();
    await flush();
    expect(first.sent).toEqual([{ type: "auth", seq: 0, payload: { token: "tok" } }]);
    first.receive({ type: "auth.ok", match_id: null, seq: 0, payload: { username: "a" } });
    expect(first.sent[1]).toEqual({ type: "match.sync", match_id: "m1", seq: 0, payload: { last_seq: 0 } });
    first.receive({ type: "match.state", match_id: "m1", seq: 7, payload: {} });
    s.setLastSeq(7);
    s.send("turn.roll", {});
    expect(first.sent[2]).toEqual({ type: "turn.roll", match_id: "m1", seq: 7, payload: {} });

    first.close(1006);
    expect(statuses).toContain("reconnecting");
    vi.runAllTimers();
    const second = FakeSocket.all[1]!;
    second.open();
    await flush();
    second.receive({ type: "auth.ok", match_id: null, seq: 0, payload: { username: "a" } });
    expect(second.sent[1]).toEqual({ type: "match.sync", match_id: "m1", seq: 0, payload: { last_seq: 7 } });
    expect(got).toEqual(["match.state"]);
    s.close();
    expect(statuses.at(-1)).toBe("closed");
    vi.useRealTimers();
  });
});
