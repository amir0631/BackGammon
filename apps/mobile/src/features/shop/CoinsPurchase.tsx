"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Link from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import NextLink from "next/link";
import { useTranslations } from "next-intl";
import { useId, useRef, useState, type ReactNode } from "react";
import { api, coinsForToman, customAmountProblem, newIdempotencyKey, parseToman } from "@bg/api-client";
import { iconSize } from "@bg/design-tokens";
import type { CoinPackages } from "@bg/protocol";
import { ChoiceGroup } from "@/components/forms/ChoiceGroup";
import { FieldError } from "@/components/forms/FieldText";
import { TextInput } from "@/components/forms/TextInput";
import { ErrorIcon, InfoIcon } from "@/components/icons";
import { BalanceUnknownNote, UnknownValue } from "@/components/money/BalanceUnknown";
import { ValueRows } from "@/components/money/ValueRows";
import { BottomSheet } from "@/components/sheet/BottomSheet";
import { InfoLine } from "@/components/wallet/InfoLine";
import { toApiError } from "@/lib/apiErrors";
import { useRequireUser, useSession } from "@/lib/session";
import { writeJson } from "@/lib/storage";
import { useFormat } from "@/lib/useFormat";
import { useOnline } from "@/lib/useOnline";
import { useWallet } from "@/lib/wallet";
import { COINS_RETURN_KEY } from "./keys";

// CO-01 online purchase and CO-03 confirmation (shop.md §3.5 steps 2–3): packages as radio cards
// and a custom toman amount, nothing selected; the confirmation shows price, coins, balance, and
// balance after before leaving for the bank. Loaded only while online purchase is on.

const CUSTOM = "custom";

export interface CoinsPurchaseProps {
  packages: CoinPackages;
  /** PAYMENTS_DISABLED during checkout: the page switches to the support content with this notice. */
  onDisabled: (notice: string) => void;
  /** A package vanished: reload the list and show this notice. */
  onPackageGone: (notice: string) => void;
}

export function CoinsPurchase({ packages, onDisabled, onPackageGone }: CoinsPurchaseProps) {
  const t = useTranslations();
  const f = useFormat();
  const online = useOnline();
  const wallet = useWallet();
  const { me } = useRequireUser();
  const { handleAuthError } = useSession();
  const [pick, setPick] = useState<string | null>(null);
  const [custom, setCustom] = useState("");
  const [touched, setTouched] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [inFlight, setInFlight] = useState(false);
  const [actionError, setActionError] = useState<ReactNode | null>(null);
  const keyRef = useRef<string | null>(null);
  const reasonId = useId();
  const balanceNoteId = useId();
  const suspended = me?.status === "suspended";
  const balance = wallet.summary?.balance ?? null;

  const rules = { min: packages.custom_min_toman, max: packages.custom_max_toman, price: packages.price_toman };
  const problem = pick === CUSTOM ? customAmountProblem(custom, rules) : null;
  const selectedPackage = pick && pick !== CUSTOM ? packages.results.find((p) => `p${p.id}` === pick) ?? null : null;
  const customToman = pick === CUSTOM && problem === null ? parseToman(custom) : null;
  const toman = selectedPackage ? selectedPackage.price_toman : customToman;
  const coins = selectedPackage ? selectedPackage.coins : customToman !== null ? coinsForToman(customToman, packages.price_toman) : null;

  const fieldError =
    pick === CUSTOM && touched && problem && problem.kind !== "empty"
      ? problem.kind === "invalid"
        ? t("shop.coins.error.invalid")
        : problem.kind === "range"
          ? t("shop.coins.error.range", { min: f.number(problem.min), max: f.number(problem.max) })
          : t("shop.coins.error.multiple", { price: f.number(problem.price) })
      : null;

  const reason = suspended
    ? t("account.suspended.actionBlocked")
    : !online
      ? t("net.offlineAction")
      : pick === null
        ? t("shop.coins.reason.choose")
        : toman === null
          ? t("shop.coins.reason.amount")
          : null;

  const openConfirm = () => {
    if (reason) return;
    keyRef.current = newIdempotencyKey();
    setActionError(null);
    setConfirm(true);
  };

  const pay = async () => {
    if (inFlight || toman === null || balance === null) return;
    keyRef.current ??= newIdempotencyKey();
    setInFlight(true);
    setActionError(null);
    try {
      writeJson("session", COINS_RETURN_KEY, "/shop/coins");
      const res = await api.shop.checkout(selectedPackage ? { package_id: selectedPackage.id } : { custom_toman: toman }, "m", keyRef.current);
      if (res.redirect_url) {
        window.location.assign(res.redirect_url);
        return; // stays in flight until the page unloads
      }
      window.location.assign(`/shop/coins/result?payment=${encodeURIComponent(res.id)}`);
    } catch (e) {
      setInFlight(false);
      if (handleAuthError(e)) return;
      const err = toApiError(e);
      if (err.code === "PAYMENTS_DISABLED") {
        setConfirm(false);
        onDisabled(t("shop.coins.error.disabled"));
      } else if (err.code === "PAYMENT_GATEWAY_UNAVAILABLE") {
        setActionError(t("shop.coins.error.gateway"));
      } else if (err.code === "PAYMENT_AMOUNT_INVALID") {
        setConfirm(false);
        setTouched(true);
        if (err.details.reason === "package") {
          setPick(null);
          onPackageGone(t("shop.coins.error.package"));
        }
      } else if (err.code === "NETWORK") {
        setActionError(t("errors.network"));
      } else {
        setActionError(`${t("errors.generic")} (${t("common.errorCode", { code: err.code })})`);
      }
    }
  };

  const options = [
    ...packages.results.map((p) => ({
      value: `p${p.id}`,
      label: (
        <Box component="span" sx={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", columnGap: 1 }}>
          <Typography component="span" variant="h4">
            {f.coins(p.coins)}
          </Typography>
          <Typography component="span" variant="body2" color="text.secondary">
            {f.toman(p.price_toman)}
          </Typography>
        </Box>
      ),
      ariaLabel: t("shop.coins.packageLabel", { coins: f.number(p.coins), price: f.number(p.price_toman) }),
      description: p.name[f.locale] || undefined,
    })),
    { value: CUSTOM, label: t("shop.coins.custom") },
  ];

  return (
    <>
      <Stack spacing={2.5} sx={{ maxWidth: 720 }}>
        <Typography variant="body1">{t("shop.coins.rate", { price: f.number(packages.price_toman) })}</Typography>
        <Box sx={{ "& [data-layout='cards'] > label": { minHeight: 72 } }}>
          <ChoiceGroup legend={t("shop.coins.packagesLegend")} value={pick} onChange={setPick} options={options} layout="cards" />
        </Box>
        {pick === CUSTOM && (
          <Stack spacing={1}>
            <TextInput
              name="custom_toman"
              label={t("shop.coins.customLabel")}
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              onBlur={() => setTouched(true)}
              error={Boolean(fieldError)}
              helperText={fieldError ? <FieldError>{fieldError}</FieldError> : undefined}
              slotProps={{ htmlInput: { dir: "ltr", inputMode: "numeric", autoComplete: "off", style: { fontVariantNumeric: "tabular-nums" } } }}
            />
            {problem?.kind === "multiple" && touched && (
              <Stack direction="row" sx={{ flexWrap: "wrap", gap: 1 }}>
                {[problem.lower, problem.higher].map((v) =>
                  v === null ? null : (
                    <Button key={v} variant="text" onClick={() => setCustom(String(v))}>
                      {t("shop.coins.useAmount", { amount: f.number(v), coins: f.number(coinsForToman(v, rules.price)) })}
                    </Button>
                  ),
                )}
              </Stack>
            )}
            <InfoLine>{t("shop.coins.customHelper", { min: f.number(rules.min), max: f.number(rules.max), price: f.number(rules.price) })}</InfoLine>
            {coins !== null && (
              <Typography variant="body1" role="status">
                {t("shop.coins.customResult", { count: coins })}
              </Typography>
            )}
          </Stack>
        )}
        <Stack spacing={1}>
          <Button variant="contained" size="large" onClick={openConfirm} disabled={Boolean(reason)} aria-describedby={reason ? reasonId : undefined}>
            {t("shop.coins.continue")}
          </Button>
          {reason && (
            <Typography id={reasonId} variant="body2" color="text.secondary" sx={{ textAlign: "center" }}>
              {reason}{" "}
              {suspended && (
                <Link component={NextLink} href="/account/status">
                  {t("account.suspended.details")}
                </Link>
              )}
            </Typography>
          )}
        </Stack>
      </Stack>

      <BottomSheet
        open={confirm}
        onClose={() => setConfirm(false)}
        dismissible={!inFlight}
        title={t("shop.coins.confirm.title", { coins: f.number(coins ?? 0) })}
        footerMode="inline"
        footer={
          <>
            {actionError && (
              <Stack direction="row" spacing={1} role="alert" sx={{ color: "tokens.error", alignItems: "flex-start" }}>
                <ErrorIcon sx={{ fontSize: iconSize.sm, mt: 0.25, flex: "none" }} />
                <Typography variant="body2" sx={{ color: "inherit" }}>
                  {actionError}
                </Typography>
              </Stack>
            )}
            {/* Never "balance 0" for an unread wallet: skeleton rows, this note, primary disabled (SH-01). */}
            {balance === null && !inFlight && <BalanceUnknownNote id={balanceNoteId} />}
            <Button
              variant="contained"
              size="large"
              fullWidth
              loading={inFlight}
              loadingPosition="start"
              onClick={() => void pay()}
              disabled={!online || (balance === null && !inFlight)}
              aria-describedby={balance === null && !inFlight ? balanceNoteId : undefined}
            >
              {t("shop.coins.confirm.cta", { amount: f.number(toman ?? 0) })}
            </Button>
            <Button variant="text" fullWidth onClick={() => setConfirm(false)} disabled={inFlight}>
              {t("common.cancel")}
            </Button>
          </>
        }
      >
        <Stack spacing={2}>
          <ValueRows
            rows={[
              { label: t("shop.coins.confirm.price"), value: f.toman(toman ?? 0), emphasis: true },
              { label: t("shop.coins.confirm.receive"), value: coins ?? 0, coins: true, emphasis: true },
              { label: t("coins.balance"), value: balance ?? <UnknownValue />, coins: balance !== null, divider: true },
              { label: t("shop.coins.confirm.balanceAfter"), value: balance === null ? <UnknownValue /> : balance + (coins ?? 0), coins: balance !== null },
            ]}
          />
          <InfoLine icon={InfoIcon}>{t("shop.coins.confirm.leaving")}</InfoLine>
        </Stack>
      </BottomSheet>
    </>
  );
}
