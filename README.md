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

## Akses publik dari laptop Windows

Dari folder utama project, jalankan PowerShell:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\Start-Online.ps1
```

Script membuat build produksi, menjalankan server di `127.0.0.1:3001`, lalu membuka Cloudflare Quick Tunnel. Tautan HTTPS yang muncul bisa dibuka dari perangkat lain melalui internet. `cloudflared` diunduh dari release resmi jika belum tersedia. Server dan tunnel berjalan di background. Laptop harus tetap aktif, tersambung internet, dan tidak sleep.

Untuk menghentikan:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\Stop-Online.ps1
```

Untuk memakai build yang sudah tersedia tanpa membangun ulang, tambahkan `-SkipBuild`. Setelah perubahan kode, jalankan kembali tanpa parameter tersebut. Tautan sementara dapat berubah saat tunnel dinyalakan ulang. Tautan tersimpan di `.online-runtime/public-url.txt`; log proses berada di folder yang sama. Folder ini serta `.local-tools` tidak masuk Git.

Quick Tunnel digunakan untuk demo, tanpa jaminan ketersediaan. Login aplikasi masih akun demo, belum autentikasi server. Data kunjungan tetap tersimpan per browser dan alamat website, sehingga belum bisa dibagikan antarperangkat.

Pencarian merchant serta pencarian dan klasifikasi agen berjalan sebagai tugas di background: server langsung mengirim ID pencarian, kemudian browser mengecek progres sampai selesai. Progres dan hasil disimpan sementara di memori server (hasil selesai tersedia selama 30 menit); restart server menghapus tugas tersebut. Setiap workspace memproses satu tugas pada satu waktu, dengan maksimal empat tugas yang belum selesai agar penggunaan browser scraper tidak berlebihan. Pada agen, kegagalan model tidak menghapus hasil pencarian; toko yang terdampak ditandai sebagai klasifikasi gagal.

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
