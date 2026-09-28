"use client";

import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import NextLink from "next/link";
import { useTranslations } from "next-intl";
import { EditIcon } from "@/components/icons";
import { AccountHub } from "@/components/profile/AccountHub";
import { DetailColumns } from "@/components/profile/AccountLayout";
import { PublicProfileSkeleton, PublicProfileView } from "@/components/profile/ProfileViews";
import { useSession } from "@/lib/session";

// AC-01 Account hub `/me` (profile.md §4). Narrow: the hub itself. List-detail: the hub is in the
// frame's list column, and the detail panel previews the public profile ("how others see you").
export function AccountHubScreen() {
  const t = useTranslations();
  const { me } = useSession();

  return (
    <DetailColumns>
      <div className="detail-main">
        <div className="account-me-inline">
          <AccountHub me={me} />
        </div>
        <section className="account-me-preview" aria-labelledby="me-preview-title">
          <Typography id="me-preview-title" variant="labelSmall" component="h2" color="text.secondary" sx={{ mb: 2 }}>
            {t("profile.hub.previewTitle")}
          </Typography>
          {me?.username ? (
            <PublicProfileView
              user={{ username: me.username, avatar: me.avatar, elo: me.elo, level: me.level, created_at: me.created_at }}
              headingComponent="h2"
              note={t("publicProfile.self")}
              actions={
                <Button variant="outlined" component={NextLink} href="/me/edit" startIcon={<EditIcon />} sx={{ alignSelf: "center" }}>
                  {t("profile.hub.editProfile")}
                </Button>
              }
            />
          ) : (
            <PublicProfileSkeleton />
          )}
        </section>
      </div>
    </DetailColumns>
  );
}
