"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import Chip from "@mui/material/Chip";
import FormControlLabel from "@mui/material/FormControlLabel";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Typography, { type TypographyProps } from "@mui/material/Typography";
import { useColorScheme } from "@mui/material/styles";
import NextLink from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState, type ComponentType, type ReactNode } from "react";
import {
  avatarSize,
  elevationLevels,
  fontStack,
  lineHeight,
  palette,
  radii,
  space,
  typeRoles,
  type ColorTokens,
  type TypeRole,
} from "@bg/design-tokens";
import { isolate, LOCALE_COOKIE, locales, type Locale } from "@bg/i18n";
import { BoardArt } from "@/components/art/BoardArt";
import { Banner } from "@/components/feedback/Banner";
import { CountdownText } from "@/components/feedback/CountdownText";
import { ActionButton } from "@/components/forms/ActionButton";
import { PromptLink } from "@/components/forms/StandaloneLink";
import { SwitchRow } from "@/components/forms/SwitchRow";
import { InfoRow, NavGroup, NavRow } from "@/components/lists/NavList";
import { Avatar } from "@/components/profile/Avatar";
import { AvatarPicker } from "@/components/profile/AvatarPicker";
import { useToast } from "@/components/feedback/Toast";
import { OtpInput } from "@/components/forms/OtpInput";
import { PasswordField } from "@/components/forms/PasswordField";
import { PhoneField } from "@/components/forms/PhoneField";
import * as Icons from "@/components/icons";
import type { IconProps } from "@/components/icons";
import { CostConfirmation } from "@/components/money/CostConfirmation";
import { AppShell } from "@/components/shell/AppShell";
import { TopBar } from "@/components/shell/TopBar";
import { BottomSheet } from "@/components/sheet/BottomSheet";
import { EmptyState } from "@/components/states/EmptyState";
import { ErrorState } from "@/components/states/ErrorState";
import { LoadingState } from "@/components/states/LoadingState";
import { useCountdown } from "@/lib/useCountdown";
import { useFormat } from "@/lib/useFormat";
import { gutterStyles } from "@/theme/layout";
import { useReducedMotionSetting } from "@/theme/motion";

// Dev-only gallery of the foundation components (docs/ui/design-system.md §Gallery).
// Sample copy comes from `devGallery.*` keys; component copy comes from the real keys.

const ONE_YEAR_S = 60 * 60 * 24 * 365;
/** Simulated request length for the cost sheet: longer than the 10 s "still working" threshold. */
const SIMULATED_REQUEST_MS = 12_000;

const roleVariant: Record<TypeRole, TypographyProps["variant"]> = {
  display: "h1",
  headline: "h2",
  titleLarge: "h3",
  title: "h4",
  titleSmall: "h5",
  bodyLarge: "bodyLarge",
  body: "body1",
  bodySmall: "body2",
  label: "label",
  labelSmall: "labelSmall",
  caption: "caption",
};

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <Box
      component="section"
      aria-labelledby={id}
      sx={{ py: 3, borderBlockEnd: 1, borderColor: "divider", containerType: "inline-size" }}
    >
      <Typography id={id} variant="h3" component="h2" sx={{ mb: 2 }}>
        {title}
      </Typography>
      {children}
    </Box>
  );
}

function Code({ children }: { children: ReactNode }) {
  return (
    <Typography component="code" variant="caption" color="text.secondary" dir="ltr" sx={{ fontFamily: "monospace" }}>
      {children}
    </Typography>
  );
}

function Controls() {
  const t = useTranslations();
  const f = useFormat();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { mode, setMode } = useColorScheme();
  const { setting, setSetting } = useReducedMotionSetting();
  const textScale = params.get("text") === "200" ? 2 : 1;

  useEffect(() => {
    document.documentElement.style.fontSize = textScale === 2 ? "200%" : "";
    return () => {
      document.documentElement.style.fontSize = "";
    };
  }, [textScale]);

  const setLocale = (next: Locale | null) => {
    if (!next) return;
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=${ONE_YEAR_S}; samesite=lax`;
    router.refresh();
  };

  const setTextScale = (next: number | null) => {
    if (!next) return;
    router.replace(next === 2 ? `${pathname}?text=200` : pathname);
  };

  return (
    <Stack spacing={2} sx={{ py: 2 }}>
      <Typography color="text.secondary">{t("devGallery.intro")}</Typography>
      <Stack direction="row" sx={{ flexWrap: "wrap", gap: 2, alignItems: "center" }}>
        <ToggleButtonGroup
          exclusive
          value={f.locale}
          onChange={(_, v: Locale | null) => setLocale(v)}
          aria-label={t("devGallery.controls.locale")}
        >
          {locales.map((l) => (
            <ToggleButton key={l} value={l} lang={l}>
              {t(`languages.${l}`)}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
        <ToggleButtonGroup
          exclusive
          value={mode ?? "dark"}
          onChange={(_, v: "dark" | "light" | "system" | null) => v && setMode(v)}
          aria-label={t("devGallery.controls.colorMode")}
        >
          <ToggleButton value="dark">{t("devGallery.controls.dark")}</ToggleButton>
          <ToggleButton value="light">{t("devGallery.controls.light")}</ToggleButton>
          <ToggleButton value="system">{t("devGallery.controls.system")}</ToggleButton>
        </ToggleButtonGroup>
        <ToggleButtonGroup
          exclusive
          value={textScale}
          onChange={(_, v: number | null) => setTextScale(v)}
          aria-label={t("devGallery.controls.textSize")}
        >
          <ToggleButton value={1}>{f.percent(1)}</ToggleButton>
          <ToggleButton value={2}>{f.percent(2)}</ToggleButton>
        </ToggleButtonGroup>
        <FormControlLabel
          control={<Checkbox checked={setting} onChange={(e) => setSetting(e.target.checked)} />}
          label={t("devGallery.controls.reducedMotion")}
        />
        <Button variant="outlined" component={NextLink} href={`/dev/gallery/viewports${textScale === 2 ? "?text=200" : ""}`}>
          {t("devGallery.controls.viewports")}
        </Button>
      </Stack>
    </Stack>
  );
}

function Colors() {
  const { colorScheme } = useColorScheme();
  const scheme = colorScheme === "light" ? "light" : "dark";
  const keys = Object.keys(palette.dark) as (keyof ColorTokens)[];
  return (
    <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 13rem), 1fr))", gap: 1.5 }}>
      {keys.map((key) => (
        <Stack key={key} direction="row" spacing={1.5} sx={{ alignItems: "center", minWidth: 0 }}>
          <Box
            sx={{
              width: "2.5rem",
              height: "2.5rem",
              flex: "none",
              borderRadius: `${radii.sm}px`,
              bgcolor: `tokens.${key}`,
              border: 1,
              borderColor: "tokens.outline",
            }}
          />
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="labelSmall" component="p" dir="ltr" sx={{ overflowWrap: "anywhere" }}>
              {key}
            </Typography>
            <Code>{palette[scheme][key]}</Code>
          </Box>
        </Stack>
      ))}
    </Box>
  );
}

function TypeSpecimens() {
  const t = useTranslations("devGallery.specimen");
  const f = useFormat();
  return (
    <Stack spacing={2}>
      {typeRoles.map((role) => (
        <Box key={role}>
          <Code>{`${role} · ${roleVariant[role]}`}</Code>
          <Typography variant={roleVariant[role]} component="p">
            {t(f.locale)}
          </Typography>
        </Box>
      ))}
      <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 16rem), 1fr))", gap: 2 }}>
        {locales.map((script) => (
          <Box
            key={script}
            lang={script}
            dir={script === "fa" ? "rtl" : "ltr"}
            sx={{ p: 2, borderRadius: `${radii.md}px`, bgcolor: "tokens.surfaceSunken" }}
          >
            <Code>{`${script} · line-height ${lineHeight[script].body}`}</Code>
            <Typography sx={{ fontFamily: fontStack(script), lineHeight: lineHeight[script].body }}>{t(script)}</Typography>
          </Box>
        ))}
      </Box>
      <Typography>{t("mixed", { username: isolate("ali_tbz"), amount: f.number(1250) })}</Typography>
    </Stack>
  );
}

function SpacingAndRadii() {
  return (
    <Stack spacing={2}>
      <Stack spacing={1}>
        {Object.entries(space).map(([name, value]) => (
          <Stack key={name} direction="row" spacing={2} sx={{ alignItems: "center" }}>
            <Box sx={{ width: "5rem" }}>
              <Code>{`${name} ${value}`}</Code>
            </Box>
            <Box sx={{ width: value, height: space.md, bgcolor: "primary.main", borderRadius: `${radii.xs}px` }} />
          </Stack>
        ))}
      </Stack>
      <Stack direction="row" sx={{ flexWrap: "wrap", gap: 2 }}>
        {Object.entries(radii).map(([name, value]) => (
          <Stack key={name} spacing={0.5} sx={{ alignItems: "center" }}>
            <Box sx={{ width: "4rem", height: "4rem", borderRadius: `${value}px`, border: 2, borderColor: "tokens.outline" }} />
            <Code>{name}</Code>
          </Stack>
        ))}
        {elevationLevels.map((level) => (
          <Stack key={`e${level}`} spacing={0.5} sx={{ alignItems: "center" }}>
            <Box
              sx={{
                width: "4rem",
                height: "4rem",
                borderRadius: `${radii.md}px`,
                bgcolor: level >= 3 ? "tokens.surfaceRaised" : "tokens.surface",
                boxShadow: `var(--bg-elevation-${level})`,
              }}
            />
            <Code>{`elevation ${level}`}</Code>
          </Stack>
        ))}
      </Stack>
    </Stack>
  );
}

const iconList: [string, ComponentType<IconProps>, boolean][] = [
  ["Play", Icons.PlayIcon, false],
  ["Live", Icons.LiveIcon, false],
  ["Tournaments", Icons.TournamentsIcon, false],
  ["Shop", Icons.ShopIcon, false],
  ["Account", Icons.AccountIcon, false],
  ["Back", Icons.BackIcon, true],
  ["ChevronForward", Icons.ChevronForwardIcon, true],
  ["Close", Icons.CloseIcon, false],
  ["Check", Icons.CheckIcon, false],
  ["Refresh", Icons.RefreshIcon, false],
  ["Eye", Icons.EyeIcon, false],
  ["EyeOff", Icons.EyeOffIcon, false],
  ["Edit", Icons.EditIcon, false],
  ["Copy", Icons.CopyIcon, false],
  ["Logout", Icons.LogoutIcon, true],
  ["Globe", Icons.GlobeIcon, false],
  ["Settings", Icons.SettingsIcon, false],
  ["Devices", Icons.DevicesIcon, false],
  ["Document", Icons.DocumentIcon, false],
  ["Lock", Icons.LockIcon, false],
  ["Info", Icons.InfoIcon, false],
  ["Help", Icons.HelpIcon, false],
  ["Error", Icons.ErrorIcon, false],
  ["Warning", Icons.WarningIcon, false],
  ["Success", Icons.SuccessIcon, false],
  ["Pending", Icons.PendingIcon, false],
  ["Offline", Icons.OfflineIcon, false],
  ["Coin", Icons.CoinIcon, false],
  ["BrandMark", Icons.BrandMarkIcon, false],
];

function IconGrid() {
  return (
    <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(7rem, 1fr))", gap: 2 }}>
      {iconList.map(([name, Icon, mirrors]) => (
        <Stack key={name} spacing={0.5} sx={{ alignItems: "center", textAlign: "center" }}>
          <Icon sx={{ fontSize: 32 }} />
          <Code>{mirrors ? `${name} ⇋` : name}</Code>
        </Stack>
      ))}
    </Box>
  );
}

function Buttons() {
  const t = useTranslations();
  const s = (k: string) => t(`devGallery.sample.${k}`);
  return (
    <Stack spacing={2}>
      <Stack direction="row" sx={{ flexWrap: "wrap", gap: 1.5, alignItems: "center" }}>
        <Button variant="contained">{s("primary")}</Button>
        <Button variant="outlined">{s("secondary")}</Button>
        <Button variant="text">{s("text")}</Button>
        <Button variant="outlined" color="error" startIcon={<Icons.WarningIcon />}>
          {s("destructive")}
        </Button>
        <Button variant="contained" loading loadingPosition="start">
          {s("costInFlight")}
        </Button>
        <IconButton aria-label={t("common.help")}>
          <Icons.HelpIcon />
        </IconButton>
      </Stack>
      <Stack direction="row" sx={{ flexWrap: "wrap", gap: 1.5, alignItems: "center" }}>
        <Button variant="contained" size="large">
          {s("primary")}
        </Button>
        <Button variant="contained" size="small">
          {s("primary")}
        </Button>
        <Button variant="contained" color="secondary">
          {s("primary")}
        </Button>
        <Stack spacing={0.5}>
          <Button variant="contained" disabled aria-describedby="gallery-disabled-reason">
            {s("primary")}
          </Button>
          <Typography id="gallery-disabled-reason" variant="caption" color="text.secondary">
            {s("disabled")}
          </Typography>
        </Stack>
      </Stack>
    </Stack>
  );
}

function Inputs() {
  const t = useTranslations();
  const s = (k: string, v?: Record<string, string>) => t(`devGallery.sample.${k}`, v);
  const f = useFormat();
  const toast = useToast();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [otpBad, setOtpBad] = useState("12");
  const minLength = 8;

  return (
    <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 20rem), 1fr))", gap: 3 }}>
      <TextField label={s("field")} helperText={s("fieldHelper")} />
      <TextField label={s("field")} defaultValue="ali" error helperText={s("fieldError")} />
      <PhoneField value={phone} onChange={setPhone} />
      <PasswordField
        autoComplete="new-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        requirements={[
          { label: s("reqLength", { count: f.number(minLength) }), met: password.length >= minLength },
          { label: s("reqDigit"), met: /[0-9۰-۹]/.test(password) },
        ]}
      />
      <OtpInput value={otp} onChange={setOtp} onComplete={(code) => toast.show({ message: f.digits(code) })} />
      <OtpInput value={otpBad} onChange={setOtpBad} error={s("otpError")} />
    </Box>
  );
}

function Chips() {
  const t = useTranslations("devGallery.sample");
  const f = useFormat();
  const [picked, setPicked] = useState<number | null>(null);
  return (
    <Stack direction="row" sx={{ flexWrap: "wrap", gap: 1, alignItems: "center" }}>
      {[50, 100, 500, 1000].map((amount) => {
        const selected = picked === amount;
        return (
          <Chip
            key={amount}
            label={t("chipQuick", { amount: f.number(amount) })}
            clickable
            onClick={() => setPicked(selected ? null : amount)}
            color={selected ? "primary" : "default"}
            variant={selected ? "filled" : "outlined"}
            // Selected state is not color alone: check icon + aria-pressed.
            icon={selected ? <Icons.CheckIcon /> : undefined}
            aria-pressed={selected}
          />
        );
      })}
      <Chip label={t("chipStatus")} icon={<Icons.PendingIcon />} variant="outlined" />
    </Stack>
  );
}

function TopBars() {
  const t = useTranslations("devGallery.sample");
  return (
    <Stack spacing={1.5} sx={{ "& header": { position: "static" } }}>
      <TopBar title={t("rootTitle")} leading="brand" balance={1250} />
      <TopBar title={t("screenTitle")} leading="back" href="/dev/gallery" balance={null} />
      <TopBar title={t("taskTitle")} leading="close" href="/dev/gallery" />
    </Stack>
  );
}

function Banners() {
  const t = useTranslations();
  const s = (k: string) => t(`devGallery.sample.${k}`);
  const toast = useToast();
  const [infoOpen, setInfoOpen] = useState(true);
  return (
    <Stack spacing={1.5}>
      <Banner severity="offline">{t("net.offline")}</Banner>
      {infoOpen && (
        <Banner severity="info" action={{ label: s("bannerAction"), onClick: () => setInfoOpen(false) }} onClose={() => setInfoOpen(false)}>
          {s("bannerInfo")}
        </Banner>
      )}
      <Banner severity="success">{s("bannerSuccess")}</Banner>
      <Banner severity="warning">{s("bannerWarning")}</Banner>
      <Banner severity="error">{s("bannerError")}</Banner>
      <Stack direction="row" sx={{ flexWrap: "wrap", gap: 1.5 }}>
        <Button variant="outlined" onClick={() => toast.show({ message: s("toast") })}>
          {s("toast")}
        </Button>
        <Button
          variant="outlined"
          onClick={() => toast.show({ message: s("toastWithAction"), action: { label: s("toastAction"), onClick: () => undefined } })}
        >
          {s("toastWithAction")}
        </Button>
      </Stack>
    </Stack>
  );
}

function SheetDemo() {
  const t = useTranslations();
  const s = (k: string) => t(`devGallery.sample.${k}`);
  const [sheetOpen, setSheetOpen] = useState(false);
  return (
    <>
      <Button variant="outlined" onClick={() => setSheetOpen(true)}>
        {s("openSheet")}
      </Button>
      <BottomSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title={s("sheetTitle")}
        footer={
          <>
            <Button variant="contained" size="large" fullWidth disabled aria-describedby="gallery-sheet-reason">
              {s("primary")}
            </Button>
            <Typography id="gallery-sheet-reason" variant="body2" color="text.secondary" sx={{ textAlign: "center" }}>
              {s("disabled")}
            </Typography>
          </>
        }
      >
        <Typography>{s("sheetBody")}</Typography>
      </BottomSheet>
    </>
  );
}

function CostDemo() {
  const t = useTranslations();
  const s = (k: string, v?: Record<string, string>) => t(`devGallery.sample.${k}`, v);
  const f = useFormat();
  const toast = useToast();
  const [costOpen, setCostOpen] = useState(false);
  const [inFlight, setInFlight] = useState(false);
  const entry = 100;
  const balance = 1250;

  useEffect(() => {
    if (!inFlight) return;
    const timer = window.setTimeout(() => {
      setInFlight(false);
      setCostOpen(false);
      toast.show({ message: s("toast") });
    }, SIMULATED_REQUEST_MS);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inFlight]);

  return (
    <>
      <Button variant="contained" onClick={() => setCostOpen(true)}>
        {s("openCost")}
      </Button>
      <CostConfirmation
        open={costOpen}
        onCancel={() => setCostOpen(false)}
        onConfirm={() => setInFlight(true)}
        inFlight={inFlight}
        onCheckStatus={() => undefined}
        title={s("costTitle", { amount: f.number(entry) })}
        summary={<Typography>{s("costSummary", { length: f.number(5) })}</Typography>}
        cost={{ cost: entry, tomanEquivalent: entry * 1000, balance, balanceAfter: balance - entry }}
        facts={s("costFacts", { pot: f.coins(entry * 2), fee: f.coins(20), payout: f.coins(180) })}
        confirmLabel={s("costCta", { amount: f.number(entry) })}
        inFlightLabel={s("costInFlight")}
        helpHref="/help/fees"
      />
    </>
  );
}

function States() {
  const t = useTranslations();
  const s = (k: string, v?: Record<string, string>) => t(`devGallery.sample.${k}`, v);
  const f = useFormat();
  return (
    <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 20rem), 1fr))", gap: 3 }}>
      <EmptyState message={s("emptyMessage")} action={{ label: s("emptyAction"), href: "/play" }} />
      <ErrorState message={t("errors.network")} code="NETWORK" onRetry={() => undefined} onBack={() => undefined} />
      <LoadingState variant="list" rows={3} />
      <LoadingState variant="cards" rows={2} />
      <LoadingState
        variant="progress"
        value={45}
        label={s("progressLabel")}
        detail={s("progressDetail", { size: t("units.megabytes", { value: f.number(3.2) }) })}
        onCancel={() => undefined}
        onRetry={() => undefined}
      />
    </Box>
  );
}

function AccountDemo() {
  const t = useTranslations();
  const f = useFormat();
  const [avatar, setAvatar] = useState<string | null>(null);
  const [sound, setSound] = useState(true);
  const [until] = useState(() => Date.now() + 125_000);
  const left = useCountdown(until);
  const keys = Array.from({ length: 12 }, (_, i) => `avatar_${String(i + 1).padStart(2, "0")}`);
  return (
    <Stack spacing={3}>
      <Box sx={{ maxWidth: 360 }}>
        <BoardArt />
      </Box>
      <Stack direction="row" sx={{ flexWrap: "wrap", gap: 1 }}>
        {keys.map((k) => (
          <Avatar key={k} avatarKey={k} size={avatarSize.sm} label={t(`avatars.${k}`)} />
        ))}
      </Stack>
      <Box sx={{ maxWidth: 480 }}>
        <Typography id="g-avatar-pick" variant="labelSmall" component="p" sx={{ mb: 1 }}>
          {t("auth.avatar.title")}
        </Typography>
        <AvatarPicker avatars={keys} value={avatar} onChange={setAvatar} labelledBy="g-avatar-pick" />
      </Box>
      <Box sx={{ maxWidth: 480 }}>
        <ActionButton disabledReason={avatar ? null : t("auth.avatar.disabled")}>{t("auth.avatar.cta")}</ActionButton>
      </Box>
      <Box sx={{ maxWidth: 480 }}>
        <Banner severity="error">
          <CountdownText seconds={left} clock={f.clock} render={(time) => t("errors.auth.otpRateLimited", { time })} />
        </Banner>
      </Box>
      <Box sx={{ maxWidth: 480, border: 1, borderColor: "divider", borderRadius: 4 }}>
        <SwitchRow label={t("settings.sound.label")} description={t("settings.sound.desc")} checked={sound} onChange={setSound} />
        <SwitchRow
          label={t("settings.vibration.label")}
          description={t("settings.vibration.desc")}
          checked={false}
          disabled
          onChange={() => undefined}
          note={t("settings.vibration.unsupported")}
        />
      </Box>
      <Box sx={{ maxWidth: 480 }}>
        <NavGroup title={t("profile.hub.group.account")}>
          <NavRow href="/dev/gallery" icon={Icons.DevicesIcon} label={t("profile.hub.sessions")} current />
          <NavRow href="/dev/gallery" icon={Icons.SettingsIcon} label={t("profile.hub.settings")} />
          <InfoRow label={t("settings.account.phone")} value={<bdi dir="ltr">{f.digits("0912•••••67")}</bdi>} />
        </NavGroup>
      </Box>
      <Typography variant="body2" color="text.secondary">
        {t.rich("auth.login.noAccount", { signup: (chunks) => <PromptLink href="/dev/gallery">{chunks}</PromptLink> })}
      </Typography>
    </Stack>
  );
}

export function Gallery() {
  const t = useTranslations("devGallery");
  return (
    <AppShell topBar={<TopBar title={t("title")} leading="brand" balance={1250} />}>
      <Box sx={{ ...gutterStyles, pb: 6 }}>
        <Controls />
        <Section id="g-colors" title={t("sections.colors")}>
          <Colors />
        </Section>
        <Section id="g-type" title={t("sections.typography")}>
          <TypeSpecimens />
        </Section>
        <Section id="g-space" title={t("sections.spacing")}>
          <SpacingAndRadii />
        </Section>
        <Section id="g-icons" title={t("sections.icons")}>
          <IconGrid />
        </Section>
        <Section id="g-buttons" title={t("sections.buttons")}>
          <Buttons />
        </Section>
        <Section id="g-inputs" title={t("sections.inputs")}>
          <Inputs />
        </Section>
        <Section id="g-chips" title={t("sections.chips")}>
          <Chips />
        </Section>
        <Section id="g-topbar" title={t("sections.topBar")}>
          <TopBars />
        </Section>
        <Section id="g-banners" title={t("sections.banners")}>
          <Banners />
        </Section>
        <Section id="g-sheets" title={t("sections.sheets")}>
          <SheetDemo />
        </Section>
        <Section id="g-cost" title={t("sections.cost")}>
          <CostDemo />
        </Section>
        <Section id="g-states" title={t("sections.states")}>
          <States />
        </Section>
        <Section id="g-account" title={t("sections.account")}>
          <AccountDemo />
        </Section>
      </Box>
    </AppShell>
  );
}
