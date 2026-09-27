import Container from "@mui/material/Container";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { getTranslations } from "next-intl/server";
import { ServerStatus } from "@/components/ServerStatus";

// Scaffold placeholder (§17 step 1). Replaced by the lobby from the UX spec.
export default async function HomePage() {
  const t = await getTranslations();
  return (
    <Container
      component="main"
      maxWidth="sm"
      sx={{
        minHeight: "100dvh",
        display: "flex",
        alignItems: "center",
        pt: "env(safe-area-inset-top)",
        pb: "env(safe-area-inset-bottom)",
      }}
    >
      <Stack spacing={2} sx={{ width: "100%", textAlign: "center" }}>
        <Typography variant="h3" component="h1">
          {t("app.name")}
        </Typography>
        <Typography color="text.secondary">{t("app.tagline")}</Typography>
        <Typography color="text.secondary">{t("home.comingSoon")}</Typography>
        <ServerStatus />
      </Stack>
    </Container>
  );
}
