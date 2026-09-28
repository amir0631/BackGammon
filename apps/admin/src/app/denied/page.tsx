import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import { getTranslations } from "next-intl/server";

// AD-09: no form, no retry loop; one reload button.
export default async function DeniedPage({ searchParams }: { searchParams: Promise<{ reason?: string }> }) {
  const t = await getTranslations();
  const { reason } = await searchParams;
  return (
    <Box component="main" sx={{ minHeight: "100dvh", display: "grid", placeItems: "center", p: 2 }}>
      <Paper variant="outlined" sx={{ maxWidth: 480, p: 4 }}>
        <Typography variant="h5" component="h1" gutterBottom>
          {t("errors.admin.forbidden")}
        </Typography>
        <Typography sx={{ mb: 3 }}>{t(reason === "host" ? "admin.denied.host" : "admin.denied.ip")}</Typography>
        <Button variant="outlined" href="/settings">
          {t("common.retry")}
        </Button>
      </Paper>
    </Box>
  );
}
