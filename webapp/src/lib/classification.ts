import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { classifyBusinessType } from "@/lib/store-business-type";


export interface ClassificationRequestItem {
  id: string;
  photoUrl: string | null;
  name: string;
  category: string;
}

export interface ClassificationResult {
  id: string;
  label: "potensial" | "non_potensial" | "unavailable";
  confidence: number | null;
  reason: "no_photo" | "image_error" | "business_unknown" | "low_confidence" | null;
  source?: "image_model" | "business_type";
  businessReason?: string | null;
}

export function isAllowedPhotoUrl(value: string): boolean {
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

export async function classifyItems(items: ClassificationRequestItem[]) {
    const decisions = items.map(item => classifyBusinessType(item.name, item.category));
    const unknownItems = items.filter((_, index) => decisions[index].decision === 'unknown');
    let imageResults: ClassificationResult[] = [];
    if (unknownItems.some(item => item.photoUrl)) {
      const scriptPath = path.resolve(process.cwd(), "..", "scraper", "classify_batch.py");
      if (!existsSync(scriptPath)) {
        throw new Error("Model klasifikasi tidak tersedia di server");
      }

      imageResults = await runClassifier(scriptPath, unknownItems);
    }
    const byId = new Map(imageResults.map(result => [result.id, result]));
    return items.map((item, index): ClassificationResult => {
      const business = decisions[index];
      if (business.decision !== "unknown") {
        return {
          id: item.id,
          label: business.decision,
          confidence: null,
          reason: null,
          source: "business_type" as const,
          businessReason: business.reason,
        };
      }
      const result: ClassificationResult = byId.get(item.id) || {
        id: item.id, label: 'unavailable', confidence: null, reason: item.photoUrl ? 'image_error' : 'no_photo',
      };
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
}
