// Web Push subscription (CLAUDE.md §11.5): shared by both apps. Call only after the user allowed
// notifications, and never during a match prompt flow; the service worker shows the messages.
import { api } from "./index";

function toBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const b64 = base64url.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function toBase64url(buf: ArrayBuffer | null): string {
  if (!buf) return "";
  let s = "";
  for (const b of new Uint8Array(buf)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export type PushResult = "subscribed" | "unsupported" | "disabled" | "denied";

/** Subscribes this browser and registers it with the backend (idempotent). */
export async function subscribePush(registration: ServiceWorkerRegistration): Promise<PushResult> {
  if (!("pushManager" in registration)) return "unsupported";
  const { enabled, key } = await api.push.key();
  if (!enabled || !key) return "disabled";
  let sub: PushSubscription | null;
  try {
    sub =
      (await registration.pushManager.getSubscription()) ??
      (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toBytes(key) }));
  } catch {
    return "denied";
  }
  await api.push.subscribe({
    endpoint: sub.endpoint,
    p256dh: toBase64url(sub.getKey("p256dh")),
    auth: toBase64url(sub.getKey("auth")),
  });
  return "subscribed";
}

export async function unsubscribePush(registration: ServiceWorkerRegistration): Promise<void> {
  const sub = await registration.pushManager?.getSubscription();
  if (!sub) return;
  await api.push.unsubscribe(sub.endpoint);
  await sub.unsubscribe();
}
