"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { signIn, homeFor } from "@/lib/session";
import styles from "./page.module.css";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError("");
    try { const user = await signIn(username, password); router.push(homeFor(user.workspace)); }
    catch (error) { setError(error instanceof Error ? error.message : "Login gagal. Periksa koneksi dan coba lagi."); }
    finally { setBusy(false); }
  }

  return <main className={styles.page}>
    <section className={styles.login} aria-labelledby="login-title">
      <div className={styles.brand}><Image src="/bni-logo.svg" alt="BNI" width={200} height={58} priority /></div>
      <div className={styles.card}>
        <h1 id="login-title">Masuk</h1>
        <p className={styles.subtitle}>Masuk dengan akun agen atau merchant Anda.</p>
        <form onSubmit={submit}>
          <label htmlFor="username">Username</label>
          <input id="username" autoComplete="username" placeholder="Masukkan username" required value={username} onChange={event => setUsername(event.target.value)} />
          <label htmlFor="password">Password</label>
          <input id="password" type="password" autoComplete="current-password" placeholder="Masukkan password" required value={password} onChange={event => setPassword(event.target.value)} />
          {error && <p className={styles.error} role="alert">{error}</p>}
          <button type="submit" disabled={busy}>{busy ? "Memeriksa akun…" : "Masuk"}</button>
        </form>
        <details className={styles.demo}><summary>Akun demo</summary><p>Agen: agen / agen123<br />Merchant: merchant / merchant123<br /><small>Akun agen lama: canvaser / canvaser123 dan admin / admin123 tetap dapat digunakan.</small></p></details>
      </div>
      <p className={styles.footer}>BNI · Ruang kerja canvasing</p>
    </section>
  </main>;
}
