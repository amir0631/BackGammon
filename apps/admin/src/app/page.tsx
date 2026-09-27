import Container from "@mui/material/Container";
import Typography from "@mui/material/Typography";
import { getTranslations } from "next-intl/server";

// Scaffold placeholder (§17 step 1). The admin sections of CLAUDE.md §13 are built in step 15;
// wallet top-up (§7.9) lands with the wallet in step 3.
export default async function AdminHome() {
  const t = await getTranslations();
  return (
    <Container component="main" sx={{ py: 4 }}>
      <Typography variant="h4" component="h1">
        {t("admin.title")}
      </Typography>
      <Typography color="text.secondary">{t("app.name")}</Typography>
    </Container>
  );
}
