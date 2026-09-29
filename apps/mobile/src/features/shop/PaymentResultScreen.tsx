"use client";

import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, PAYMENT_POLL, paymentSettled } from "@bg/api-client";
import { iconSize } from "@bg/design-tokens";
import type { PaymentInfo } from "@bg/protocol";
import { CheckIcon, DotIcon, PendingIcon } from "@/components/icons";
import { SignedInShell } from "@/components/shell/SignedInShell";
import { InfoLine } from "@/components/wallet/InfoLine";
import { CopyButton } from "@/components/wallet/CopyButton";
import { toApiError } from "@/lib/apiErrors";
import { useSupportContact } from "@/lib/config";
import { useSession } from "@/lib/session";
import { readJson } from "@/lib/storage";
import { useFormat } from "@/lib/useFormat";
import { useOnline } from "@/lib/useOnline";
import { useWallet } from "@/lib/wallet";
import { gutterStyles } from "@/theme/layout";
import { COINS_RETURN_KEY } from "./keys";

// CO-04 Payment result `/shop/coins/result?payment=<id>` (shop.md §3.5 step 4). Polls every 3 s for
// up to 60 s while pending or verifying, then offers "Check status". Never says "failed" before the
// server does, never offers "buy more". Close goes to where the purchase started, never the gateway.

type Step = "returned" | "verifying" | "added";

export function PaymentResultScreen({ paymentId }: { paymentId: string | null }) {
  const t = useTranslations("shop.coins.result");
  const tc = useTranslations();
  const f = useFormat();
  const router = useRouter();
  const online = useOnline();
  const wallet = useWallet();
  const { handleAuthError } = useSession();
  const support = useSupportContact(tc("support.contact.neutral"));
  const [payment, setPayment] = useState<PaymentInfo | null>(null);
  const [notFound, setNotFound] = useState(paymentId === null);
  const [stopped, setStopped] = useState(false);
  const [readFailed, setReadFailed] = useState(false);
  const started = useRef(Date.now());
  const headingRef = useRef<HTMLHeadingElement>(null);

  const read = useCallback(async () => {
    if (!paymentId) return;
    try {
      const p = await api.shop.payment(paymentId);
      setPayment(p);
      setReadFailed(false);
      if (p.status === "verified") void wallet.refresh();
    } catch (e) {
      if (handleAuthError(e)) return;
      const err = toApiError(e);
      if (err.code === "NOT_FOUND") setNotFound(true);
      else setReadFailed(true);
    }
  }, [paymentId, wallet, handleAuthError]);

  useEffect(() => {
    void read();
  }, [read]);

  const settled = payment ? paymentSettled(payment.status) : false;
  useEffect(() => {
    if (settled || notFound || stopped || !online) return;
    const id = window.setInterval(() => {
      if (Date.now() - started.current > PAYMENT_POLL.forMs) {
        setStopped(true);
        return;
      }
      void read();
    }, PAYMENT_POLL.everyMs);
    return () => window.clearInterval(id);
  }, [settled, notFound, stopped, online, read]);

  useEffect(() => {
    headingRef.current?.focus();
  }, [payment?.status, notFound]);

  const exit = () => router.push(readJson<string>("session", COINS_RETURN_KEY) ?? "/shop/coins");
  const checkStatus = () => {
    started.current = Date.now();
    setStopped(false);
    void read();
  };

  const status = payment?.status ?? "pending";
  const current: Step = status === "verified" ? "added" : status === "callback_received" ? "verifying" : "returned";
  const order: Step[] = ["returned", "verifying", "added"];
  const idx = order.indexOf(current);

  let title: string;
  let body: React.ReactNode = null;
  if (notFound) {
    title = t("notFound.title");
    body = <Typography>{t("notFound.body")}</Typography>;
  } else if (status === "verified" && payment) {
    title = t("verified.title", { coins: f.number(payment.coins) });
  } else if (status === "failed") {
    title = t("failed.title");
    body = <Typography>{t("failed.body", { id: payment?.id ?? "" })}</Typography>;
  } else if (status === "expired") {
    title = t("expired.title");
    body = <Typography>{t("expired.body")}</Typography>;
  } else if (status === "callback_received") {
    title = t("verifying.title");
    body = <Typography>{t("verifying.body")}</Typography>;
  } else {
    title = t("pending.title");
    body = <Typography>{t("pending.body")}</Typography>;
  }

  const showSteps = !notFound && status !== "failed" && status !== "expired";

  return (
    <SignedInShell hideNav topBar={{ title: t("title"), leading: "close", onNavigate: exit }}>
      <Stack spacing={2.5} sx={{ ...gutterStyles, py: 3, maxWidth: 560, width: "100%", mx: "auto" }}>
        <Typography ref={headingRef} tabIndex={-1} variant="h3" component="h2" sx={{ "&:focus": { outline: "none" } }} aria-live="polite">
          {title}
        </Typography>
        {showSteps && (
          <Stack component="ol" spacing={1} aria-label={t("steps.label")} sx={{ listStyle: "none", p: 0, m: 0 }}>
            {order.map((step, i) => {
              const done = i < idx || (i === idx && status === "verified");
              const now = i === idx && status !== "verified";
              const Icon = done ? CheckIcon : now ? PendingIcon : DotIcon;
              return (
                <Typography component="li" key={step} variant="body1" sx={{ display: "flex", alignItems: "center", gap: 1, color: done || now ? "text.primary" : "text.secondary", fontWeight: now ? 600 : undefined }}>
                  <Icon sx={{ fontSize: iconSize.md }} aria-hidden />
                  {t(`steps.${step}`)}
                  <span style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>
                    {` (${t(done ? "steps.done" : now ? "steps.current" : "steps.todo")})`}
                  </span>
                </Typography>
              );
            })}
          </Stack>
        )}
        {body}
        {status === "verified" && payment && (
          <Stack spacing={1}>
            <Typography variant="h4" component="p">
              <bdi>+{f.number(payment.coins)}</bdi>
            </Typography>
            {payment.reference && (
              <Stack direction="row" sx={{ alignItems: "center", gap: 1, flexWrap: "wrap" }}>
                <Typography variant="body2">{t("reference", { ref: "" })}</Typography>
                <bdi dir="ltr">{payment.reference}</bdi>
                <CopyButton value={payment.reference} label={tc("common.copy")} />
              </Stack>
            )}
            {payment.card_mask && (
              <Typography variant="body2">
                {t("card", { mask: "" })}
                <bdi dir="ltr">{payment.card_mask}</bdi>
              </Typography>
            )}
            {payment.verified_at && (
              <Typography variant="body2" color="text.secondary">
                {f.dateTime(payment.verified_at)}
              </Typography>
            )}
          </Stack>
        )}
        {!online && !settled && <InfoLine>{t("offline")}</InfoLine>}
        {(notFound || status === "failed") && <InfoLine>{t("support", { channel: support })}</InfoLine>}
        <Stack direction="row" sx={{ flexWrap: "wrap", gap: 1 }}>
          {status === "verified" ? (
            <Button variant="contained" onClick={exit}>
              {tc("common.done")}
            </Button>
          ) : (
            <>
              {!notFound && !settled && (stopped || readFailed || status === "pending") && (
                <Button variant="contained" onClick={checkStatus} disabled={!online}>
                  {tc("common.checkStatus")}
                </Button>
              )}
              {(notFound || settled || status === "pending") && (
                <Button variant={settled || notFound ? "contained" : "text"} onClick={() => router.push("/shop/coins")}>
                  {t("backToShop")}
                </Button>
              )}
            </>
          )}
        </Stack>
      </Stack>
    </SignedInShell>
  );
}
