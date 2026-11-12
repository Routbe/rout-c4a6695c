import { createFileRoute, redirect } from "@tanstack/react-router";

/** `/auth` is kept alive as a shortcut to the Neon Auth sign-in screen. */
export const Route = createFileRoute("/auth/")({
  beforeLoad: () => {
    throw redirect({ to: "/auth/$authView", params: { authView: "sign-in" } });
  },
});
