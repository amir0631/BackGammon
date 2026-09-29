import { describe, expect, it, vi } from "vitest";
import type { MatchFoundOut, ServerEnvelope } from "@bg/protocol";
import { QueueFlow, type QueueCallbacks, type QueueRequest, type QueueState } from "./queue";

const REQ: QueueRequest = { tier_id: 100, variant: "standard_cube", length: 3 };
const FOUND = { match_id: "m1" } as unknown as MatchFoundOut;

function env(type: string, payload: Record<string, unknown>): ServerEnvelope {
  return { type, match_id: null, seq: 0, payload } as unknown as ServerEnvelope;
}
const status = (state: string, reason: string | null = null) =>
  env("queue.status", { state, tier_id: 100, variant: "standard_cube", length: 3, reason });

function setup() {
  let clock = 1_000;
  const timers: { fn: () => void; at: number; id: number }[] = [];
  let nextId = 1;
  const sent: string[] = [];
  const states: QueueState[] = [];
  const cb: QueueCallbacks = {
    onJoinError: vi.fn(),
    onRemoved: vi.fn(),
    onLeftElsewhere: vi.fn(),
    onFoundElsewhere: vi.fn(),
    onFound: vi.fn(),
  };
  const flow = new QueueFlow({
    send: (type) => sent.push(type),
    onState: (s) => states.push(s),
    callbacks: () => cb,
    slowMs: 10_000,
    now: () => clock,
    setTimer: (fn, ms) => {
      const id = nextId++;
      timers.push({ fn, at: clock + ms, id });
      return id;
    },
    clearTimer: (id) => {
      const i = timers.findIndex((t) => t.id === id);
      if (i >= 0) timers.splice(i, 1);
    },
  });
  const advance = (ms: number) => {
    clock += ms;
    for (const t of [...timers].sort((a, b) => a.at - b.at)) {
      if (t.at <= clock && timers.includes(t)) {
        timers.splice(timers.indexOf(t), 1);
        t.fn();
      }
    }
  };
  return { flow, sent, states, cb, advance };
}

describe("QueueFlow", () => {
  it("joins, waits, and ignores repeat taps while a join is in flight", () => {
    const { flow, sent } = setup();
    flow.join(REQ);
    flow.join(REQ);
    expect(sent).toEqual(["queue.join"]);
    flow.handle(status("waiting"));
    expect(flow.state).toMatchObject({ kind: "waiting", again: false });
  });

  it("marks a slow join and then allows another tap", () => {
    const { flow, sent, advance } = setup();
    flow.join(REQ);
    advance(10_000);
    expect(flow.state).toMatchObject({ kind: "joining", slow: true });
    flow.join(REQ);
    expect(sent).toEqual(["queue.join", "queue.join"]);
  });

  it("goes waiting → offline → waiting (again), and the 'again' line fades", () => {
    const { flow, advance } = setup();
    flow.join(REQ);
    flow.handle(status("waiting"));
    advance(5_000);
    flow.socketStatus("reconnecting");
    expect(flow.state).toEqual({ kind: "offline", req: REQ, elapsed: 5_000 });
    flow.handle(status("waiting"));
    expect(flow.state).toMatchObject({ kind: "waiting", again: true });
    advance(3_000);
    expect(flow.state).toMatchObject({ kind: "waiting", again: false });
  });

  it("routes match.found to this search, the cancel race, or elsewhere", () => {
    const a = setup();
    a.flow.join(REQ);
    a.flow.handle(status("waiting"));
    a.flow.handle(env("match.found", FOUND as unknown as Record<string, unknown>));
    expect(a.cb.onFound).toHaveBeenCalledWith(FOUND, false);

    const b = setup();
    b.flow.join(REQ);
    b.flow.handle(status("waiting"));
    b.flow.cancel();
    b.flow.handle(status("left")); // our own leave: no "left elsewhere"
    expect(b.cb.onLeftElsewhere).not.toHaveBeenCalled();
    b.advance(29_000);
    b.flow.handle(env("match.found", FOUND as unknown as Record<string, unknown>));
    expect(b.cb.onFound).toHaveBeenCalledWith(FOUND, true);
    expect(b.flow.state).toMatchObject({ kind: "found", race: true, req: REQ });

    const c = setup();
    c.flow.join(REQ);
    c.flow.handle(status("waiting"));
    c.flow.cancel();
    c.advance(31_000);
    c.flow.handle(env("match.found", FOUND as unknown as Record<string, unknown>));
    expect(c.cb.onFound).not.toHaveBeenCalled();
    expect(c.cb.onFoundElsewhere).toHaveBeenCalledWith(FOUND);
  });

  it("reports removal, a leave from elsewhere, and join errors", () => {
    const a = setup();
    a.flow.join(REQ);
    a.flow.handle(status("waiting"));
    a.flow.handle(status("removed", "insufficient"));
    expect(a.cb.onRemoved).toHaveBeenCalledWith("insufficient", REQ);
    expect(a.flow.state).toEqual({ kind: "idle" });

    const b = setup();
    b.flow.join(REQ);
    b.flow.handle(status("waiting"));
    b.flow.handle(status("left"));
    expect(b.cb.onLeftElsewhere).toHaveBeenCalled();

    const c = setup();
    c.flow.join(REQ);
    const error = { code: "WALLET_INSUFFICIENT", message_key: "errors.wallet.insufficient", details: {} };
    c.flow.handle(env("error", error));
    expect(c.cb.onJoinError).toHaveBeenCalledWith(error, REQ);
    expect(c.flow.state).toEqual({ kind: "idle" });
  });
});
