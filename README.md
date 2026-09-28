# BNI Agen & Merchant

Aplikasi canvasing untuk workspace agen dan merchant, menggunakan Next.js dan Leaflet.

## Menjalankan aplikasi

Prasyarat: Node.js yang kompatibel dengan Next.js 16 (minimal 20.9), npm, dan Python 3.12 untuk klasifikasi agen.

```sh
cd webapp
npm ci
npm run dev
```

Buka http://localhost:3000.

Untuk model klasifikasi agen, pasang dependensi pada Python yang digunakan server:

```sh
python -m pip install tensorflow numpy pillow
```

Jika Python tidak tersedia pada PATH, atur `BNI_PYTHON_EXECUTABLE` di `webapp/.env.local`.
Model aktif berada di `scraper/trained_model_v3`. Source dan bobot model versi sebelumnya juga disertakan.
Petunjuk klasifikasi lebih lanjut ada di [webapp/README.md](webapp/README.md).

## Akun demo lokal

| Workspace | Username | Password |
| --- | --- | --- |
| Agen | agen | agen123 |
| Merchant | merchant | merchant123 |

Login saat ini untuk prototipe lokal, belum autentikasi produksi. Data kunjungan dan foto disimpan di localStorage browser sesuai akun; belum tersinkron antarperangkat dan tidak ikut dalam repository ini.

## Fitur saat ini

- Agen: pencarian berdasarkan nama daerah atau area gambar di peta, klasifikasi toko, simpan daftar canvasing.
- Merchant: gambar jalur, pencarian merchant di sepanjang jalur, daftar kunjungan terpisah.
- Catatan kunjungan, lokasi, kontak, QRIS beberapa penyedia, EDC beberapa bank untuk merchant, dan foto yang bisa diperbesar.
- Pencarian memerlukan koneksi internet dan bergantung pada hasil Google Maps; kelengkapan hasil tidak dijamin.

Dataset foto, konfigurasi lokal, node_modules, dan hasil build tidak disertakan. Fitur laporan/export dan sinkronisasi masih dalam pengembangan.
