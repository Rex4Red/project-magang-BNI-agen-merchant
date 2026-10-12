"use client";
import type { ReactNode } from "react";
import WorkspaceShell from "@/components/WorkspaceShell";
export default function MerchantLayout({ children }: { children: ReactNode }) {
  return <WorkspaceShell workspace="merchant">{children}</WorkspaceShell>;
}
