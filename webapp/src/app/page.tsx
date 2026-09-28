"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import styles from "./page.module.css";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  function submit(event: FormEvent) {
    event.preventDefault();
    if ((username === "admin" && password === "admin123") ||
        (username === "canvaser" && password === "canvaser123") ||
        (username === "agen" && password === "agen123") ||
        (username === "merchant" && password === "merchant123")) {
      const workspace = username === "merchant" ? "merchant" : "agen";
      localStorage.setItem("user", JSON.stringify({ username, role: workspace, workspace, name: workspace === "merchant" ? "Canvaser Merchant" : username === "admin" ? "Admin BNI" : "Canvaser Agen" }));
      window.dispatchEvent(new Event("canvas-session"));
      router.push(workspace === "merchant" ? "/merchant" : "/dashboard");
    } else {
      setError("Username atau password salah");
    }
  }

  return <main className={styles.page}>
    <section className={styles.login} aria-labelledby="login-title">
      <div className={styles.brand}><Image src="/bni-official.png" alt="BNI agen46 — Melayani Paling Dekat" width={546} height={141} priority /></div>
      <div className={styles.card}>
        <h1 id="login-title">Masuk</h1>
        <p className={styles.subtitle}>Masuk dengan akun agen atau merchant Anda.</p>
        <form onSubmit={submit}>
          <label htmlFor="username">Username</label>
          <input id="username" autoComplete="username" placeholder="Masukkan username" required value={username} onChange={event => setUsername(event.target.value)} />
          <label htmlFor="password">Password</label>
          <input id="password" type="password" autoComplete="current-password" placeholder="Masukkan password" required value={password} onChange={event => setPassword(event.target.value)} />
          {error && <p className={styles.error} role="alert">{error}</p>}
          <button type="submit">Masuk</button>
        </form>
        <details className={styles.demo}><summary>Akun demo</summary><p>Agen: agen / agen123<br />Merchant: merchant / merchant123<br /><small>Akun agen lama: canvaser / canvaser123 dan admin / admin123 tetap dapat digunakan.</small></p></details>
      </div>
      <p className={styles.footer}>BNI Agen46 · Ruang kerja canvasing</p>
    </section>
  </main>;
}
