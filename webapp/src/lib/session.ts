"use client";
import { useEffect, useSyncExternalStore } from "react";

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
const initial = { ready: false, user: null as Session | null, error: "" };
let current = initial;
let pending: Promise<void> | null = null;
let generation = 0;
const listeners = new Set<() => void>();
function publish(user: Session | null, error = "") {
  current = { ready: true, user, error }; listeners.forEach(listener => listener());
}
export async function refreshSession() {
  if (pending) return pending;
  const started = generation;
  pending = (async () => {
    try {
      const response = await fetch("/api/v1/session", { cache: "no-store", signal: AbortSignal.timeout(15000) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Sesi belum dapat diperiksa.");
      if (started === generation) publish(data.user);
    } catch (error) {
      if (started === generation) publish(current.user, error instanceof Error ? error.message : "Server belum dapat dihubungi.");
    } finally { pending = null; }
  })();
  return pending;
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  const storage = (event: StorageEvent) => { if (event.key === "user") void refreshSession(); };
  window.addEventListener("storage", storage);
  return () => { listeners.delete(listener); window.removeEventListener("storage", storage); };
}
export function useSession() {
  const value = useSyncExternalStore(subscribe, () => current, () => initial);
  useEffect(() => { void refreshSession(); }, []);
  return value;
}
export async function signIn(username: string, password: string) {
  const response = await fetch("/api/v1/session", { method: "POST", headers: { "Content-Type": "application/json", "x-canvas-client": "1" },
    body: JSON.stringify({ username, password }), signal: AbortSignal.timeout(15000) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Login gagal. Coba lagi.");
  generation++; publish(data.user);
  try { localStorage.setItem("user", JSON.stringify(data.user)); } catch { /* Server session remains usable when browser storage is blocked. */ }
  window.dispatchEvent(new Event("canvas-session"));
  return data.user as Session;
}
export async function signOut() {
  const response = await fetch("/api/v1/session", { method: "DELETE", headers: { "x-canvas-client": "1" }, signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error("Gagal keluar. Periksa koneksi lalu coba lagi.");
  generation++; publish(null);
  try { localStorage.removeItem("user"); } catch { /* The server session has already been revoked. */ }
  window.dispatchEvent(new Event("canvas-session"));
}
