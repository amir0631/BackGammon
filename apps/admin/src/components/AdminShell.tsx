"use client";

import Alert from "@mui/material/Alert";
import AppBar from "@mui/material/AppBar";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Drawer from "@mui/material/Drawer";
import IconButton from "@mui/material/IconButton";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Toolbar from "@mui/material/Toolbar";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { InfoIcon, MenuIcon, SettingsIcon, WarningIcon } from "@/components/icons";
import { LanguageSwitch } from "@/components/LanguageSwitch";
import { useAdmin } from "@/lib/admin-context";

const NAV = [{ href: "/settings", key: "admin.shell.nav.settings", icon: <SettingsIcon /> }];

export function useOnline(): boolean {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  return online;
}

export function AdminShell({ children, mainId }: { children: ReactNode; mainId: string }) {
  const t = useTranslations();
  const pathname = usePathname();
  const { admin, signOut } = useAdmin();
  const online = useOnline();
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const navList = (compact: boolean) => (
    <List component="nav" aria-label={t("admin.shell.nav.label")} sx={{ px: 1 }}>
      {NAV.map((item) => {
        const label = t(item.key);
        const button = (
          <ListItemButton
            key={item.href}
            href={item.href}
            selected={pathname.startsWith(item.href)}
            aria-current={pathname.startsWith(item.href) ? "page" : undefined}
            sx={{ borderRadius: 1, minHeight: 44, justifyContent: compact ? "center" : "flex-start" }}
          >
            <ListItemIcon sx={{ minWidth: compact ? 0 : 40 }}>{item.icon}</ListItemIcon>
            {compact ? <Box component="span" sx={visuallyHidden}>{label}</Box> : <ListItemText primary={label} />}
          </ListItemButton>
        );
        return compact ? (
          <Tooltip key={item.href} title={label} placement="left">
            {button}
          </Tooltip>
        ) : (
          button
        );
      })}
    </List>
  );

  const env = admin?.environment ?? "development";

  return (
    <Box sx={{ minHeight: "100dvh", bgcolor: "background.default" }}>
      <Box component="a" href={`#${mainId}`} sx={skipLink}>
        {t("admin.settings.skip")}
      </Box>
      <AppBar position="sticky" color="inherit" elevation={0} sx={{ borderBottom: 1, borderColor: "divider" }}>
        <Toolbar sx={{ gap: 1.5, flexWrap: "wrap" }}>
          <IconButton
            sx={{ display: { md: "none" } }}
            onClick={() => setDrawerOpen(true)}
            aria-label={t("admin.shell.nav.label")}
          >
            <MenuIcon />
          </IconButton>
          <Typography variant="h6" component="p" sx={{ flexGrow: 1, fontWeight: 600 }}>
            {t("app.name")} · {t("admin.title")}
          </Typography>
          <Chip
            size="small"
            variant={env === "production" ? "filled" : "outlined"}
            color={env === "production" ? "error" : "default"}
            icon={env === "production" ? <WarningIcon /> : <InfoIcon />}
            label={t(`admin.shell.env.${env}`)}
          />
          <LanguageSwitch />
          {admin && (
            <>
              <Button
                variant="text"
                color="inherit"
                onClick={(e) => setMenuAnchor(e.currentTarget)}
                aria-haspopup="menu"
                aria-label={t("admin.shell.menu", { name: admin.username })}
              >
                <bdi dir="ltr">{admin.username}</bdi>
              </Button>
              <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={() => setMenuAnchor(null)}>
                <MenuItem disabled sx={{ opacity: "1 !important" }}>
                  <Chip size="small" label={t(`admin.role.${admin.role}`)} />
                </MenuItem>
                <MenuItem
                  onClick={() => {
                    setMenuAnchor(null);
                    void signOut();
                  }}
                >
                  {t("admin.shell.signOut")}
                </MenuItem>
              </Menu>
            </>
          )}
        </Toolbar>
      </AppBar>

      <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} anchor="left" sx={{ display: { md: "none" } }}>
        <Box sx={{ width: 260, pt: 2 }}>{navList(false)}</Box>
      </Drawer>

      <Box sx={{ display: "flex" }}>
        <Box
          sx={{
            display: { xs: "none", md: "block" },
            width: { md: 72, lg: 240 },
            flexShrink: 0,
            borderInlineEnd: 1,
            borderColor: "divider",
            pt: 2,
          }}
        >
          <Box sx={{ display: { md: "block", lg: "none" } }}>{navList(true)}</Box>
          <Box sx={{ display: { md: "none", lg: "block" } }}>{navList(false)}</Box>
        </Box>
        <Box component="main" id={mainId} tabIndex={-1} sx={{ flexGrow: 1, minWidth: 0, outline: "none" }}>
          {!online && (
            <Alert severity="warning" square role="status">
              {t("admin.offline")}
            </Alert>
          )}
          {children}
        </Box>
      </Box>
    </Box>
  );
}

export const visuallyHidden = {
  position: "absolute",
  width: "1px",
  height: "1px",
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
} as const;

const skipLink = {
  ...visuallyHidden,
  "&:focus": {
    position: "fixed",
    insetBlockStart: 8,
    insetInlineStart: 8,
    width: "auto",
    height: "auto",
    clip: "auto",
    zIndex: 2000,
    bgcolor: "background.paper",
    p: 1.5,
    borderRadius: 1,
    boxShadow: 3,
  },
} as const;
