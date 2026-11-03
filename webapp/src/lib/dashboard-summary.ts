import type { VisitList } from "./canvasing";

export function dashboardSummary(lists: VisitList[]) {
  const stores = lists.flatMap(list => list.stores.map(store => ({
    key: JSON.stringify([list.id, store.visitId]),
    store,
    area: store.visitArea?.trim() || list.area?.trim() || list.name,
    updatedAt: store.visitedAt && Number.isFinite(Date.parse(store.visitedAt)) ? store.visitedAt : null,
  })));
  const visited = stores.filter(({ store }) => store.status === "visited");

  return {
    total: stores.length,
    potential: stores.filter(({ store }) => !!store.potential?.trim() || store.classification?.label === "potensial").length,
    visited: visited.length,
    agents: visited.filter(({ store }) => store.qrisStatus === "yes" || store.edcStatus === "yes").length,
    recentVisits: visited.sort((a, b) =>
      (b.updatedAt ? Date.parse(b.updatedAt) : 0) - (a.updatedAt ? Date.parse(a.updatedAt) : 0)
    ).slice(0, 5),
  };
}
