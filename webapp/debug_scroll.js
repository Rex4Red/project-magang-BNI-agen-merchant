const puppeteer = require("puppeteer-extra");
const S = require("puppeteer-extra-plugin-stealth");
puppeteer.use(S());

(async () => {
  const b = await puppeteer.launch({ headless: false });
  const p = await b.newPage();
  await p.setViewport({ width: 1280, height: 900 });
  
  await p.goto(
    "https://www.google.com/maps/search/toko+di+seturan/@-7.7713,110.3771,15z",
    { waitUntil: "domcontentloaded", timeout: 30000 }
  );
  
  await new Promise((r) => setTimeout(r, 5000));

  const count1 = await p.evaluate(
    () => document.querySelectorAll('a[href*="/maps/place/"]').length
  );
  console.log("Before scroll:", count1, "links");

  // Try to find scrollable container
  const scrollInfo = await p.evaluate(() => {
    const candidates = [
      document.querySelector('.m6QErb.DxyBCb'),
      document.querySelector('[role="feed"]')?.parentElement,
      document.querySelector('[role="feed"]'),
    ];
    return candidates.map((el, i) => ({
      index: i,
      found: !!el,
      className: el?.className || "N/A",
      scrollHeight: el?.scrollHeight || 0,
      childCount: el?.children?.length || 0,
    }));
  });
  console.log("Scrollable candidates:", JSON.stringify(scrollInfo, null, 2));

  // Try scrolling each candidate
  for (let i = 0; i < 8; i++) {
    await p.evaluate(() => {
      const candidates = [
        document.querySelector('.m6QErb.DxyBCb'),
        document.querySelector('[role="feed"]')?.parentElement,
        document.querySelector('[role="feed"]'),
      ];
      for (const el of candidates) {
        if (el && el.scrollHeight > el.clientHeight) {
          el.scrollTop = el.scrollHeight;
          break;
        }
      }
    });
    await new Promise((r) => setTimeout(r, 2000));
    const c = await p.evaluate(
      () => document.querySelectorAll('a[href*="/maps/place/"]').length
    );
    console.log("After scroll", i + 1, ":", c, "links");
  }

  await b.close();
})();
