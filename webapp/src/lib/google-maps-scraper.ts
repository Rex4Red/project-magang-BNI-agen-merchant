/* eslint-disable @typescript-eslint/no-require-imports */
interface ScrapedStore {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  rating: number;
  reviewCount: number;
  category: string;
  photoUrl: string | null;
  url: string;
}

export async function scrapeGoogleMaps(
  query: string,
  lat: number,
  lng: number,
  zoom: number
): Promise<ScrapedStore[]> {
  const puppeteer = require("puppeteer-extra");
  const StealthPlugin = require("puppeteer-extra-plugin-stealth");
  puppeteer.use(StealthPlugin());

  const browser = await puppeteer.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
    ],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );

    // Navigate to Google Maps search WITH location bias
    // Adding @lat,lng,zoom to URL centers the search on that area
    const searchUrl = `https://www.google.com/maps/search/${encodeURIComponent(query)}/@${lat},${lng},${zoom}z`;
    await page.goto(searchUrl, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });

    // Wait for results to load
    await page.waitForSelector('[role="feed"], .section-result', {
      timeout: 15000,
    }).catch(() => {
      // Sometimes the selector doesn't match exactly, wait a bit more
    });

    // Extra wait for dynamic content
    await new Promise((r) => setTimeout(r, 3000));

    // Scroll the results panel to load more
    await autoScroll(page);

    // Extract store data using flexible selectors
    const stores: ScrapedStore[] = await page.evaluate(() => {
      const results: ScrapedStore[] = [];
      const seen = new Set<string>();

      // Strategy: find ALL links to /maps/place/ regardless of DOM position
      const allLinks = document.querySelectorAll('a[href*="/maps/place/"]');

      allLinks.forEach((item: Element, index: number) => {
        try {
          const anchor = item as HTMLAnchorElement;
          const ariaLabel = anchor.getAttribute("aria-label") || "";
          const href = anchor.href || "";

          // Must have a name and be a place link
          if (!ariaLabel || !href.includes("/maps/place/")) return;

          // Keep distinct branches with the same name.
          const placeKey = href.match(/!1s([^!/?]+)/)?.[1] || href;
          if (seen.has(placeKey)) return;
          seen.add(placeKey);

          // Extract coordinates from URL
          let lat = 0,
            lng = 0;
          // The @ coordinate is the camera position, not necessarily the store.
          const coordMatch = href.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
          if (coordMatch) {
            const parsedLat = parseFloat(coordMatch[1]);
            const parsedLng = parseFloat(coordMatch[2]);
            if (Math.abs(parsedLat) <= 90 && Math.abs(parsedLng) <= 180) {
              lat = parsedLat;
              lng = parsedLng;
            }
          }

          // Walk up to find a reasonable container (max 5 levels)
          let container: Element | null = anchor;
          for (let i = 0; i < 5; i++) {
            if (container.parentElement) {
              container = container.parentElement;
              // Stop if we find a container that has multiple children (likely the card)
              if (container.children.length >= 2) break;
            }
          }

          // Extract rating from aria-label like "4,6 bintang 291 ulasan"
          let rating = 0;
          let reviewCount = 0;
          const ratingEls = container.querySelectorAll(
            'span[role="img"], [aria-label*="bintang"], [aria-label*="star"]'
          );
          ratingEls.forEach((el) => {
            const label = el.getAttribute("aria-label") || "";
            const rMatch = label.match(/(\d[.,]\d)/);
            if (rMatch && !rating) {
              rating = parseFloat(rMatch[1].replace(",", "."));
            }
            const rcMatch = label.match(/(\d[\d.,]*)\s*(ulasan|review|rating)/i);
            if (rcMatch && !reviewCount) {
              reviewCount = parseInt(rcMatch[1].replace(/[.,]/g, ""), 10);
            }
          });

          // Also try text content for rating
          if (!rating) {
            const allText = container.textContent || "";
            const rMatch2 = allText.match(/(\d[.,]\d)\s*\((\d[\d.,]*)\)/);
            if (rMatch2) {
              rating = parseFloat(rMatch2[1].replace(",", "."));
              reviewCount = parseInt(rMatch2[2].replace(/[.,]/g, ""), 10);
            }
          }

          // Extract all text content for category/address
          let category = "";
          let address = "";
          const allSpans = container.querySelectorAll("span, div");
          const textParts: string[] = [];

          allSpans.forEach((el) => {
            const text = (el.textContent || "").trim();
            if (!text || text.length > 150 || text === ariaLabel) return;
            if (text.length < 3) return;
            textParts.push(text);
          });

          // Find category (usually contains · separator or type keywords)
          for (const text of textParts) {
            if (text.includes("·") && !category) {
              const parts = text.split("·").map((p) => p.trim());
              category = parts[0] || "";
              // Address might be after the dot
              if (parts.length > 1 && !address) {
                const addrPart = parts.find(
                  (p) =>
                    p.includes("Jl") ||
                    p.includes("No") ||
                    p.includes("Kec") ||
                    p.includes("Blok")
                );
                if (addrPart) address = addrPart;
              }
            }
          }

          // Find address
          if (!address) {
            for (const text of textParts) {
              if (
                (text.includes("Jl") ||
                  text.includes("Jalan") ||
                  text.includes("No.") ||
                  text.includes("Blok") ||
                  text.includes("Raya")) &&
                text.length > 5
              ) {
                address = text;
                break;
              }
            }
          }

          // Extract photo
          let photoUrl: string | null = null;
          const imgs = container.querySelectorAll("img");
          imgs.forEach((img) => {
            const src = img.getAttribute("src") || "";
            if (
              src.includes("googleusercontent.com") &&
              !src.includes("=w24") &&
              !src.includes("=w32") &&
              !src.includes("=w36") &&
              !src.includes("=s") &&
              src.length > 50 &&
              !photoUrl
            ) {
              photoUrl = src.split("=")[0] + "=w400-h300";
            }
          });

          results.push({
            id: `store-${index}`,
            name: ariaLabel,
            address: address || "Alamat tidak tersedia",
            lat,
            lng,
            rating,
            reviewCount,
            category: category || "Toko",
            photoUrl,
            url: href,
          });
        } catch {
          // Skip invalid entries
        }
      });

      return results;
    });

    return stores;
  } finally {
    await browser.close();
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function autoScroll(page: any) {
  await page.evaluate(async () => {
    // The correct scrollable element is [role="feed"] ITSELF
    const scrollable = document.querySelector('[role="feed"]');

    if (!scrollable) return;

    let previousHeight = 0;
    let sameHeightCount = 0;

    // Scroll up to 10 times, stopping early if no new content loads
    for (let i = 0; i < 10; i++) {
      scrollable.scrollTop = scrollable.scrollHeight;
      await new Promise((r) => setTimeout(r, 2000));

      const currentHeight = scrollable.scrollHeight;
      if (currentHeight === previousHeight) {
        sameHeightCount++;
        if (sameHeightCount >= 2) break;
      } else {
        sameHeightCount = 0;
      }
      previousHeight = currentHeight;
    }
  });
}

