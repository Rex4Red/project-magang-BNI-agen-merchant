"use client";
import type { ReactNode } from "react";
import { useSession } from "@/lib/session";
import { AgentSearchProvider } from "@/lib/agent-search-session";
import WorkspaceShell from "@/components/WorkspaceShell";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const { user } = useSession();
  return <AgentSearchProvider key={user?.username || "guest"} username={user?.username || ""}>
    <WorkspaceShell workspace="agen">{children}</WorkspaceShell>
  </AgentSearchProvider>;
}
