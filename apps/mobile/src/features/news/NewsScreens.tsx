"use client";

import Button from "@mui/material/Button";
import ButtonBase from "@mui/material/ButtonBase";
import Skeleton from "@mui/material/Skeleton";
import Stack from "@mui/material/Stack";
import { styled } from "@mui/material/styles";
import Typography from "@mui/material/Typography";
import NextLink from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef } from "react";
import { bodyParagraphs, listableNews, newsText, safeNewsLink, type NewsText } from "@bg/api-client";
import { iconSize, radii } from "@bg/design-tokens";
import { ChevronForwardIcon, DotIcon } from "@/components/icons";
import { StickyActions } from "@/components/flow/StickyActions";
import { DetailColumns } from "@/components/profile/AccountLayout";
import { EmptyState } from "@/components/states/EmptyState";
import { ErrorState } from "@/components/states/ErrorState";
import { LoadingState } from "@/components/states/LoadingState";
import { useNews } from "@/lib/news";
import { useFormat } from "@/lib/useFormat";
import { useOnline } from "@/lib/useOnline";
import { tokensOf } from "@/theme/theme";

// NW-02 News `/news` and NW-03 News item `/news/[id]` (news.md §3.5, §3.6, §4). Admin text is shown
// as typed (plain text, no HTML, no auto-links); fallback-language text keeps its own lang and dir.
// Opening the list doesn't mark rows as seen; opening an item does.

function langProps(text: NewsText) {
  return { lang: text.lang, dir: text.fallback ? (text.lang === "fa" ? "rtl" : "ltr") : undefined } as const;
}

const Rows = styled("ul")(({ theme }) => {
  const t = tokensOf(theme);
  return {
    listStyle: "none",
    margin: 0,
    padding: 0,
    borderRadius: radii.lg,
    border: `1px solid ${t.outlineSubtle}`,
    backgroundColor: t.surface,
    overflow: "hidden",
    "& > li + li": { borderBlockStart: `1px solid ${t.outlineSubtle}` },
  };
});

const RowLink = styled(ButtonBase)(({ theme }) => {
  const t = tokensOf(theme);
  return {
    width: "100%",
    minHeight: 64,
    display: "flex",
    alignItems: "center",
    gap: theme.spacing(1.5),
    padding: theme.spacing(1.5, 1.5, 1.5, 2),
    textAlign: "start",
    color: t.textPrimary,
    "& .row-main": { flex: "1 1 auto", minWidth: 0, display: "grid", gap: theme.spacing(0.25) },
    "& .clamp2": { display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" },
    "& .clamp1": { display: "-webkit-box", WebkitLineClamp: 1, WebkitBoxOrient: "vertical", overflow: "hidden" },
    "@media (hover: hover)": { "&:hover": { backgroundColor: theme.vars?.palette.action.hover } },
  };
}) as typeof ButtonBase;

function LastUpdated({ at, fromCache }: { at: number | null; fromCache: boolean }) {
  const t = useTranslations();
  const f = useFormat();
  if (!fromCache || at === null) return null;
  return (
    <Typography variant="body2" color="text.secondary">
      {t("common.lastUpdated", { time: f.dateTime(new Date(at)) })}
    </Typography>
  );
}

export function NewsListScreen() {
  const t = useTranslations();
  const locale = useLocale() as "fa" | "en";
  const online = useOnline();
  const news = useNews();
  const reloaded = useRef(false);

  // The list re-reads when it opens (news.md §3.1 step 1).
  useEffect(() => {
    if (reloaded.current) return;
    reloaded.current = true;
    void news.reload();
  }, [news]);

  const items = news.items ? listableNews(news.items, locale) : null;

  let body: React.ReactNode;
  if (items === null && news.error) {
    body = <ErrorState kind={online ? "error" : "offline"} message={online ? t("news.list.loadError") : t("net.offline")} onRetry={() => void news.reload()} />;
  } else if (items === null) {
    body = <LoadingState variant="list" rows={4} />;
  } else if (items.length === 0) {
    body = <EmptyState message={t("news.list.empty")} />;
  } else {
    body = (
      <Rows>
        {items.map((a) => {
          const text = newsText(a, locale)!;
          const isNew = !news.seen.has(a.id);
          const firstLine = text.body.split("\n").find((l) => l.trim()) ?? "";
          return (
            <li key={a.id}>
              <RowLink component={NextLink} href={`/news/${a.id}`} aria-label={t("news.list.rowLabel", { title: text.title, isNew: isNew ? "true" : "false" })}>
                <span className="row-main" aria-hidden>
                  <Typography component="span" variant="label" className="clamp2" {...langProps(text)}>
                    {text.title}
                  </Typography>
                  {firstLine && (
                    <Typography component="span" variant="body2" color="text.secondary" className="clamp1" {...langProps(text)}>
                      {firstLine}
                    </Typography>
                  )}
                  {isNew && (
                    <Typography component="span" variant="labelSmall" sx={{ display: "inline-flex", alignItems: "center", gap: 0.5, color: "tokens.primary" }}>
                      <DotIcon sx={{ fontSize: iconSize.sm }} />
                      {t("news.list.new")}
                    </Typography>
                  )}
                </span>
                <ChevronForwardIcon sx={{ flex: "none", color: "text.secondary", fontSize: iconSize.sm }} />
              </RowLink>
            </li>
          );
        })}
      </Rows>
    );
  }

  return (
    <DetailColumns>
      <Stack spacing={2} className="detail-main">
        <LastUpdated at={news.at} fromCache={news.fromCache} />
        {body}
      </Stack>
    </DetailColumns>
  );
}

export function NewsItemScreen({ id }: { id: number }) {
  const t = useTranslations();
  const locale = useLocale() as "fa" | "en";
  const online = useOnline();
  const news = useNews();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const item = news.items?.find((a) => a.id === id) ?? null;
  const text = item ? newsText(item, locale) : null;

  useEffect(() => {
    if (item) news.markSeen([item.id]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.id]);

  let content: React.ReactNode;
  if (news.items === null && news.error) {
    content = <ErrorState kind={online ? "error" : "offline"} message={online ? t("news.list.loadError") : t("net.offline")} onRetry={() => void news.reload()} />;
  } else if (news.items === null) {
    content = (
      <Stack spacing={1.5} aria-busy="true">
        <Skeleton variant="text" height={40} width="70%" />
        <Skeleton variant="text" />
        <Skeleton variant="text" />
        <Skeleton variant="text" width="50%" />
      </Stack>
    );
  } else if (!item || !text) {
    content = (
      <Stack spacing={2} sx={{ alignItems: "flex-start" }}>
        <Typography>{t("news.item.unavailable")}</Typography>
        <Button variant="outlined" component={NextLink} href="/news">
          {t("news.item.allNews")}
        </Button>
      </Stack>
    );
  } else {
    const link = safeNewsLink(item.link);
    content = (
      <>
        <article {...langProps(text)}>
          <Typography ref={headingRef} variant="h3" component="h1" sx={{ mb: 2, overflowWrap: "anywhere" }}>
            {text.title}
          </Typography>
          {bodyParagraphs(text.body).map((p, i) => (
            <Typography key={i} variant="body1" sx={{ whiteSpace: "pre-line", mb: 1.5, overflowWrap: "anywhere" }}>
              {p}
            </Typography>
          ))}
        </article>
        {link && (
          <StickyActions>
            <Button variant="contained" size="large" fullWidth component={NextLink} href={link}>
              {t("news.item.open")}
            </Button>
          </StickyActions>
        )}
      </>
    );
  }

  return (
    <DetailColumns>
      <Stack spacing={2} className="detail-main">
        <LastUpdated at={news.at} fromCache={news.fromCache} />
        {content}
      </Stack>
    </DetailColumns>
  );
}
