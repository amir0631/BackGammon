"use client";

import Stack from "@mui/material/Stack";
import { styled } from "@mui/material/styles";
import Typography from "@mui/material/Typography";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { layout } from "@bg/design-tokens";
import { SignedInShell } from "@/components/shell/SignedInShell";
import { gutterStyles } from "@/theme/layout";
import { BankAccountBody } from "./BankAccountBody";
import { useBankAccountEditor } from "./BankAccountEditor";
import { canGoBackInApp } from "@/lib/inAppNav";

// WD-08 Bank account `/wallet/bank-accounts` (wallet.md §3.5, §4 WD-08, WD-11). One Sheba per
// user: the card with Change / Remove, or the empty state with the add form. Suspended accounts
// may add, change, and remove (§12.1).

const Column = styled("div")(({ theme }) => ({
  ...gutterStyles,
  paddingBlock: theme.spacing(3),
  width: "100%",
  maxWidth: layout.taskFlowMaxWidth + 2 * layout.gutter.lg,
  marginInline: "auto",
  containerType: "inline-size",
}));

export function BankAccountScreen() {
  const t = useTranslations();
  const router = useRouter();
  const editor = useBankAccountEditor();
  return (
    <SignedInShell
      topBar={{ title: t("bank.title"), leading: "back", onNavigate: () => (canGoBackInApp() ? router.back() : router.push("/wallet")) }}
    >
      <Column>
        <Stack spacing={3}>
          <Typography color="text.secondary">{t("bank.intro")}</Typography>
          <BankAccountBody editor={editor} variant="page" />
        </Stack>
      </Column>
    </SignedInShell>
  );
}
