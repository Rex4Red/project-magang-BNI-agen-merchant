/**
 * scrape-images.js — Google Maps Image Scraper
 * 
 * Scrape foto-foto toko dari Google Maps untuk training dataset
 * ML klasifikasi toko potensial vs non-potensial.
 * 
 * Usage:
 *   node scrape-images.js                    # Scrape semua (potensial + non_potensial)
 *   node scrape-images.js --label potensial  # Scrape hanya potensial
 *   node scrape-images.js --label non_potensial
 *   node scrape-images.js --query "toko kelontong di Seturan" --label potensial
 */

const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");
const CONFIG = require("./config");

puppeteer.use(StealthPlugin());

// ============================================================
// UTILITIES
// ============================================================

/** Sleep for given milliseconds with random jitter */
function sleep(ms) {
  const jitter = Math.floor(Math.random() * (ms * 0.3));
  return new Promise((r) => setTimeout(r, ms + jitter));
}

/** Sanitize a string for use as filename */
function sanitizeFilename(str) {
  return str
    .replace(/[^a-zA-Z0-9\u00C0-\u024F\u1E00-\u1EFF\s\-_]/g, "")
    .replace(/\s+/g, "_")
    .substring(0, 80)
    .trim();
}

/** Download image from URL and save to disk */
function downloadImage(url, filepath) {
  return new Promise((resolve, reject) => {
    if (!url || (!url.startsWith("http://") && !url.startsWith("https://"))) {
      return reject(new Error(`Invalid URL: ${url}`));
    }

    const protocol = url.startsWith("https") ? https : http;
    const file = fs.createWriteStream(filepath);

    protocol
      .get(url, { timeout: 15000 }, (response) => {
        // Follow redirects
        if (response.statusCode === 301 || response.statusCode === 302) {
          const redirectUrl = response.headers.location;
          file.close();
          fs.unlinkSync(filepath);
          return downloadImage(redirectUrl, filepath).then(resolve).catch(reject);
        }

        if (response.statusCode !== 200) {
          file.close();
          fs.unlinkSync(filepath);
          return reject(new Error(`HTTP ${response.statusCode}`));
        }

        response.pipe(file);
        file.on("finish", () => {
          file.close();
          // Check if file is actually an image (> 5KB)
          const stats = fs.statSync(filepath);
          if (stats.size < 5000) {
            fs.unlinkSync(filepath);
            reject(new Error("File too small, likely not a valid image"));
          } else {
            resolve(filepath);
          }
        });
      })
      .on("error", (err) => {
        file.close();
        if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
        reject(err);
      })
      .on("timeout", () => {
        file.close();
        if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
        reject(new Error("Download timeout"));
      });
  });
}

/** Load or create metadata tracking file */
function loadMetadata() {
  const metaPath = CONFIG.output.metadataFile;
  if (fs.existsSync(metaPath)) {
    return JSON.parse(fs.readFileSync(metaPath, "utf-8"));
  }
  return { scrapedPlaces: {}, totalImages: 0, sessions: [] };
}

/** Save metadata */
function saveMetadata(metadata) {
  fs.writeFileSync(CONFIG.output.metadataFile, JSON.stringify(metadata, null, 2));
}

/** Console log with timestamp and color */
function log(emoji, message) {
  const time = new Date().toLocaleTimeString("id-ID");
  console.log(`[${time}] ${emoji} ${message}`);
}

// ============================================================
// GOOGLE MAPS SCRAPER CLASS
// ============================================================

class GMapsImageScraper {
  constructor() {
    this.browser = null;
    this.page = null;
    this.metadata = loadMetadata();
    this.interceptedImageUrls = new Set(); // Captured via network interception
    this.stats = {
      queriesProcessed: 0,
      listingsProcessed: 0,
      imagesDownloaded: 0,
      errors: 0,
      skipped: 0,
    };
  }

  /** Clear intercepted image URLs (call before each listing) */
  clearInterceptedUrls() {
    this.interceptedImageUrls.clear();
  }

  /** Get intercepted image URLs */
  getInterceptedUrls() {
    return Array.from(this.interceptedImageUrls);
  }

  /** Launch browser */
  async init() {
    log("🚀", "Launching browser...");

    this.browser = await puppeteer.launch({
      headless: CONFIG.scraping.headless,
      protocolTimeout: 60000, // 60s protocol timeout to prevent callFunctionOn timeouts
      defaultViewport: {
        width: CONFIG.scraping.windowWidth,
        height: CONFIG.scraping.windowHeight,
      },
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-blink-features=AutomationControlled",
        "--disable-web-security",
        "--lang=id-ID",
        `--window-size=${CONFIG.scraping.windowWidth},${CONFIG.scraping.windowHeight}`,
      ],
    });

    this.page = await this.browser.newPage();

    // Set Indonesian locale
    await this.page.setExtraHTTPHeaders({ "Accept-Language": "id-ID,id;q=0.9,en;q=0.5" });

    // Set a realistic user agent
    await this.page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );

    // Block unnecessary resources for speed (but keep images!)
    await this.page.setRequestInterception(true);
    this.page.on("request", (req) => {
      const blocked = ["font", "media"];
      if (blocked.includes(req.resourceType())) {
        req.abort();
      } else {
        req.continue();
      }
    });

    // 🔑 KEY: Intercept network responses to capture Google CDN image URLs
    this.page.on("response", (response) => {
      const url = response.url();
      const status = response.status();
      if (
        status === 200 &&
        (url.includes("googleusercontent.com/p/") ||
          url.includes("ggpht.com/p/") ||
          url.includes("googleusercontent.com/gms/")) &&
        !url.includes("=s32") &&
        !url.includes("=s36") &&
        !url.includes("=s44") &&
        !url.includes("=w24") &&
        !url.includes("=w32") &&
        !url.includes("=w36") &&
        !url.includes("=w48")
      ) {
        // Store high-res version of the URL
        const highResUrl = url.split("=")[0] + "=w800-h600";
        this.interceptedImageUrls.add(highResUrl);
      }
    });

    log("✅", "Browser launched successfully");
  }

  /** Take a debug screenshot */
  async debugScreenshot(name) {
    try {
      const screenshotPath = path.join(CONFIG.output.baseDir, `debug_${name}.png`);
      await this.page.screenshot({ path: screenshotPath, fullPage: false });
      log("📸", `Debug screenshot saved: ${screenshotPath}`);
    } catch (err) {
      log("⚠️", `Could not save screenshot: ${err.message}`);
    }
  }

  /** Handle Google consent dialogs (cookie consent, etc.) */
  async handleConsent() {
    await sleep(2000);

    // Strategy 1: Look for common consent buttons
    const consentSelectors = [
      'button[aria-label="Accept all"]',
      'button[aria-label="Terima semua"]',
      'button[aria-label="Setuju"]',
      'button[aria-label="Agree"]',
      // Google consent form buttons
      'form[action*="consent"] button',
      'form[action*="consent"] input[type="submit"]',
      // "I agree" style buttons
      'button:has-text("Accept")',
      'button:has-text("Setuju")',
      'div[role="dialog"] button',
    ];

    for (const selector of consentSelectors) {
      try {
        const btn = await this.page.$(selector);
        if (btn) {
          const isVisible = await btn.isIntersectingViewport();
          if (isVisible) {
            await btn.click();
            log("🍪", `Accepted consent via: ${selector}`);
            await sleep(3000);
            return true;
          }
        }
      } catch {
        continue;
      }
    }

    // Strategy 2: Try clicking buttons by text content
    try {
      const clicked = await this.page.evaluate(() => {
        const buttons = document.querySelectorAll('button, input[type="submit"]');
        for (const btn of buttons) {
          const text = (btn.textContent || btn.value || "").toLowerCase().trim();
          if (
            text.includes("accept all") ||
            text.includes("terima semua") ||
            text.includes("setuju") ||
            text.includes("agree") ||
            text.includes("i agree")
          ) {
            btn.click();
            return true;
          }
        }
        return false;
      });
      if (clicked) {
        log("🍪", "Accepted consent via text match");
        await sleep(3000);
        return true;
      }
    } catch {
      // No consent found
    }

    return false;
  }

  /** Navigate to Google Maps and handle consent */
  async goToMaps() {
    log("🗺️", "Navigating to Google Maps...");
    await this.page.goto("https://www.google.com/maps", {
      waitUntil: "domcontentloaded",
      timeout: CONFIG.scraping.navigationTimeout,
    });

    // Handle consent (may appear on first visit)
    await this.handleConsent();

    // Wait for maps to fully load
    await sleep(3000);

    // Verify maps loaded by checking for recognizable elements
    const currentUrl = this.page.url();
    log("🌐", `Current URL: ${currentUrl}`);

    // If we got redirected to consent page, handle it
    if (currentUrl.includes("consent")) {
      log("🍪", "Redirected to consent page, handling...");
      await this.handleConsent();
      await sleep(3000);
      // Navigate again
      await this.page.goto("https://www.google.com/maps", {
        waitUntil: "domcontentloaded",
        timeout: CONFIG.scraping.navigationTimeout,
      });
      await sleep(3000);
    }

    await this.debugScreenshot("maps_loaded");
    log("✅", "Google Maps loaded");
  }

  /** Search for a query in Google Maps — uses direct URL navigation */
  async search(query) {
    log("🔍", `Searching: "${query}"`);

    // Navigate directly to search URL — much more reliable than typing
    const searchUrl = `https://www.google.com/maps/search/${encodeURIComponent(query)}`;
    log("🌐", `Navigating to: ${searchUrl}`);

    await this.page.goto(searchUrl, {
      waitUntil: "domcontentloaded",
      timeout: CONFIG.scraping.navigationTimeout,
    });

    // Handle consent if it pops up again
    await this.handleConsent();

    await sleep(CONFIG.scraping.delayBetweenActions + 2000);

    // Wait for results feed to appear
    try {
      await this.page.waitForSelector('div[role="feed"]', {
        timeout: 15000,
      });
      log("✅", "Search results loaded");
    } catch {
      // Maybe single result or different layout
      log("⚠️", "No feed found — might be single result or different layout");
      await this.debugScreenshot("no_feed_" + sanitizeFilename(query));

      // Try alternative: check if we landed on a single place page
      const isSinglePlace = await this.page.evaluate(() => {
        return !!document.querySelector('h1.fontHeadlineLarge, h1[class*="header"]');
      });

      if (isSinglePlace) {
        log("📍", "Single place result detected");
      } else {
        // Try scrolling down to trigger lazy load
        await sleep(3000);
      }
    }
  }

  /** Scroll the results panel to load more listings */
  async scrollResults() {
    log("📜", "Scrolling to load all results...");

    let previousCount = 0;
    let scrollAttempts = 0;

    while (scrollAttempts < CONFIG.scraping.maxScrollAttempts) {
      // Count current listings
      const currentCount = await this.page.evaluate(() => {
        const feed = document.querySelector('div[role="feed"]');
        if (!feed) return 0;
        return feed.querySelectorAll(":scope > div > div > a").length;
      });

      if (currentCount === previousCount && scrollAttempts > 2) {
        log("📜", `No more results to load (found ${currentCount} listings)`);
        break;
      }

      previousCount = currentCount;

      // Scroll the feed container
      await this.page.evaluate(() => {
        const feed = document.querySelector('div[role="feed"]');
        if (feed) {
          feed.scrollTop = feed.scrollHeight;
        }
      });

      await sleep(CONFIG.scraping.delayBetweenScrolls);
      scrollAttempts++;
    }

    return previousCount;
  }

  /** Get all listing elements from search results */
  async getListingLinks() {
    const links = await this.page.evaluate(() => {
      const feed = document.querySelector('div[role="feed"]');
      if (!feed) return [];

      const anchors = feed.querySelectorAll(":scope > div > div > a");
      return Array.from(anchors)
        .filter((a) => a.href && a.href.includes("/maps/place/"))
        .map((a) => ({
          href: a.href,
          ariaLabel: a.getAttribute("aria-label") || "",
        }));
    });

    return links;
  }

  /** Extract place details from the detail panel */
  async extractPlaceDetails() {
    await sleep(1500);

    const details = await this.page.evaluate(() => {
      // Try multiple selectors for place name
      const nameEl =
        document.querySelector("h1.fontHeadlineLarge") ||
        document.querySelector('h1[class*="header"]') ||
        document.querySelector("h1");

      // Try to get category
      const categoryEl =
        document.querySelector('button[jsaction*="category"]') ||
        document.querySelector('span[jstcache] + span') ||
        null;

      // Try to get address
      const addressEl = document.querySelector(
        'button[data-item-id="address"] div, div[data-item-id="address"]'
      );

      // Try to get rating
      const ratingEl = document.querySelector('div.fontBodyMedium span[aria-hidden]');

      return {
        name: nameEl ? nameEl.textContent.trim() : "Unknown",
        category: categoryEl ? categoryEl.textContent.trim() : "",
        address: addressEl ? addressEl.textContent.trim() : "",
        rating: ratingEl ? ratingEl.textContent.trim() : "",
      };
    });

    return details;
  }

  /** Helper: scan current page for Google CDN image URLs */
  async _scanForImageUrls(maxPhotos) {
    return await this.page.evaluate((max) => {
      const imgUrls = new Set();

      // Scan all img elements
      const imgs = document.querySelectorAll("img");
      for (const img of imgs) {
        const src = img.src || img.getAttribute("data-src") || "";
        // Filter for Google's place photo CDN
        if (
          (src.includes("googleusercontent.com/p/") ||
            src.includes("ggpht.com/p/") ||
            src.includes("googleusercontent.com/gms/") ||
            src.includes("lh3.googleusercontent.com") ||
            src.includes("lh4.googleusercontent.com") ||
            src.includes("lh5.googleusercontent.com")) &&
          !src.includes("=s32") &&  // Skip tiny icons/avatars
          !src.includes("=s36") &&
          !src.includes("=s44") &&
          !src.includes("=w24") &&
          !src.includes("=w32") &&
          !src.includes("=w36")
        ) {
          // Modify URL to get higher resolution
          let highResUrl = src.split("=")[0] + "=w800-h600";
          imgUrls.add(highResUrl);
        }
      }

      // Check inline style attributes (targeted — NOT getComputedStyle on all elements)
      const styledEls = document.querySelectorAll('[style*="googleusercontent"]');
      for (const el of styledEls) {
        const style = el.getAttribute("style") || "";
        const match = style.match(/url\(["']?(https?:\/\/[^"')]+googleusercontent\.com\/p\/[^"')]+)/);
        if (match) {
          let url = match[1].split("=")[0] + "=w800-h600";
          imgUrls.add(url);
        }
      }

      return Array.from(imgUrls).slice(0, max);
    }, maxPhotos);
  }

  /** Extract photo URLs using network interception + DOM scanning + screenshot fallback */
  async extractPhotoUrls(placeName, placeDir, label) {
    try {
      // ─────────────────────────────────────────────────────────
      // PHASE 1: Check network-intercepted URLs (most reliable!)
      // These were captured automatically while the page loaded
      // ─────────────────────────────────────────────────────────
      let intercepted = this.getInterceptedUrls();
      if (intercepted.length > 0) {
        log("📸", `  Network intercepted: ${intercepted.length} image URLs`);
        return intercepted.slice(0, CONFIG.scraping.maxPhotosPerListing);
      }

      // ─────────────────────────────────────────────────────────
      // PHASE 2: DOM scanning for img src URLs
      // ─────────────────────────────────────────────────────────
      const domUrls = await this._scanForImageUrls(CONFIG.scraping.maxPhotosPerListing);
      if (domUrls.length > 0) {
        log("📸", `  DOM scan found: ${domUrls.length} image URLs`);
        return domUrls;
      }

      // ─────────────────────────────────────────────────────────
      // PHASE 3: Open gallery to trigger more image loads
      // ─────────────────────────────────────────────────────────
      const photoTriggers = [
        'button[aria-label*="foto"]',
        'button[aria-label*="photo"]',
        'button[aria-label*="Lihat foto"]',
        'button[aria-label*="See photos"]',
      ];

      let galleryOpened = false;
      for (const selector of photoTriggers) {
        try {
          const el = await this.page.$(selector);
          if (el) {
            await el.click();
            galleryOpened = true;
            log("📸", `  Opened gallery via: ${selector}`);
            break;
          }
        } catch {
          continue;
        }
      }

      if (galleryOpened) {
        // Wait for gallery images to load via network
        log("⏳", "  Waiting for gallery network responses...");
        await sleep(5000);

        // Check intercepted URLs again
        intercepted = this.getInterceptedUrls();
        if (intercepted.length > 0) {
          log("📸", `  Gallery loaded: ${intercepted.length} image URLs from network`);

          // Go back
          await this.page.keyboard.press("Escape");
          await sleep(1000);

          return intercepted.slice(0, CONFIG.scraping.maxPhotosPerListing);
        }

        // Fallback: DOM scan after gallery opened
        const galleryDomUrls = await this._scanForImageUrls(CONFIG.scraping.maxPhotosPerListing);
        
        // Go back
        await this.page.keyboard.press("Escape");
        await sleep(1000);

        if (galleryDomUrls.length > 0) {
          log("📸", `  Gallery DOM scan: ${galleryDomUrls.length} URLs`);
          return galleryDomUrls;
        }
      }

      // ─────────────────────────────────────────────────────────
      // PHASE 4: Screenshot fallback — crop the hero image area
      // ─────────────────────────────────────────────────────────
      log("📸", "  Trying screenshot fallback for hero image...");
      try {
        // Ensure we have a directory
        const dir = placeDir || path.join(CONFIG.output.baseDir, label, sanitizeFilename(placeName));
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }

        const screenshotPath = path.join(dir, `${sanitizeFilename(placeName)}_screenshot.jpg`);
        
        // Take a cropped screenshot of just the left panel (where the photo is)
        await this.page.screenshot({
          path: screenshotPath,
          clip: { x: 0, y: 50, width: 480, height: 250 },
          type: "jpeg",
          quality: 85,
        });

        // Check file is valid
        if (fs.existsSync(screenshotPath) && fs.statSync(screenshotPath).size > 5000) {
          log("💾", `  Screenshot saved as fallback: ${screenshotPath}`);
          return ["__SCREENSHOT__:" + screenshotPath];
        }
      } catch (err) {
        log("⚠️", `  Screenshot fallback failed: ${err.message}`);
      }

      return [];
    } catch (err) {
      log("⚠️", `  Error extracting photos: ${err.message}`);
      return [];
    }
  }

  /** Process a single listing: extract details + download photos */
  async processListing(listingLink, label, query, index) {
    const placeKey = listingLink.ariaLabel || listingLink.href;

    // Skip if already scraped
    if (this.metadata.scrapedPlaces[placeKey]) {
      log("⏭️", `  Skipping (already scraped): ${placeKey}`);
      this.stats.skipped++;
      return;
    }

    try {
      // Clear intercepted URLs before loading this listing
      this.clearInterceptedUrls();

      // Navigate to the listing
      log("📍", `  [${index + 1}] Opening: ${listingLink.ariaLabel || "..."}`);
      await this.page.goto(listingLink.href, {
        waitUntil: "domcontentloaded",
        timeout: CONFIG.scraping.navigationTimeout,
      });

      // Wait extra time for images to load via network
      await sleep(CONFIG.scraping.delayBetweenActions + 3000);

      // Extract place details
      const details = await this.extractPlaceDetails();
      log("📋", `  Place: ${details.name} | ${details.category} | ${details.rating}`);

      // Extract photo URLs
      // Create directory for this place
      const placeDirName = sanitizeFilename(`${details.name}_${details.rating}`);
      const placeDir = path.join(CONFIG.output.baseDir, label, placeDirName);
      if (!fs.existsSync(placeDir)) {
        fs.mkdirSync(placeDir, { recursive: true });
      }

      // Extract photo URLs (pass placeName for screenshot fallback)
      const photoUrls = await this.extractPhotoUrls(details.name, placeDir, label);
      log("📸", `  Found ${photoUrls.length} photos`);

      if (photoUrls.length === 0) {
        log("⚠️", `  No photos found for ${details.name}, skipping...`);
        // Mark as scraped so we don't retry
        this.metadata.scrapedPlaces[placeKey] = {
          name: details.name,
          query,
          label,
          photosDownloaded: 0,
          timestamp: new Date().toISOString(),
        };
        saveMetadata(this.metadata);
        return;
      }

      // Download photos
      let downloaded = 0;
      for (let i = 0; i < photoUrls.length; i++) {
        const url = photoUrls[i];

        // Handle screenshot fallback (already saved to disk)
        if (url.startsWith("__SCREENSHOT__:")) {
          downloaded++;
          this.stats.imagesDownloaded++;
          log("💾", `    Screenshot already saved as photo ${i + 1}`);
          continue;
        }

        const ext = "jpg";
        const filename = `${sanitizeFilename(details.name)}_${i + 1}.${ext}`;
        const filepath = path.join(placeDir, filename);

        // Skip if file already exists
        if (fs.existsSync(filepath)) {
          log("⏭️", `    Photo ${i + 1} already exists, skipping`);
          continue;
        }

        try {
          await downloadImage(url, filepath);
          downloaded++;
          this.stats.imagesDownloaded++;
          log("💾", `    Downloaded photo ${i + 1}/${photoUrls.length}: ${filename}`);
        } catch (err) {
          log("❌", `    Failed to download photo ${i + 1}: ${err.message}`);
          this.stats.errors++;
        }

        // Small delay between downloads
        await sleep(500);
      }

      // Save metadata for this place
      this.metadata.scrapedPlaces[placeKey] = {
        name: details.name,
        category: details.category,
        address: details.address,
        rating: details.rating,
        query,
        label,
        photoUrls,
        photosDownloaded: downloaded,
        directory: placeDir,
        timestamp: new Date().toISOString(),
      };
      this.metadata.totalImages += downloaded;
      saveMetadata(this.metadata);

      log("✅", `  Completed: ${details.name} (${downloaded} photos saved)`);
    } catch (err) {
      log("❌", `  Error processing listing: ${err.message}`);
      this.stats.errors++;
    }

    this.stats.listingsProcessed++;
  }

  /** Process a single search query */
  async processQuery(queryConfig, label) {
    const { query, area } = queryConfig;

    log("═".repeat(60), "");
    log("🔎", `QUERY: "${query}" [${label.toUpperCase()}] (Area: ${area})`);
    log("═".repeat(60), "");

    try {
      // Search
      await this.search(query);

      // Scroll to load all results
      await this.scrollResults();

      // Get all listing links
      const listings = await this.getListingLinks();
      const maxListings = Math.min(listings.length, CONFIG.scraping.maxListingsPerQuery);
      log("📊", `Found ${listings.length} listings, will process ${maxListings}`);

      // Collect all listing URLs upfront (so we don't need to re-scroll)
      const listingUrls = listings.slice(0, maxListings).map((l) => ({
        href: l.href,
        ariaLabel: l.ariaLabel,
      }));

      // Process each listing by direct navigation
      for (let i = 0; i < listingUrls.length; i++) {
        await this.processListing(listingUrls[i], label, query, i);
        await sleep(CONFIG.scraping.delayBetweenListings);
      }

      this.stats.queriesProcessed++;
    } catch (err) {
      log("❌", `Error processing query "${query}": ${err.message}`);
      await this.debugScreenshot("error_query_" + sanitizeFilename(query));
      this.stats.errors++;
    }

    await sleep(CONFIG.scraping.delayBetweenQueries);
  }

  /** Print current statistics */
  printStats() {
    console.log("\n" + "═".repeat(60));
    console.log("📊 SCRAPING STATISTICS");
    console.log("═".repeat(60));
    console.log(`   Queries processed:  ${this.stats.queriesProcessed}`);
    console.log(`   Listings processed: ${this.stats.listingsProcessed}`);
    console.log(`   Images downloaded:  ${this.stats.imagesDownloaded}`);
    console.log(`   Skipped (cached):   ${this.stats.skipped}`);
    console.log(`   Errors:             ${this.stats.errors}`);
    console.log(`   Total images (all): ${this.metadata.totalImages}`);
    console.log("═".repeat(60) + "\n");
  }

  /** Main run method */
  async run(targetLabel = null, customQuery = null) {
    try {
      await this.init();
      await this.goToMaps();

      // Determine which queries to run
      let queriesToRun = [];

      if (customQuery && targetLabel) {
        // Single custom query
        queriesToRun.push({
          label: targetLabel,
          queries: [{ query: customQuery, area: "Custom" }],
        });
      } else if (targetLabel) {
        // Run all queries for specific label
        queriesToRun.push({
          label: targetLabel,
          queries: CONFIG.queries[targetLabel] || [],
        });
      } else {
        // Run all queries for all labels
        queriesToRun.push({
          label: "potensial",
          queries: CONFIG.queries.potensial,
        });
        queriesToRun.push({
          label: "non_potensial",
          queries: CONFIG.queries.non_potensial,
        });
      }

      // Process each group
      for (const group of queriesToRun) {
        log("🏷️", `\nStarting label: ${group.label.toUpperCase()}`);
        log("📝", `Total queries: ${group.queries.length}\n`);

        for (let i = 0; i < group.queries.length; i++) {
          log("📈", `Progress: Query ${i + 1}/${group.queries.length}`);
          await this.processQuery(group.queries[i], group.label);
        }
      }

      // Save final session info
      this.metadata.sessions.push({
        date: new Date().toISOString(),
        targetLabel,
        customQuery,
        stats: { ...this.stats },
      });
      saveMetadata(this.metadata);

      this.printStats();
      log("🎉", "Scraping completed!");
    } catch (err) {
      log("💥", `Fatal error: ${err.message}`);
      console.error(err);
    } finally {
      if (this.browser) {
        await this.browser.close();
        log("🔒", "Browser closed");
      }
    }
  }
}

// ============================================================
// CLI ENTRY POINT
// ============================================================

async function main() {
  const args = process.argv.slice(2);
  let targetLabel = null;
  let customQuery = null;

  // Parse CLI arguments
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--label" && args[i + 1]) {
      targetLabel = args[i + 1];
      i++;
    }
    if (args[i] === "--query" && args[i + 1]) {
      customQuery = args[i + 1];
      i++;
    }
  }

  // Validate label
  if (targetLabel && !["potensial", "non_potensial"].includes(targetLabel)) {
    console.error('❌ Invalid label. Use "potensial" or "non_potensial"');
    process.exit(1);
  }

  // If custom query provided, label is required
  if (customQuery && !targetLabel) {
    console.error("❌ When using --query, you must also specify --label");
    process.exit(1);
  }

  console.log("\n" + "═".repeat(60));
  console.log("  🏦 BNI Canvas Pro — Google Maps Image Scraper");
  console.log("  📁 Dataset builder for store classification model");
  console.log("═".repeat(60));
  console.log(`  Label:  ${targetLabel || "ALL"}`);
  console.log(`  Query:  ${customQuery || "From config.js"}`);
  console.log(`  Output: ${path.resolve(CONFIG.output.baseDir)}`);
  console.log("═".repeat(60) + "\n");

  const scraper = new GMapsImageScraper();
  await scraper.run(targetLabel, customQuery);
}

main().catch(console.error);
