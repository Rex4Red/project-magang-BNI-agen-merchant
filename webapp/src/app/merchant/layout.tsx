"use client";
import { useEffect, useState, type ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useSession, homeFor } from '@/lib/session';
import { Icon } from '@/components/Icon';
import styles from '../dashboard/layout.module.css';
export default function MerchantLayout({children}:{children:ReactNode}) {
 const {ready,user}=useSession(); const router=useRouter();const pathname=usePathname();const [menu,setMenu]=useState(false);
 useEffect(()=>{if(ready && (!user || user.workspace !== 'merchant')) router.replace(user ? homeFor(user.workspace) : '/');},[ready,user,router]);
 if(!ready || !user || user.workspace !== 'merchant') return <div className={styles.loading}>Menyiapkan merchant…</div>;
 return <div className={styles.shell}>
 {menu && <button className={styles.backdrop} aria-label="Tutup menu" onClick={()=>setMenu(false)}/>}
 <aside className={`${styles.sidebar} ${menu?styles.open:''}`}><a href="/merchant" className={styles.brand}><span className={styles.brandMark}>BNI</span><strong>merchant.</strong></a><div className={styles.workspaceLabel}>CANVASING MERCHANT</div>
 <nav className={styles.nav} aria-label="Menu merchant">{[{href:'/merchant',label:'Cari merchant',icon:'search' as const},{href:'/merchant/canvasing',label:'Kunjungan merchant',icon:'clipboard' as const}].map(item=><a key={item.href} href={item.href} className={pathname===item.href?styles.active:''} aria-current={pathname===item.href?'page':undefined} onClick={e=>{e.preventDefault();router.push(item.href);setMenu(false);}}><Icon name={item.icon}/>{item.label}</a>)}</nav>
 <div className={styles.sidebarNote}><span>Merchant</span><p>Pilih ruas jalan dan simpan usaha untuk dikunjungi.</p></div><div className={styles.account}><span className={styles.avatar}>M</span><span><strong>{user.name}</strong><small>Merchant</small></span><button aria-label="Keluar" onClick={()=>{localStorage.removeItem('user');window.dispatchEvent(new Event('canvas-session'));router.replace('/');}}><Icon name="logout"/></button></div></aside>
 <div className={styles.main}><header className={styles.header}><button className={styles.menuButton} aria-label="Buka menu" onClick={()=>setMenu(!menu)}><Icon name="menu"/></button><div className={styles.breadcrumb}><span>Merchant</span><span>/</span><strong>{pathname.includes('canvasing')?'Kunjungan':'Pencarian'}</strong></div></header><main className={styles.content}>{children}</main><footer className={styles.footer}>BNI · Canvasing merchant</footer></div></div>;
}
