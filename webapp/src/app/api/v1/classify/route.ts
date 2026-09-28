import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { classifyBusinessType } from "@/lib/store-business-type";

export const runtime = "nodejs";

interface ClassificationRequestItem {
  id: string;
  photoUrl: string | null;
  name: string;
  category: string;
}

interface ClassificationResult {
  id: string;
  label: "potensial" | "non_potensial" | "unavailable";
  confidence: number | null;
  reason: "no_photo" | "image_error" | "business_unknown" | null;
  source?: "image_model" | "business_type";
  businessReason?: string | null;
}

function isAllowedPhotoUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      (url.hostname === "googleusercontent.com" ||
        url.hostname.endsWith(".googleusercontent.com") ||
        url.hostname === "gstatic.com" ||
        url.hostname.endsWith(".gstatic.com"));
  } catch {
    return false;
  }
}

function runClassifier(scriptPath: string, items: ClassificationRequestItem[]): Promise<ClassificationResult[]> {
  return new Promise((resolve, reject) => {
    const python = spawn(process.env.BNI_PYTHON_EXECUTABLE || "python", [scriptPath], {
      cwd: path.dirname(scriptPath),
      env: { ...process.env, TF_CPP_MIN_LOG_LEVEL: "3" },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let output = "";
    let errors = "";
    let settled = false;
    const timeout = setTimeout(() => python.kill(), 120_000);

    python.stdout.setEncoding("utf8");
    python.stderr.setEncoding("utf8");
    python.stdout.on("data", (chunk: string) => { output += chunk; });
    python.stderr.on("data", (chunk: string) => { errors += chunk; });
    python.on("error", (error) => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        reject(error);
      }
    });
    python.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (code !== 0) {
        reject(new Error(errors || `Classifier exited with code ${code}`));
        return;
      }
      try {
        const parsed: { results: ClassificationResult[] } = JSON.parse(output);
        resolve(parsed.results);
      } catch {
        reject(new Error("Classifier returned invalid JSON"));
      }
    });
    python.stdin.end(JSON.stringify({ items }));
  });
}

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

    const scriptPath = path.resolve(process.cwd(), "..", "scraper", "classify_batch.py");
    if (!existsSync(scriptPath)) {
      return NextResponse.json({ error: "Model klasifikasi tidak tersedia di server" }, { status: 503 });
    }

    const validItems = items as ClassificationRequestItem[];
    const imageResults = await runClassifier(scriptPath, validItems);
    const results = imageResults.map((result, index) => {
      const business = classifyBusinessType(validItems[index].name, validItems[index].category);
      if (business.decision !== "unknown" && result.label !== "unavailable") {
        return {
          ...result,
          label: business.decision,
          confidence: null,
          source: "business_type" as const,
          businessReason: business.reason,
        };
      }
      if (result.label === "potensial") {
        return {
          ...result,
          label: "unavailable" as const,
          confidence: null,
          reason: "business_unknown" as const,
          source: "image_model" as const,
          businessReason: null,
        };
      }
      return { ...result, source: "image_model" as const, businessReason: null };
    });
    return NextResponse.json({ results });
  } catch (error) {
    console.error("Classification error:", error);
    return NextResponse.json({ error: "Gagal menjalankan klasifikasi gambar" }, { status: 500 });
  }
}
