import { createFileRoute } from "@tanstack/react-router";
import { CommandCenter } from "@/components/dashboard/CommandCenter";

const TITLE = "Command Center | ROUT";
const DESC = "Je soevereine cockpit: identiteit, inbox, agenda, prikbord en statistieken in één overzicht.";

export const Route = createFileRoute("/_authenticated/dashboard/")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESC },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESC },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CommandCenter,
});
