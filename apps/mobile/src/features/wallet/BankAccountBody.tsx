"use client";

import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useTranslations } from "next-intl";
import { groupIban, maskedIbanGroups } from "@bg/api-client";
import { isolate } from "@bg/i18n";
import { Banner } from "@/components/feedback/Banner";
import { ConfirmDialog } from "@/components/feedback/ConfirmDialog";
import { StandaloneLink } from "@/components/forms/StandaloneLink";
import { EditIcon, LockIcon } from "@/components/icons";
import { ErrorState } from "@/components/states/ErrorState";
import { BankAccountCard, BankAccountCardSkeleton } from "@/components/wallet/BankAccount";
import { IbanField } from "@/components/wallet/IbanField";
import { InfoLine } from "@/components/wallet/InfoLine";
import { useOnline } from "@/lib/useOnline";
import type { BankAccountEditor } from "./BankAccountEditor";

// The bank account UI (WD-02, WD-08) apart from its state hook, so the withdraw flow can load it
// alongside the account request instead of in the route's first-load JS (§11.4 budget).

export interface BankAccountBodyProps {
  editor: BankAccountEditor;
  /** "page" (WD-08) shows Remove and its own Save button; "flow" (WD-02) leaves the primary to the footer. */
  variant: "page" | "flow";
}

/** Card, locked note, add/change form, and the replace/remove dialogs. */
export function BankAccountBody({ editor: e, variant }: BankAccountBodyProps) {
  const t = useTranslations();
  const online = useOnline();
  const offlineReason = online ? null : t("net.offlineAction");

  if (e.load.kind === "loading") return <BankAccountCardSkeleton />;
  if (e.load.kind === "error") {
    return (
      <ErrorState
        kind={e.load.offline ? "offline" : "error"}
        message={e.load.offline ? t("net.offline") : t("errors.generic")}
        code={e.load.code}
        onRetry={e.reload}
      />
    );
  }

  const lockedNote = e.account && e.locked && (
    <Stack spacing={0.5}>
      <InfoLine icon={LockIcon} id="bank-locked">
        {t("bank.locked.body")}
      </InfoLine>
      {e.pending && <StandaloneLink href={`/wallet/withdrawals/${e.pending.id}`}>{t("bank.locked.view")}</StandaloneLink>}
    </Stack>
  );

  const showForm = e.editing;

  return (
    <Stack spacing={2.5}>
      {e.account && !showForm && (
        <BankAccountCard
          account={e.account}
          title={t("bank.card.title")}
          actions={
            <>
              <Button
                variant="outlined"
                startIcon={<EditIcon />}
                onClick={() => {
                  if (!e.locked) e.startEdit();
                }}
                aria-disabled={e.locked || undefined}
                aria-describedby={e.locked ? "bank-locked" : undefined}
                sx={e.locked ? { color: "text.disabled", borderColor: "tokens.outlineSubtle", cursor: "not-allowed" } : undefined}
              >
                {t("bank.actions.change")}
              </Button>
              {variant === "page" && (
                <Button
                  variant="text"
                  onClick={() => {
                    if (!e.locked && online) e.removeDialog.show();
                  }}
                  aria-disabled={e.locked || !online || undefined}
                  aria-describedby={e.locked ? "bank-locked" : undefined}
                  sx={e.locked || !online ? { color: "text.disabled", cursor: "not-allowed" } : undefined}
                >
                  {t("bank.actions.remove")}
                </Button>
              )}
            </>
          }
        />
      )}
      {lockedNote}
      {!e.account && variant === "page" && (
        <Typography color="text.secondary">{t("bank.empty")}</Typography>
      )}

      {showForm && (
        <Stack
          spacing={2}
          component="form"
          noValidate
          onSubmit={(ev) => {
            ev.preventDefault();
            void e.save();
          }}
          aria-label={e.account ? t("bank.formTitle") : t("bank.add")}
        >
          {e.account && (
            <Typography variant="h5" component="h2">
              {t("bank.formTitle")}
            </Typography>
          )}
          <IbanField
            digits={e.digits}
            onChange={e.setDigits}
            onBlur={e.showProblem}
            problem={e.problem}
            bank={e.typedBank}
            disabled={e.saving}
            autoFocus={Boolean(e.account)}
          />
          {e.actionError && (
            <Banner severity="error" action={e.actionError.retry ? { label: t("common.retry"), onClick: () => void e.save() } : undefined}>
              {e.actionError.message}
              {e.actionError.code && (
                <Typography variant="caption" component="p">
                  <bdi>{t("common.errorCode", { code: e.actionError.code })}</bdi>
                </Typography>
              )}
            </Banner>
          )}
          {variant === "page" && (
            <Stack direction="row" sx={{ flexWrap: "wrap", gap: 1 }}>
              <Button
                type="submit"
                variant="contained"
                size="large"
                loading={e.saving}
                aria-disabled={Boolean(offlineReason) || undefined}
                onClick={(ev) => {
                  if (offlineReason) ev.preventDefault();
                }}
                sx={{ flex: "1 1 12rem" }}
              >
                {e.saving ? t("bank.saving") : t("bank.save")}
              </Button>
              {e.account && (
                <Button variant="text" size="large" onClick={e.cancelEdit} disabled={e.saving}>
                  {t("bank.cancelEdit")}
                </Button>
              )}
            </Stack>
          )}
          {variant === "flow" && e.account && (
            <Button variant="text" onClick={e.cancelEdit} disabled={e.saving} sx={{ alignSelf: "flex-start" }}>
              {t("bank.cancelEdit")}
            </Button>
          )}
          {offlineReason && variant === "page" && <InfoLine>{offlineReason}</InfoLine>}
        </Stack>
      )}

      <ConfirmDialog
        open={e.confirmReplace.open}
        onCancel={e.confirmReplace.onCancel}
        onConfirm={e.confirmReplace.onConfirm}
        title={t("bank.change.title")}
        confirmLabel={t("bank.change.confirm")}
      >
        {t("bank.change.body", {
          old: isolate(e.account ? maskedIbanGroups(e.account.iban).join(" ") : ""),
        })}
        {e.digits && (
          <Typography component="p" sx={{ mt: 1.5, color: "text.primary" }}>
            <bdi dir="ltr">
              {t("bank.field.prefix")}
              {groupIban(e.digits).join(" ")}
            </bdi>
          </Typography>
        )}
      </ConfirmDialog>
      <ConfirmDialog
        open={e.removeDialog.open}
        onCancel={e.removeDialog.onCancel}
        onConfirm={e.removeDialog.onConfirm}
        title={t("bank.remove.title")}
        confirmLabel={t("bank.remove.confirm")}
        inFlight={e.removeDialog.inFlight}
        disabledReason={offlineReason}
      >
        {t("bank.remove.body")}
      </ConfirmDialog>
    </Stack>
  );
}
