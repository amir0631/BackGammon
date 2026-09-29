"use client";

import Chip from "@mui/material/Chip";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import { useState } from "react";
import { api } from "@bg/api-client";
import type { AdminAnnouncement, AdminPhrase, AdminTextOverride } from "@bg/protocol";
import { CatalogEditor, type Field } from "@/components/catalog";
import { Ltr, PageHeader, Screen, useFmt, useT } from "@/components/common";
import { useAdmin } from "@/lib/admin-context";

type TabKey = "announcements" | "phrases" | "texts";

function Content() {
  const t = useT();
  const f = useFmt();
  const { admin } = useAdmin();
  const [tab, setTab] = useState<TabKey>("announcements");
  const editor = admin?.role === "superadmin" || admin?.role === "support";

  const announcementFields: Field[] = [
    { key: "kind", label: t("admin.content.kind"), type: "select", options: ["banner", "announcement"].map((k) => ({ value: k, label: t(`admin.content.kindName.${k}`) })) },
    { key: "title_i18n", label: t("admin.content.titleField"), type: "bilingual" },
    { key: "body_i18n", label: t("admin.content.body"), type: "bilingual", multiline: true },
    { key: "link", label: t("admin.content.link"), type: "ltr" },
    { key: "starts_at", label: t("admin.content.starts"), type: "datetime" },
    { key: "ends_at", label: t("admin.content.ends"), type: "datetime" },
    { key: "sort", label: t("admin.catalog.sort"), type: "number" },
    { key: "active", label: t("admin.catalog.active"), type: "bool" },
  ];
  const phraseFields: Field[] = [
    { key: "key", label: t("admin.shop.key"), type: "ltr", createOnly: true },
    { key: "text_i18n", label: t("admin.content.text"), type: "bilingual" },
    { key: "active", label: t("admin.catalog.active"), type: "bool" },
  ];
  const textFields: Field[] = [
    { key: "key", label: t("admin.content.catalogKey"), type: "ltr", createOnly: true },
    { key: "text_i18n", label: t("admin.content.text"), type: "bilingual", multiline: true },
  ];

  return (
    <>
      <PageHeader title={t("admin.content.title")} subtitle={editor ? undefined : t("admin.content.readOnly")} />
      <Tabs value={tab} onChange={(_, v: TabKey) => setTab(v)} sx={{ mb: 2 }}>
        <Tab value="announcements" label={t("admin.content.announcements")} />
        <Tab value="phrases" label={t("admin.content.phrases")} />
        <Tab value="texts" label={t("admin.content.texts")} />
      </Tabs>
      {tab === "announcements" && (
        <CatalogEditor<AdminAnnouncement>
          crud={api.admin.announcements}
          fields={announcementFields}
          canWrite={editor}
          deletes
          noun={t("admin.content.announcementNoun")}
          columns={[
            { key: "kind", label: t("admin.content.kind"), render: (r) => t(`admin.content.kindName.${r.kind}`) },
            { key: "title", label: t("admin.content.titleField"), render: (r) => r.title_i18n[f.locale] },
            { key: "when", label: t("admin.content.window"), render: (r) => `${r.starts_at ? f.dateTime(r.starts_at) : "—"} → ${r.ends_at ? f.dateTime(r.ends_at) : "—"}` },
            { key: "active", label: t("admin.catalog.active"), render: (r) => <Chip size="small" variant="outlined" label={t(r.active ? "admin.common.yes" : "admin.common.no")} /> },
          ]}
        />
      )}
      {tab === "phrases" && (
        <CatalogEditor<AdminPhrase>
          crud={api.admin.phrases}
          fields={phraseFields}
          canWrite={editor}
          deletes={false}
          noun={t("admin.content.phraseNoun")}
          columns={[
            { key: "key", label: t("admin.shop.key"), render: (r) => <Ltr>{r.key}</Ltr> },
            { key: "fa", label: t("admin.common.lang.fa"), render: (r) => r.text_i18n.fa },
            { key: "en", label: t("admin.common.lang.en"), render: (r) => <Ltr>{r.text_i18n.en}</Ltr> },
            { key: "active", label: t("admin.catalog.active"), render: (r) => <Chip size="small" variant="outlined" label={t(r.active ? "admin.common.yes" : "admin.common.no")} /> },
          ]}
        />
      )}
      {tab === "texts" && (
        <CatalogEditor<AdminTextOverride>
          crud={api.admin.texts}
          fields={textFields}
          canWrite={editor}
          deletes
          noun={t("admin.content.textNoun")}
          columns={[
            { key: "key", label: t("admin.content.catalogKey"), render: (r) => <Ltr>{r.key}</Ltr> },
            { key: "fa", label: t("admin.common.lang.fa"), render: (r) => r.text_i18n.fa },
            { key: "en", label: t("admin.common.lang.en"), render: (r) => <Ltr>{r.text_i18n.en}</Ltr> },
            { key: "updated", label: t("admin.content.updated"), render: (r) => f.dateTime(r.updated_at) },
          ]}
        />
      )}
    </>
  );
}

export default function ContentPage() {
  return (
    <Screen>
      <Content />
    </Screen>
  );
}
