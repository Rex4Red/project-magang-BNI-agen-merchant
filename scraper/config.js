/**
 * config.js — Konfigurasi search queries untuk scraping Google Maps
 * 
 * POTENSIAL: toko yang cocok jadi agen BNI (kelontong, warung, minimarket)
 * NON_POTENSIAL: toko yang tidak cocok (salon, bengkel, restoran, dll)
 */

const CONFIG = {
  // ============================================================
  // SEARCH QUERIES
  // ============================================================
  queries: {
    potensial: [
      // Toko Kelontong
      { query: "toko kelontong di Seturan, Sleman", area: "Seturan" },
      { query: "toko kelontong di Condongcatur, Sleman", area: "Condongcatur" },
      { query: "toko kelontong di Mlati, Sleman", area: "Mlati" },
      { query: "toko kelontong di Bantul", area: "Bantul" },

      // Warung Sembako
      { query: "warung sembako di Seturan, Sleman", area: "Seturan" },
      { query: "warung sembako di Condongcatur, Sleman", area: "Condongcatur" },
      { query: "warung sembako di Mlati, Sleman", area: "Mlati" },
      { query: "toko sembako di Bantul", area: "Bantul" },

      // Minimarket / Kios
      { query: "minimarket di Seturan, Sleman", area: "Seturan" },
      { query: "kios di Sleman", area: "Sleman" },
      { query: "toko di Seturan, Sleman", area: "Seturan" },
      { query: "toko di Depok, Sleman", area: "Depok" },

      // Variasi kota lain (untuk diversitas dataset)
      { query: "toko kelontong di Malioboro, Yogyakarta", area: "Malioboro" },
      { query: "warung sembako di Kotagede, Yogyakarta", area: "Kotagede" },
      { query: "toko kelontong di Surabaya", area: "Surabaya" },
      { query: "warung sembako di Bandung", area: "Bandung" },
    ],

    non_potensial: [
      // Salon
      { query: "salon di Seturan, Sleman", area: "Seturan" },
      { query: "salon kecantikan di Sleman", area: "Sleman" },

      // Bengkel
      { query: "bengkel motor di Seturan, Sleman", area: "Seturan" },
      { query: "bengkel mobil di Sleman", area: "Sleman" },

      // Restoran & Cafe
      { query: "restoran di Seturan, Sleman", area: "Seturan" },
      { query: "cafe di Seturan, Sleman", area: "Seturan" },

      // Lainnya
      { query: "apotek di Sleman", area: "Sleman" },
      { query: "laundry di Seturan, Sleman", area: "Seturan" },
      { query: "klinik di Sleman", area: "Sleman" },
      { query: "gym fitness di Sleman", area: "Sleman" },
      { query: "hotel di Sleman", area: "Sleman" },
      { query: "pet shop di Yogyakarta", area: "Yogyakarta" },
    ],
  },

  // ============================================================
  // SCRAPING SETTINGS
  // ============================================================
  scraping: {
    // Jumlah maksimal listing yang di-scrape per query
    maxListingsPerQuery: 15,

    // Jumlah maksimal foto yang diambil per listing
    maxPhotosPerListing: 5,

    // Delay (ms) antara aksi — untuk hindari deteksi bot
    delayBetweenActions: 2000,     // 2 detik antara klik
    delayBetweenListings: 3000,    // 3 detik antara listing
    delayBetweenQueries: 5000,     // 5 detik antara query
    delayBetweenScrolls: 1500,     // 1.5 detik antara scroll

    // Scroll settings
    maxScrollAttempts: 10,         // Max scroll untuk load semua hasil

    // Timeout
    navigationTimeout: 30000,      // 30 detik timeout navigasi
    waitForSelectorTimeout: 10000, // 10 detik tunggu element

    // Browser settings
    headless: false,               // false = tampilkan browser (untuk debug)
    windowWidth: 1366,
    windowHeight: 768,
  },

  // ============================================================
  // OUTPUT SETTINGS
  // ============================================================
  output: {
    baseDir: "./dataset",
    // Metadata file untuk tracking progress
    metadataFile: "./dataset/scrape_metadata.json",
  },
};

module.exports = CONFIG;
