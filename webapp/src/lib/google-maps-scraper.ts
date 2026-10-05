/* eslint-disable @typescript-eslint/no-require-imports */
import type { Browser, Page } from "puppeteer";

export interface ScrapedStore {
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

interface ScraperOptions {
  loadPhotoFor?: (store: ScrapedStore) => boolean;
}

const placeKey = (url: string) => url.match(/!1s([^!/?]+)/)?.[1] || url;

export async function createGoogleMapsScraper(options: ScraperOptions = {}) {
  const puppeteer = require("puppeteer-extra");
  if (!puppeteer.plugins.some((plugin: { name: string }) => plugin.name === "stealth")) {
    puppeteer.use(require("puppeteer-extra-plugin-stealth")());
  }
  const browser: Browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  });
  const photos = new Map<string, string>();
  return {
    search: (query: string, lat: number, lng: number, zoom: number) => searchPage(browser, query, lat, lng, zoom, options, photos),
    close: () => browser.close(),
  };
}

export async function scrapeGoogleMaps(query: string, lat: number, lng: number, zoom: number): Promise<ScrapedStore[]> {
  const scraper = await createGoogleMapsScraper();
  try { return await scraper.search(query, lat, lng, zoom); }
  finally { await scraper.close(); }
}

async function searchPage(
  browser: Browser,
  query: string,
  lat: number,
  lng: number,
  zoom: number,
  options: ScraperOptions,
  photos: Map<string, string>
): Promise<ScrapedStore[]> {
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: 1280, height: 900 });
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );

    const searchUrl = `https://www.google.com/maps/search/${encodeURIComponent(query)}/@${lat},${lng},${zoom}z`;
    await page.goto(searchUrl, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });

    await page.waitForSelector('[role="feed"], .section-result', {
      timeout: 15000,
    });
    await page.waitForSelector('a[href*="/maps/place/"][aria-label]', { timeout: 10000 });
    if (!options.loadPhotoFor) await waitForVisiblePhotos(page);
    await autoScroll(page, !options.loadPhotoFor);
    if (!options.loadPhotoFor) await loadCardPhotos(page);
    let stores = await extractStores(page);
    if (options.loadPhotoFor) {
      for (const store of stores) {
        if (store.photoUrl) photos.set(placeKey(store.url), store.photoUrl);
        else store.photoUrl = photos.get(placeKey(store.url)) || null;
      }
      const needed = stores.filter(store => !store.photoUrl && options.loadPhotoFor!(store));
      if (needed.length) {
        await loadSelectedCardPhotos(page, needed.map(store => store.url));
        stores = await extractStores(page);
      }
      for (const store of stores) {
        if (store.photoUrl) photos.set(placeKey(store.url), store.photoUrl);
        else store.photoUrl = photos.get(placeKey(store.url)) || null;
      }
    }
    return stores;
  } finally {
    await page.close();
  }
}

async function extractStores(page: Page): Promise<ScrapedStore[]> {
    return page.evaluate(() => {
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

}

async function autoScroll(page: Page, loadPhotos: boolean) {
  let stable = 0;
  // Keep the same ten-page limit; advance as soon as Maps adds results.
  for (let step = 0; step < 10; step++) {
    const before = await page.evaluate(() => {
      const feed = document.querySelector('[role="feed"]');
      if (!feed) return null;
      const state = { count: feed.querySelectorAll('a[href*="/maps/place/"]').length };
      feed.scrollTop = feed.scrollHeight;
      return state;
    });
    if (!before) break;
    try {
      await page.waitForFunction((previous) => {
        const feed = document.querySelector('[role="feed"]');
        return feed && feed.querySelectorAll('a[href*="/maps/place/"]').length > previous.count;
      }, { timeout: 2000, polling: 100 }, before);
      if (loadPhotos) await waitForVisiblePhotos(page);
      stable = 0;
    } catch (error) {
      if (!(error instanceof Error) || error.name !== 'TimeoutError') throw error;
      if (++stable >= 2) break;
    }
  }
}

async function loadSelectedCardPhotos(page: Page, urls: string[]) {
  await page.evaluate(async (targets) => {
    for (const url of targets) {
      const anchor = [...document.querySelectorAll<HTMLAnchorElement>('a[href*="/maps/place/"]')].find(link => link.href === url);
      if (!anchor) continue;
      let card: Element = anchor;
      for (let level = 0; level < 5 && card.parentElement; level++) {
        card = card.parentElement;
        if (card.children.length >= 2) break;
      }
      const hasPhoto = () => [...card.querySelectorAll('img')].some(img =>
        img.src.includes('googleusercontent.com') && img.src.length > 50
        && !['=w24', '=w32', '=w36', '=s'].some(size => img.src.includes(size)));
      if (hasPhoto()) continue;
      card.scrollIntoView({ block: 'center' });
      await new Promise<void>(resolve => {
        const observer = new MutationObserver(() => { if (hasPhoto()) finish(); });
        const timer = setTimeout(finish, 800);
        function finish() { clearTimeout(timer); observer.disconnect(); resolve(); }
        observer.observe(card, { attributes: true, childList: true, subtree: true, attributeFilter: ['src'] });
        if (hasPhoto()) finish();
      });
    }
  }, urls);
}

async function waitForVisiblePhotos(page: Page) {
  // Maps assigns lazy photo URLs after a card enters the results viewport.
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await page.waitForFunction(() => {
    const feed = document.querySelector('[role="feed"]');
    if (!feed) return true;
    const bounds = feed.getBoundingClientRect();
    return [...feed.querySelectorAll('img')].filter(img => {
      const box = img.getBoundingClientRect();
      return box.height > 40 && box.bottom > bounds.top && box.top < bounds.bottom;
    }).every(img => img.src.includes('googleusercontent.com'));
  }, { timeout: 1200, polling: 100 }).catch((error: unknown) => {
    if (!(error instanceof Error) || error.name !== 'TimeoutError') throw error;
  });
}

async function loadCardPhotos(page: Page) {
  await page.evaluate(async () => {
    const feed = document.querySelector('[role="feed"]');
    if (!feed) return;
    const height = feed.scrollHeight;
    const step = Math.max(300, feed.clientHeight - 100);
    // Visit loaded cards so fast scrolling does not skip their lazy images.
    for (let top = 0; top < height; top += step) {
      feed.scrollTop = top;
      await new Promise(resolve => setTimeout(resolve, 150));
    }
  });
  await waitForVisiblePhotos(page);
}

