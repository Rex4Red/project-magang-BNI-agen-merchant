"use client";
import { useState, useEffect, ReactNode } from "react";
import { useSession, homeFor } from "@/lib/session";
import { useRouter, usePathname } from "next/navigation";
import { Icon } from "@/components/Icon";
import styles from "./layout.module.css";
const items = [
 {href:"/dashboard",label:"Ringkasan",icon:"grid"},
 {href:"/dashboard/search",label:"Eksplorasi toko",icon:"search"},
 {href:"/dashboard/canvasing",label:"Kunjungan",icon:"clipboard"},
 {href:"/dashboard/reports",label:"Laporan",icon:"chart"},
 {href:"/dashboard/settings",label:"Pengaturan",icon:"settings"},
] as const;
export default function DashboardLayout({children}:{children:ReactNode}) {
 const router=useRouter(); const pathname=usePathname(); const [menu,setMenu]=useState(false);
 const {ready,user}=useSession();
 const currentPage=items.find(item=>item.href===pathname)?.label || "Workspace";
 useEffect(()=>{if(ready && (!user || user.workspace !== "agen")) router.replace(user ? homeFor(user.workspace) : "/");},[ready,user,router]);
 if(!ready || !user || user.workspace !== "agen") return <div className={styles.loading}>Menyiapkan ruang kerja…</div>;
 return <div className={styles.shell}>
  {menu&&<button className={styles.backdrop} aria-label="Tutup menu" onClick={()=>setMenu(false)}/>}
  <aside className={`${styles.sidebar} ${menu?styles.open:""}`}>
   <a href="/dashboard" className={styles.brand}><span className={styles.brandMark}>BNI</span><strong>agen<span>.</span></strong></a>
   <div className={styles.workspaceLabel}>CANVASING AGEN</div>
   <nav aria-label="Menu utama" className={styles.nav}>
    {items.map(item=><a key={item.href} href={item.href} aria-current={pathname===item.href?"page":undefined} className={pathname===item.href?styles.active:""} onClick={e=>{e.preventDefault();router.push(item.href);setMenu(false);}}><Icon name={item.icon}/>{item.label}{pathname===item.href&&<span className={styles.activeDot}/>}</a>)}
   </nav>
   <div className={styles.sidebarNote}><span>Area kerja Anda</span><p>Pencarian toko dan pencatatan kunjungan.</p></div>
   <div className={styles.account}><span className={styles.avatar}>{user.name.charAt(0)}</span><span><strong>{user.name}</strong><small>{user.role}</small></span><button aria-label="Keluar" onClick={()=>{localStorage.removeItem("user");router.push("/");}}><Icon name="logout"/></button></div>
  </aside>
  <div className={styles.main}>
   <header className={styles.header}>
    <button className={styles.menuButton} aria-label="Buka menu" aria-expanded={menu} onClick={()=>setMenu(!menu)}><Icon name="menu"/></button>
    <div className={styles.breadcrumb}><span>Workspace</span><span>/</span><strong>{currentPage}</strong></div>
    <span className={styles.headerLabel}>BNI CANVAS <span>•</span> OPERASIONAL</span>
   </header>
   <main className={styles.content}>{children}</main>
   <footer className={styles.footer}><span>BNI CANVAS</span><span>Aplikasi canvasing</span></footer>
  </div>
 </div>;
}

