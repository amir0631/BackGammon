"use client";

import Chip from "@mui/material/Chip";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { api } from "@bg/api-client";

export function ServerStatus() {
  const t = useTranslations("home");
  const [ok, setOk] = useState<boolean | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    api
      .health({ signal: controller.signal })
      .then((res) => setOk(res.status === "ok"))
      .catch(() => setOk(false));
    return () => controller.abort();
  }, []);

  const label = ok === null ? "…" : ok ? t("serverOk") : t("serverDown");
  return (
    <Chip
      sx={{ alignSelf: "center" }}
      color={ok === null ? "default" : ok ? "success" : "error"}
      label={`${t("serverStatus")}: ${label}`}
    />
  );
}
