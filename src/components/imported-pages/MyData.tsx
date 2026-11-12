import { useEffect, useState } from "react";
import { Link, useNavigate } from "@/lib/router-compat";
import { AlertTriangle, Download, Loader2, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import { useI18n } from "@/lib/i18n";
import { db } from "@/lib/db/client";

/** /my-data — one clear place to export everything or delete everything. */
export default function MyData() {
  const { t } = useI18n();
  const { user, loading, signOut } = useAuth();
  const nav = useNavigate();
  const [exporting, setExporting] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!loading && !user) nav("/auth/sign-in", { replace: true });
  }, [user, loading, nav]);

  if (loading || !user) {
    return (
      <AppLayout title={t("mydata.title")} crumbs={[{ label: t("mydata.title") }]}>
        <div className="flex min-h-[40vh] items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  const exportData = async () => {
    setExporting(true);
    try {
      const [{ data: profile }, { data: saved }, { data: tracked }, { data: badges }] =
        await Promise.all([
          db.from("profiles").select("*").eq("id", user.id).maybeSingle(),
          db.from("saved_qrs").select("*"),
          db.from("tracked_qrs").select("*").eq("user_id", user.id),
          db.from("user_badges").select("*").eq("user_id", user.id),
        ]);

      const payload = {
        exported_at: new Date().toISOString(),
        note: t("mydata.export.note"),
        account: {
          id: user.id,
          email: user.email,
          created_at: user.created_at,
          display_name: user.user_metadata?.display_name ?? null,
        },
        profile: profile ?? null,
        saved_qrs: saved ?? [],
        short_links: tracked ?? [],
        badges: badges ?? [],
      };

      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `rout-mijn-gegevens-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(t("mydata.export.done"));
    } catch {
      toast.error(t("mydata.export.failed"));
    } finally {
      setExporting(false);
    }
  };

  const deleteEverything = async () => {
    if (confirmText !== t("mydata.delete.confirmWord")) return;
    setDeleting(true);
    try {
      const { data: mine } = await db.from("tracked_qrs").select("id").eq("user_id", user.id);
      const ids = (mine ?? []).map((r) => r.id);
      if (ids.length) await db.from("qr_scans").delete().in("tracked_qr_id", ids);

      await Promise.all([
        db.from("saved_qrs").delete().neq("id", ""),
        db.from("tracked_qrs").delete().eq("user_id", user.id),
        db.from("user_badges").delete().eq("user_id", user.id),
      ]);

      const { error } = await db.rpc("delete_account" as never);
      if (error) {
        toast.error(t("mydata.delete.partial"));
      } else {
        toast.success(t("mydata.delete.done"));
      }
      await signOut();
      nav("/", { replace: true });
    } catch {
      toast.error(t("mydata.delete.failed"));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <AppLayout
      title={t("mydata.title")}
      description={t("mydata.description")}
      crumbs={[{ label: t("mydata.title") }]}
    >
      <section className="mt-4 space-y-3 rounded-2xl border border-border bg-card p-4 sm:p-5">
        <h2 className="flex items-center gap-2 text-lg font-medium">
          <ShieldCheck className="h-4 w-4" /> {t("mydata.keep.title")}
        </h2>
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          <li>{t("mydata.keep.item1")}</li>
          <li>{t("mydata.keep.item2")}</li>
          <li>{t("mydata.keep.item3")}</li>
          <li>{t("mydata.keep.item4")}</li>
        </ul>
        <p className="text-sm text-muted-foreground">
          {t("mydata.keep.more")}{" "}
          <Link to="/privacy" className="underline">
            {t("mydata.keep.privacyLink")}
          </Link>
          .
        </p>
      </section>

      <section className="mt-4 space-y-3 rounded-2xl border border-border bg-card p-4 sm:p-5">
        <h2 className="flex items-center gap-2 text-lg font-medium">
          <Download className="h-4 w-4" /> {t("mydata.export.title")}
        </h2>
        <p className="text-sm text-muted-foreground">{t("mydata.export.body")}</p>
        <Button onClick={exportData} disabled={exporting} className="h-11 w-full gap-1.5 sm:w-auto">
          {exporting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          {t("mydata.export.cta")}
        </Button>
      </section>

      <section className="mt-4 space-y-3 rounded-2xl border border-red-500/30 bg-red-500/5 p-4 sm:p-5">
        <h2 className="flex items-center gap-2 text-lg font-medium text-red-600">
          <AlertTriangle className="h-4 w-4" /> {t("mydata.delete.title")}
        </h2>
        <p className="text-sm text-muted-foreground">
          {t("mydata.delete.body1")}{" "}
          <span className="font-mono font-semibold">{t("mydata.delete.confirmWord")}</span>{" "}
          {t("mydata.delete.body2")}
        </p>
        <Input
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          placeholder={t("mydata.delete.confirmWord")}
          className="h-11 rounded-xl sm:max-w-xs"
        />
        <Button
          onClick={deleteEverything}
          disabled={confirmText !== t("mydata.delete.confirmWord") || deleting}
          variant="destructive"
          className="h-11 w-full gap-1.5 sm:w-auto"
        >
          {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
          {t("mydata.delete.cta")}
        </Button>
      </section>
    </AppLayout>
  );
}
