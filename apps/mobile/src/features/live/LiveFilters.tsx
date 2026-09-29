"use client";

import Button from "@mui/material/Button";
import Skeleton from "@mui/material/Skeleton";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { DEFAULT_LIVE_FILTER, LIVE_VARIANTS, type LiveFilter, type LiveSort } from "@bg/api-client";
import type { TournamentInfo } from "@bg/protocol";
import { ChoiceGroup } from "@/components/forms/ChoiceGroup";
import { BottomSheet } from "@/components/sheet/BottomSheet";
import { useFormat } from "@/lib/useFormat";
import { useGameLabels } from "../play/labels";
import { useTournamentName } from "../tournaments/labels";

// LV-02 Filters and sort (live.md §4): a sheet on phones, a persistent side panel at lg. Filter
// values are table filters, not spends, so "Any" is the default (P§2.2 does not apply). Nothing
// reloads until "Show matches".

const ANY = "any";

export interface FiltersFormProps {
  value: LiveFilter;
  tiers: readonly number[];
  /** Running tournaments; null while loading. Hidden when none is running. */
  tournaments: readonly TournamentInfo[] | null;
  /** The pool sort is hidden while predictions are off. */
  poolSort: boolean;
  onApply: (filter: LiveFilter) => void;
  /** Apply is disabled offline (live.md §5). */
  disabledReason?: string | null;
}

export function FiltersForm({ value, tiers, tournaments, poolSort, onApply, disabledReason }: FiltersFormProps) {
  const t = useTranslations("live.filters");
  const f = useFormat();
  const labels = useGameLabels();
  const nameOf = useTournamentName();
  const [draft, setDraft] = useState<LiveFilter>(value);
  useEffect(() => setDraft(value), [value]);

  const sorts: LiveSort[] = poolSort ? ["spectators", "pool", "elo"] : ["spectators", "elo"];
  return (
    <Stack spacing={2.5}>
      <ChoiceGroup
        legend={t("tier")}
        layout="chips"
        value={draft.tier === null ? ANY : String(draft.tier)}
        onChange={(v) => setDraft((d) => ({ ...d, tier: v === ANY ? null : Number(v) }))}
        options={[{ value: ANY, label: t("any") }, ...tiers.map((entry) => ({ value: String(entry), label: t("tierValue", { entry: f.number(entry) }) }))]}
      />
      <ChoiceGroup
        legend={t("variant")}
        layout="chips"
        value={draft.variant ?? ANY}
        onChange={(v) => setDraft((d) => ({ ...d, variant: v === ANY ? null : v }))}
        options={[{ value: ANY, label: t("any") }, ...LIVE_VARIANTS.map((v) => ({ value: v as string, label: labels.variant(v) }))]}
      />
      {tournaments === null ? (
        <Skeleton variant="text" width="60%" aria-hidden />
      ) : (
        tournaments.length > 0 && (
          <ChoiceGroup
            legend={t("tournament")}
            layout="chips"
            value={draft.tournament === null ? ANY : String(draft.tournament)}
            onChange={(v) => setDraft((d) => ({ ...d, tournament: v === ANY ? null : Number(v) }))}
            options={[{ value: ANY, label: t("any") }, ...tournaments.map((tour) => ({ value: String(tour.id), label: nameOf(tour).text }))]}
          />
        )
      )}
      <div>
        <ChoiceGroup
          legend={t("sortTitle")}
          layout="cards"
          value={draft.sort}
          onChange={(v) => setDraft((d) => ({ ...d, sort: v }))}
          options={sorts.map((s) => ({ value: s, label: t(`sort.${s}`) }))}
        />
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          {t("tournamentFirst")}
        </Typography>
      </div>
      <Stack spacing={1}>
        <Button variant="contained" size="large" onClick={() => onApply(draft)} disabled={Boolean(disabledReason)}>
          {t("apply")}
        </Button>
        {disabledReason && (
          <Typography variant="body2" color="text.secondary" sx={{ textAlign: "center" }}>
            {disabledReason}
          </Typography>
        )}
        <Button variant="text" onClick={() => onApply(DEFAULT_LIVE_FILTER)} disabled={Boolean(disabledReason)}>
          {t("clear")}
        </Button>
      </Stack>
    </Stack>
  );
}

export function FiltersSheet({ open, onClose, ...form }: FiltersFormProps & { open: boolean; onClose: () => void }) {
  const t = useTranslations("live.filters");
  return (
    <BottomSheet open={open} onClose={onClose} title={t("title")}>
      <FiltersForm {...form} />
    </BottomSheet>
  );
}
