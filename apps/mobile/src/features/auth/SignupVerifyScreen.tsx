"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback } from "react";
import { CodeStep } from "@/components/auth/CodeStep";
import { signupFlow } from "@/lib/flows";
import { useGuestOnly } from "@/lib/session";

// AU-03 Signup: SMS code `/signup/verify` (auth.md §3.1 step 4). Only reached while SMS is on.
export function SignupVerifyScreen() {
  const t = useTranslations();
  const router = useRouter();
  useGuestOnly(null);
  const onVerified = useCallback(() => router.push("/signup/account"), [router]);

  return (
    <CodeStep
      purpose="register"
      store={signupFlow}
      startHref="/signup"
      title={t("auth.verify.title")}
      step={{ current: 2, total: 3 }}
      sentTo={(phone) => t("auth.verify.sentTo", { phone })}
      onVerified={onVerified}
    />
  );
}
