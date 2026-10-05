import { NextResponse } from "next/server";
import { classifyItems, isAllowedPhotoUrl, type ClassificationRequestItem } from "@/lib/classification";
export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    if (Number(request.headers.get("content-length")) > 25_000) {
      return NextResponse.json({ error: "Request terlalu besar" }, { status: 413 });
    }
    const body: unknown = await request.json();
    const items = typeof body === "object" && body !== null && "items" in body
      ? (body as { items: unknown }).items : null;
    if (!Array.isArray(items) || items.length > 50 || items.some((item) =>
      typeof item !== "object" || item === null ||
      typeof item.id !== "string" || item.id.length > 100 ||
      typeof item.name !== "string" || item.name.length > 300 ||
      typeof item.category !== "string" || item.category.length > 400 ||
      (item.photoUrl !== null &&
        (typeof item.photoUrl !== "string" || item.photoUrl.length > 2000 || !isAllowedPhotoUrl(item.photoUrl)))
    )) {
      return NextResponse.json({ error: "Data foto tidak valid" }, { status: 400 });
    }

    const results = await classifyItems(items as ClassificationRequestItem[]);
    return NextResponse.json({ results });
  } catch (error) {
    console.error("Classification error:", error);
    return NextResponse.json({ error: "Gagal menjalankan klasifikasi gambar" }, { status: 500 });
  }
}
