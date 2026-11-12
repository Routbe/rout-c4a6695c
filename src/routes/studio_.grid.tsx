import { createFileRoute } from "@tanstack/react-router";
import Studio from "@/components/imported-pages/Studio";

export const Route = createFileRoute("/studio_/grid")({
  head: () => ({ meta: [
    { title: "Social Grid | ROUT Profile Studio" },
    { name: "description", content: "Manage the linked posts, articles, and video thumbnails on your ROUT profile." },
    { property: "og:title", content: "Social Grid | ROUT Profile Studio" },
    { property: "og:description", content: "Manage the linked posts, articles, and video thumbnails on your ROUT profile." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
    { name: "robots", content: "noindex, nofollow" },
  ] }),
  component: () => <Studio initialGrid />,
});