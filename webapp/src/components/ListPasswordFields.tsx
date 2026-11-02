"use client";
export default function ListPasswordFields({ password, confirmation, onPassword, onConfirmation }: {
  password: string; confirmation: string; onPassword: (value: string) => void; onConfirmation: (value: string) => void;
}) {
  return <><label>Password daftar (opsional)<input type="password" autoComplete="new-password" minLength={6} maxLength={200} value={password} onChange={event => onPassword(event.target.value)} placeholder="Minimal 6 karakter" /></label>
    <label>Ulangi password daftar<input type="password" autoComplete="new-password" maxLength={200} value={confirmation} onChange={event => onConfirmation(event.target.value)} /></label>
    <p>Jika diisi, daftar hanya bisa dibuka dengan password ini. Admin tetap dapat memantaunya. Simpan password Anda.</p></>;
}
