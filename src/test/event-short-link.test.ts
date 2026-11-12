import { QueryClient } from "@tanstack/react-query";
import { createMemoryHistory, createRouter } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";
import { routeTree } from "@/routeTree.gen";

describe("event short link", () => {
  it("/e/<slug> is its own route, not a profile sub-page", () => {
    const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });
    expect(router.matchRoutes("/e/zomerfeest").at(-1)?.routeId).toBe("/e/$slug");
  });

  it("redirects permanently to /event/<slug>", async () => {
    const router = createRouter({
      routeTree,
      context: { queryClient: new QueryClient() },
      history: createMemoryHistory({ initialEntries: ["/e/zomerfeest"] }),
    });
    const route = router.routesById["/e/$slug"];
    let thrown: unknown;
    try {
      await route.options.beforeLoad?.({ params: { slug: "zomerfeest" } } as never);
    } catch (e) {
      thrown = e;
    }
    const r = thrown as { options?: { to?: string; params?: { slug?: string }; statusCode?: number } };
    expect(r.options?.to).toBe("/event/$slug");
    expect(r.options?.params?.slug).toBe("zomerfeest");
    expect(r.options?.statusCode).toBe(301);
  });
});
