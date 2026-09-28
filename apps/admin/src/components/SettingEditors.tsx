"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import FormControlLabel from "@mui/material/FormControlLabel";
import IconButton from "@mui/material/IconButton";
import InputAdornment from "@mui/material/InputAdornment";
import Radio from "@mui/material/Radio";
import RadioGroup from "@mui/material/RadioGroup";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import type { Locale } from "@bg/i18n";
import type { AdminSetting } from "@bg/protocol";
import { formatValue, normalizeDigits, num, percent, type T } from "@/lib/format";

export interface EditorProps {
  setting: AdminSetting;
  value: unknown;
  onChange: (value: unknown) => void;
  error: string | null;
  coinPrice: number;
  onEnter: () => void;
}

/** Parses a typed number (Persian or Latin digits). Invalid text stays a string so validation reports it. */
function parseNumber(raw: string, allowDecimal = false): number | string {
  const text = normalizeDigits(raw).replace(/[,٬\s]/g, "").trim();
  if (text === "") return raw;
  const pattern = allowDecimal ? /^-?\d+(\.\d+)?$/ : /^-?\d+$/;
  return pattern.test(text) ? Number(text) : raw;
}

const UNIT_KEY: Record<string, string> = {
  seconds: "admin.settings.value.seconds",
  coins: "admin.settings.value.coins",
  toman: "admin.settings.value.toman",
  rial: "admin.settings.value.rial",
  days: "admin.settings.value.days",
  xp: "admin.settings.value.xp",
};

function unitSuffix(t: T, unit: string | null): string | null {
  if (unit === "percent") return "٪";
  const key = unit ? UNIT_KEY[unit] : undefined;
  return key ? t(key, { n: "" }).trim() : null;
}

function IntEditor({ setting, value, onChange, error, coinPrice, onEnter }: EditorProps) {
  const t = useTranslations() as unknown as T;
  const locale = useLocale() as Locale;
  const [text, setText] = useState(() => String(value));
  const suffix = unitSuffix(t, setting.unit);
  const preview = typeof value === "number" ? formatValue(t, locale, setting, value, coinPrice) : null;
  return (
    <TextField
      label={t("admin.edit.new")}
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        onChange(parseNumber(e.target.value));
      }}
      onKeyDown={(e) => e.key === "Enter" && onEnter()}
      error={Boolean(error)}
      helperText={error ?? [preview?.text, preview?.secondary].filter(Boolean).join(" · ")}
      fullWidth
      autoFocus
      slotProps={{
        htmlInput: { inputMode: "numeric", dir: "ltr" },
        input: suffix ? { endAdornment: <InputAdornment position="end">{suffix}</InputAdornment> } : undefined,
      }}
    />
  );
}

function BoolEditor({ value, onChange }: EditorProps) {
  const t = useTranslations("admin.settings.value");
  return (
    <RadioGroup value={value ? "on" : "off"} onChange={(e) => onChange(e.target.value === "on")}>
      <FormControlLabel value="on" control={<Radio />} label={t("on")} />
      <FormControlLabel value="off" control={<Radio />} label={t("off")} />
    </RadioGroup>
  );
}

function ChoiceEditor({ setting, value, onChange }: EditorProps) {
  const t = useTranslations() as unknown as T;
  return (
    <RadioGroup value={String(value)} onChange={(e) => onChange(e.target.value)}>
      {(setting.choices ?? []).map((choice) => {
        const k = `admin.settings.choice.${setting.key}.${choice}`;
        return (
          <FormControlLabel
            key={choice}
            value={choice}
            control={<Radio />}
            label={
              <span>
                {t.has(k) ? t(k) : choice}{" "}
                <Typography component="code" variant="caption" dir="ltr" sx={{ fontFamily: "monospace" }}>
                  {choice}
                </Typography>
              </span>
            }
          />
        );
      })}
    </RadioGroup>
  );
}

function StrEditor({ value, onChange, error, onEnter }: EditorProps) {
  const t = useTranslations();
  return (
    <TextField
      label={t("admin.edit.new")}
      value={String(value)}
      onChange={(e) => onChange(normalizeDigits(e.target.value).trim())}
      onKeyDown={(e) => e.key === "Enter" && onEnter()}
      error={Boolean(error)}
      helperText={error ?? " "}
      fullWidth
      autoFocus
      slotProps={{ htmlInput: { dir: "ltr", spellCheck: false, style: { fontFamily: "monospace" } } }}
    />
  );
}

function IntListEditor({ setting, value, onChange, error, coinPrice }: EditorProps) {
  const t = useTranslations() as unknown as T;
  const locale = useLocale() as Locale;
  const items = Array.isArray(value) ? (value as number[]) : [];
  const [text, setText] = useState("");
  const [dup, setDup] = useState(false);
  // Tiers must stay ascending (server check), so every list is kept sorted.
  const add = () => {
    const n = parseNumber(text);
    if (typeof n !== "number") return;
    if (items.includes(n)) {
      setDup(true);
      return;
    }
    onChange([...items, n].sort((a, b) => a - b));
    setText("");
    setDup(false);
  };
  const label = (v: number) =>
    setting.unit === "points"
      ? t("admin.settings.value.points", { n: num(locale, v) })
      : formatValue(t, locale, { ...setting, kind: "int" }, v, coinPrice).text;
  return (
    <Stack spacing={1.5}>
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }} role="list">
        {items.map((v) => (
          <Chip
            key={v}
            role="listitem"
            label={label(v)}
            onDelete={() => onChange(items.filter((x) => x !== v))}
            deleteIcon={
              <IconButton size="small" aria-label={t("admin.edit.list.remove", { value: label(v) })}>
                ×
              </IconButton>
            }
          />
        ))}
      </Box>
      <Stack direction="row" spacing={1}>
        <TextField
          size="small"
          label={t("admin.edit.new")}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setDup(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          error={dup}
          helperText={dup ? t("admin.edit.list.duplicate") : undefined}
          slotProps={{ htmlInput: { inputMode: "numeric", dir: "ltr" } }}
        />
        <Button variant="outlined" onClick={add} sx={{ alignSelf: "flex-start", minHeight: 40 }}>
          {t("admin.edit.list.add")}
        </Button>
      </Stack>
      {error && (
        <Typography color="error" variant="body2">
          {error}
        </Typography>
      )}
    </Stack>
  );
}

function SplitEditor({ value, onChange, error }: EditorProps) {
  const t = useTranslations() as unknown as T;
  const locale = useLocale() as Locale;
  const items = Array.isArray(value) ? (value as (number | string)[]) : [];
  const [texts, setTexts] = useState(() => items.map(String));
  const update = (next: string[]) => {
    setTexts(next);
    onChange(next.map((s) => parseNumber(s, true)));
  };
  const total = items.reduce<number>((a, b) => a + (typeof b === "number" ? b : 0), 0);
  return (
    <Stack spacing={1.5}>
      {texts.map((text, i) => (
        <Stack direction="row" spacing={1} key={i} alignItems="center">
          <TextField
            size="small"
            label={t("admin.settings.value.place", { n: num(locale, i + 1) })}
            value={text}
            onChange={(e) => update(texts.map((x, j) => (j === i ? e.target.value : x)))}
            slotProps={{
              htmlInput: { inputMode: "decimal", dir: "ltr" },
              input: { endAdornment: <InputAdornment position="end">٪</InputAdornment> },
            }}
          />
          <Button
            size="small"
            onClick={() => update(texts.filter((_, j) => j !== i))}
            aria-label={t("admin.edit.list.remove", { value: t("admin.settings.value.place", { n: num(locale, i + 1) }) })}
          >
            ×
          </Button>
        </Stack>
      ))}
      <Button variant="outlined" size="small" onClick={() => update([...texts, "0"])} sx={{ alignSelf: "flex-start" }}>
        {t("admin.edit.split.addPlace")}
      </Button>
      <Typography color={Math.round(total * 100) === 10_000 ? "text.primary" : "error"} aria-live="polite">
        {t("admin.settings.value.total", { total: percent(locale, total) })}
      </Typography>
      {error && (
        <Typography color="error" variant="body2">
          {error}
        </Typography>
      )}
    </Stack>
  );
}

function PointsEditor({ value, onChange, error }: EditorProps) {
  const t = useTranslations("admin.settings.traditional");
  const v = (value ?? {}) as Record<string, number | string>;
  const [texts, setTexts] = useState(() => ({
    single: String(v.single ?? ""),
    gammon: String(v.gammon ?? ""),
    backgammon: String(v.backgammon ?? ""),
  }));
  return (
    <Stack spacing={1.5}>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
        {(["single", "gammon", "backgammon"] as const).map((k) => (
          <TextField
            key={k}
            size="small"
            label={t(k)}
            value={texts[k]}
            onChange={(e) => {
              const next = { ...texts, [k]: e.target.value };
              setTexts(next);
              onChange({
                single: parseNumber(next.single),
                gammon: parseNumber(next.gammon),
                backgammon: parseNumber(next.backgammon),
              });
            }}
            slotProps={{ htmlInput: { inputMode: "numeric", dir: "ltr" } }}
          />
        ))}
      </Stack>
      {error && (
        <Typography color="error" variant="body2">
          {error}
        </Typography>
      )}
    </Stack>
  );
}

function JsonEditor({ value, onChange, error }: EditorProps) {
  const t = useTranslations();
  const [text, setText] = useState(() => JSON.stringify(value, null, 2));
  const [parseError, setParseError] = useState<string | null>(null);
  return (
    <TextField
      multiline
      minRows={6}
      fullWidth
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        try {
          onChange(JSON.parse(e.target.value));
          setParseError(null);
        } catch (err) {
          const pos = Number(/position (\d+)/.exec(String(err))?.[1] ?? 0);
          const before = e.target.value.slice(0, pos).split("\n");
          setParseError(t("admin.edit.json.parseError", { line: before.length, column: (before.at(-1)?.length ?? 0) + 1 }));
          onChange(Symbol.for("invalid-json"));
        }
      }}
      error={Boolean(parseError ?? error)}
      helperText={parseError ?? error ?? " "}
      slotProps={{ htmlInput: { dir: "ltr", spellCheck: false, style: { fontFamily: "monospace" } } }}
    />
  );
}

export function SettingEditor(props: EditorProps) {
  const { setting } = props;
  if (setting.kind === "bool") return <BoolEditor {...props} />;
  if (setting.kind === "str") return setting.choices ? <ChoiceEditor {...props} /> : <StrEditor {...props} />;
  if (setting.kind === "int") return <IntEditor {...props} />;
  if (setting.kind === "int_list") return <IntListEditor {...props} />;
  if (setting.kind === "number_list") return <SplitEditor {...props} />;
  if (setting.key === "game.traditional_points") return <PointsEditor {...props} />;
  return <JsonEditor {...props} />;
}
