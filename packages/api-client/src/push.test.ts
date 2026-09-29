import { afterEach, describe, expect, it, vi } from "vitest";
import { subscribePush } from "./push";

describe("subscribePush", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("subscribes with the server key and registers the keys with the backend", async () => {
    const posted: unknown[] = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      if (url.endsWith("/push/key")) return new Response(JSON.stringify({ enabled: true, key: "AQID" }), { status: 200 });
      if (url.endsWith("/auth/csrf")) return new Response(null, { status: 204 });
      posted.push(JSON.parse(String(init.body)));
      return new Response(null, { status: 204 });
    });
    let options: PushSubscriptionOptionsInit | undefined;
    const sub = {
      endpoint: "https://fcm.googleapis.com/fcm/send/x",
      getKey: (name: string) => new Uint8Array(name === "auth" ? [1, 2] : [3, 4, 5]).buffer,
    };
    const registration = {
      pushManager: {
        getSubscription: async () => null,
        subscribe: async (o: PushSubscriptionOptionsInit) => {
          options = o;
          return sub;
        },
      },
    } as unknown as ServiceWorkerRegistration;
    expect(await subscribePush(registration)).toBe("subscribed");
    expect([...(options!.applicationServerKey as Uint8Array)]).toEqual([1, 2, 3]);
    expect(posted).toEqual([{ endpoint: sub.endpoint, p256dh: "AwQF", auth: "AQI" }]);
  });

  it("does nothing while push is not configured", async () => {
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ enabled: false, key: null }), { status: 200 }));
    const registration = { pushManager: {} } as unknown as ServiceWorkerRegistration;
    expect(await subscribePush(registration)).toBe("disabled");
  });
});
