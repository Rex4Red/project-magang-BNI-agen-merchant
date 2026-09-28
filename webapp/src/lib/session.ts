"use client";
import { useSyncExternalStore } from "react";

export type Workspace = "agen" | "merchant";
export interface Session { username: string; name: string; role: string; workspace: Workspace }

export function readSession(raw: string | null | undefined): Session | null {
  try {
    const data = JSON.parse(raw || "null");
    if (!["admin", "canvaser", "agen", "merchant"].includes(data?.username)) return null;
    return { ...data, workspace: data.username === "merchant" ? "merchant" : "agen" };
  } catch { return null; }
}

export function homeFor(workspace: Workspace) { return workspace === "merchant" ? "/merchant" : "/dashboard"; }

function subscribe(listener: () => void) {
  window.addEventListener("storage", listener);
  window.addEventListener("canvas-session", listener);
  return () => { window.removeEventListener("storage", listener); window.removeEventListener("canvas-session", listener); };
}
export function useSession() {
  const raw = useSyncExternalStore(subscribe, () => localStorage.getItem("user"), () => undefined);
  return { ready: raw !== undefined, user: readSession(raw) };
}
