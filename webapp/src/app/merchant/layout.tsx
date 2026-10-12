"use client";
import type { ReactNode } from "react";
import { useSession } from "@/lib/session";
import { MerchantSearchProvider } from "@/lib/merchant-search-session";
import WorkspaceShell from "@/components/WorkspaceShell";

export default function MerchantLayout({ children }: { children: ReactNode }) {
  const { user } = useSession();
  return (
    <MerchantSearchProvider key={user?.username || "merchant"} username={user?.username || "merchant"}>
      <WorkspaceShell workspace="merchant">{children}</WorkspaceShell>
    </MerchantSearchProvider>
  );
}
