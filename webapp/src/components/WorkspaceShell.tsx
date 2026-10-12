"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useSession, homeFor, signOut } from "@/lib/session";
import { Icon } from "./Icon";
import DatabaseStatus from "./DatabaseStatus";
import VisitDataWorkspace from "./VisitDataWorkspace";
import styles from "@/app/dashboard/layout.module.css";

const agentItems = [
  { href: "/dashboard", label: "Ringkasan", icon: "grid" },
  { href: "/dashboard/search", label: "Eksplorasi toko", icon: "store" },
  { href: "/dashboard/canvasing", label: "Kunjungan", icon: "pin" },
  { href: "/dashboard/reports", label: "Laporan", icon: "chart" },
  { href: "/dashboard/settings", label: "Pengaturan", icon: "settings" },
] as const;
const merchantItems = [
  { href: "/merchant", label: "Cari merchant", icon: "search" },
  { href: "/merchant/canvasing", label: "Kunjungan merchant", icon: "pin" },
  { href: "/merchant/reports", label: "Laporan", icon: "chart" },
] as const;

export default function WorkspaceShell({ children, workspace }: { children: ReactNode; workspace: "agen" | "merchant" }) {
  const router = useRouter(), pathname = usePathname();
  const { ready, user } = useSession();
  const [menu, setMenu] = useState(false), [logoutError, setLogoutError] = useState("");
  const [loggingOut, setLoggingOut] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null), sidebar = useRef<HTMLElement>(null);
  const items = workspace === "agen" ? agentItems : merchantItems;
  const currentPage = items.find(item => item.href === pathname)?.label || "Canvasing";
  useEffect(() => {
    if (ready && (!user || user.workspace !== workspace)) router.replace(user ? homeFor(user.workspace) : "/");
  }, [ready, user, workspace, router]);
  useEffect(() => {
    if (!menu) return;
    const overflow = document.body.style.overflow;
    const returnFocus = menuButton.current;
    document.body.style.overflow = "hidden";
    const focusFrame = requestAnimationFrame(() => {
      const firstLink = sidebar.current?.querySelector<HTMLAnchorElement>("nav a[aria-current=page], nav a");
      firstLink?.focus();
    });
    function keydown(event: KeyboardEvent) {
      if (event.key === "Escape") { event.preventDefault(); setMenu(false); }
      if (event.key !== "Tab") return;
      const controls = sidebar.current?.querySelectorAll<HTMLElement>("a[href], button:not(:disabled)");
      if (!controls?.length) return;
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    window.addEventListener("keydown", keydown);
    return () => {
      cancelAnimationFrame(focusFrame);
      document.body.style.overflow = overflow;
      window.removeEventListener("keydown", keydown);
      requestAnimationFrame(() => {
        if (returnFocus?.isConnected && !returnFocus.closest("[inert]")) returnFocus.focus();
      });
    };
  }, [menu]);
  if (!ready || !user || user.workspace !== workspace) return <div className={styles.loading}>Menyiapkan ruang kerja…</div>;
  return <div className={styles.shell}>
    {menu && <button className={styles.backdrop} aria-label="Tutup menu" onClick={() => setMenu(false)} />}
    <aside ref={sidebar} id="workspace-navigation" className={`${styles.sidebar} ${menu ? styles.open : ""}`}>
      <a href={homeFor(workspace)} className={styles.brand} onClick={event => { event.preventDefault(); router.push(homeFor(workspace)); setMenu(false); }}>
        <Image src="/bni-logo.svg" alt="BNI" width={200} height={58} priority />
        <div className={styles.brandTitle}><strong>{workspace === "agen" ? "agen" : "merchant"}</strong></div>
      </a>
      <nav aria-label={`Menu ${workspace}`} className={styles.nav}>
        {items.map(item => <a key={item.href} href={item.href} aria-current={pathname === item.href ? "page" : undefined} className={pathname === item.href ? styles.active : ""}
          onClick={event => { event.preventDefault(); router.push(item.href); setMenu(false); }}><Icon name={item.icon} />{item.label}</a>)}
      </nav>
      <div className={styles.account}>
        <div className={styles.accountIdentity}><span className={styles.avatar}>{user.name.charAt(0)}</span><span><strong>{user.name}</strong><small>{user.username} · {workspace === "agen" ? "Agen" : "Merchant"}</small></span></div>
        <button className={styles.logout} disabled={loggingOut} onClick={async () => {
          setLoggingOut(true); setLogoutError("");
          try { await signOut(); router.push("/"); }
          catch (error) { setLogoutError(error instanceof Error ? error.message : "Gagal keluar."); }
          finally { setLoggingOut(false); }
        }}><Icon name="logout" />{loggingOut ? "Keluar…" : "Keluar"}</button>
      </div>
    </aside>
    <div className={styles.main} inert={menu}>
      <header className={styles.header}>
        <button ref={menuButton} className={styles.menuButton} aria-label="Buka menu" aria-controls="workspace-navigation" aria-expanded={menu} onClick={() => setMenu(true)}><Icon name="menu" /></button>
        <div className={styles.breadcrumb}><span>Operasional</span><span>/</span><strong>{currentPage}</strong></div>
        <div className={styles.headerRight}><DatabaseStatus /><span className={styles.headerAvatar} title={user.name}>{user.name.charAt(0)}</span></div>
      </header>
      <main className={styles.content}>{logoutError && <p className={styles.logoutError} role="alert">{logoutError}</p>}<VisitDataWorkspace>{children}</VisitDataWorkspace></main>
      <footer className={styles.footer}><span>BNI · Canvasing {workspace}</span></footer>
    </div>
  </div>;
}
