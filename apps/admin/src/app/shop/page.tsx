"use client";

import Chip from "@mui/material/Chip";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import { useState } from "react";
import { api } from "@bg/api-client";
import type { AdminCoinPackage, AdminItem } from "@bg/protocol";
import { CatalogEditor, type Field } from "@/components/catalog";
import { Ltr, PageHeader, Screen, useFmt, useT } from "@/components/common";
import { useAdmin } from "@/lib/admin-context";

const KINDS = ["board_theme", "checker_theme", "avatar", "emoji_pack", "phrase_pack"];
const UNLOCKS = ["free", "level_locked", "purchasable"];

function Shop() {
  const t = useT();
  const f = useFmt();
  const { admin } = useAdmin();
  const [tab, setTab] = useState<"items" | "packages">("items");
  const pricing = admin?.role === "superadmin" || admin?.role === "finance";

  const itemFields: Field[] = [
    { key: "kind", label: t("admin.shop.kind"), type: "select", createOnly: true, options: KINDS.map((k) => ({ value: k, label: t(`admin.shop.kindName.${k}`) })) },
    { key: "key", label: t("admin.shop.key"), type: "ltr", createOnly: true },
    { key: "name_i18n", label: t("admin.shop.name"), type: "bilingual" },
    { key: "unlock", label: t("admin.shop.unlock"), type: "select", options: UNLOCKS.map((u) => ({ value: u, label: t(`admin.shop.unlockName.${u}`) })) },
    { key: "price_coins", label: t("admin.shop.price"), type: "number" },
    { key: "unlock_level", label: t("admin.shop.level"), type: "number" },
    { key: "data", label: t("admin.shop.data"), type: "json" },
    { key: "sort", label: t("admin.catalog.sort"), type: "number" },
    { key: "active", label: t("admin.catalog.active"), type: "bool" },
    { key: "is_default", label: t("admin.shop.default"), type: "bool" },
  ];
  const packageFields: Field[] = [
    { key: "coins", label: t("admin.shop.coins"), type: "number" },
    { key: "name_i18n", label: t("admin.shop.name"), type: "bilingual" },
    { key: "sort", label: t("admin.catalog.sort"), type: "number" },
    { key: "active", label: t("admin.catalog.active"), type: "bool" },
  ];

  return (
    <>
      <PageHeader title={t("admin.shop.title")} subtitle={pricing ? undefined : t("admin.shop.readOnly")} />
      <Tabs value={tab} onChange={(_, v: "items" | "packages") => setTab(v)} sx={{ mb: 2 }}>
        <Tab value="items" label={t("admin.shop.items")} />
        <Tab value="packages" label={t("admin.shop.packages")} />
      </Tabs>
      {tab === "items" ? (
        <CatalogEditor<AdminItem>
          crud={api.admin.items}
          fields={itemFields}
          canWrite={pricing}
          deletes={false}
          noun={t("admin.shop.itemNoun")}
          columns={[
            { key: "kind", label: t("admin.shop.kind"), render: (r) => t(`admin.shop.kindName.${r.kind}`) },
            { key: "key", label: t("admin.shop.key"), render: (r) => <Ltr>{r.key}</Ltr> },
            { key: "name", label: t("admin.shop.name"), render: (r) => r.name_i18n[f.locale] },
            { key: "unlock", label: t("admin.shop.unlock"), render: (r) => t(`admin.shop.unlockName.${r.unlock}`) },
            { key: "price", label: t("admin.shop.price"), align: "right", render: (r) => (r.unlock === "purchasable" ? f.n(r.price_coins) : r.unlock === "level_locked" ? t("admin.shop.levelN", { n: f.n(r.unlock_level) }) : "—") },
            { key: "active", label: t("admin.catalog.active"), render: (r) => <Chip size="small" variant="outlined" label={t(r.active ? "admin.common.yes" : "admin.common.no")} /> },
          ]}
        />
      ) : (
        <CatalogEditor<AdminCoinPackage>
          crud={api.admin.packages}
          fields={packageFields}
          canWrite={pricing}
          deletes={false}
          noun={t("admin.shop.packageNoun")}
          columns={[
            { key: "coins", label: t("admin.shop.coins"), align: "right", render: (r) => f.n(r.coins) },
            { key: "name", label: t("admin.shop.name"), render: (r) => r.name_i18n[f.locale] },
            { key: "sort", label: t("admin.catalog.sort"), align: "right", render: (r) => f.n(r.sort) },
            { key: "active", label: t("admin.catalog.active"), render: (r) => <Chip size="small" variant="outlined" label={t(r.active ? "admin.common.yes" : "admin.common.no")} /> },
          ]}
        />
      )}
    </>
  );
}

export default function ShopPage() {
  return (
    <Screen>
      <Shop />
    </Screen>
  );
}
