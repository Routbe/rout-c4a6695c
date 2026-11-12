import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { CreditCard, IdCard } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { RoutCardDialog } from "@/components/wallet/RoutCardDialog";
import { WalletVault } from "@/components/wallet/WalletVault";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useMyHandle } from "@/hooks/useMyHandle";

const TITLE = "Mijn ROUT-kaart | ROUT";
const DESC = "Bekijk en beheer je privé ROUT-kaart en je profielkaarten.";

export const Route = createFileRoute("/_authenticated/wallet")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESC },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESC },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: WalletPage,
});

/** ROUT card first (NFC, freeze, physical keys); the profile-hub cards live in their own tab. */
function WalletPage() {
  const { t } = useTranslation();
  const handle = useMyHandle();
  return (
    <AppLayout title={t("walletPage.title")} description={t("walletPage.description")} crumbs={[{ label: t("walletPage.title") }]}>
      {handle === undefined ? (
        <p className="text-sm text-muted-foreground">{t("walletPage.loading")}</p>
      ) : handle ? (
        <Tabs defaultValue="card" className="mx-auto w-full max-w-md">
          <TabsList className="grid h-auto w-full grid-cols-2 gap-1 p-1">
            <TabsTrigger value="card" className="min-h-10 min-w-0 gap-2"><CreditCard className="h-4 w-4 shrink-0" aria-hidden /><span className="truncate">{t("walletPage.tabCard", { defaultValue: "ROUT-kaart" })}</span></TabsTrigger>
            <TabsTrigger value="profile" className="min-h-10 min-w-0 gap-2"><IdCard className="h-4 w-4 shrink-0" aria-hidden /><span className="truncate">{t("walletPage.tabProfile", { defaultValue: "Profielkaarten" })}</span></TabsTrigger>
          </TabsList>
          <TabsContent value="card" className="mt-4">
            <RoutCardDialog inline open onOpenChange={() => {}} handle={handle} vault="key" />
          </TabsContent>
          <TabsContent value="profile" className="mt-4 space-y-3">
            <p className="text-sm text-muted-foreground">
              {t("walletPage.profileLead", { defaultValue: "De kaarten van je profielhub: alleen een QR naar je profiel, zonder NFC en zonder betaalfunctie. Veilig om te tonen." })}
            </p>
            <WalletVault only={["public", "stealth"]} />
          </TabsContent>
        </Tabs>
      ) : (
        <p className="text-sm text-muted-foreground">{t("walletPage.noHandle")}</p>
      )}
    </AppLayout>
  );
}
