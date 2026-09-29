"use client";

import Typography from "@mui/material/Typography";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback } from "react";
import { CodeStep } from "@/components/auth/CodeStep";
import { PromptLink } from "@/components/forms/StandaloneLink";
import { resetFlow, signupFlow } from "@/lib/flows";

// AU-08 Reset: SMS code `/password/reset/verify` (auth.md §3.3 step 2). Same code component as
// AU-03 with neutral copy: the screen never reveals whether the number has an account.
export function ResetVerifyScreen() {
  const t = useTranslations();
  const router = useRouter();
  const onVerified = useCallback(() => router.push("/password/reset/new"), [router]);

  return (
    <CodeStep
      purpose="password_reset"
      store={resetFlow}
      startHref="/password/reset"
      title={t("auth.verify.title")}
      step={{ current: 2, total: 3 }}
      sentTo={(phone) => t("auth.reset.sentTo", { phone })}
      onVerified={onVerified}
      extra={
        <Typography variant="body2" color="text.secondary">
          {t.rich("auth.reset.noAccount", {
            signup: (chunks) => (
              <PromptLink href="/signup" onClick={() => signupFlow.patch({ phone: resetFlow.read()?.phone ?? "" })}>
                {chunks}
              </PromptLink>
            ),
          })}
        </Typography>
      }
    />
  );
}
