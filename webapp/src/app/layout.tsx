import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BNI Canvas — Workspace Canvasing",
  description:
    "Ruang kerja untuk pencarian toko, peninjauan hasil, dan persiapan canvasing.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
