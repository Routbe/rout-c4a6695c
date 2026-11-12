import { redirect } from "@tanstack/react-router";
import { getSessionUser } from "./auth.functions";
import { amIAdmin } from "./admin.functions";

export async function controlAccess({ location }: { location: { href: string } }) {
  const user = await getSessionUser();
  if (!user) throw redirect({ to: "/auth/$authView", params: { authView: "sign-in" }, search: { redirect: location.href } });
  const access = await amIAdmin();
  if (!access.isAdmin) throw new Error("Dit beheerportaal is alleen voor beheerders.");
}