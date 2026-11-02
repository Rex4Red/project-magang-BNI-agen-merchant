# Auto-deploy VPS

VPS memeriksa branch `main` setiap satu menit menggunakan systemd timer.
Tidak perlu menambahkan token SSH ke GitHub atau membuka endpoint webhook.
Repository GitHub harus dapat dibaca VPS; repository saat ini bersifat publik.

## Alur deployment

1. Ambil commit `main` terbaru. Tolak deployment jika source di VPS memiliki perubahan tracked yang belum disimpan.
2. Ekstrak commit ke folder rilis terpisah, jalankan `npm ci` dan `npm run build` menggunakan lokasi database sementara. Sambungkan data produksi setelah build selesai.
3. Periksa Chromium, model TensorFlow, halaman login, dan API sesi. Pemeriksaan kandidat memakai database sementara.
4. Backup SQLite produksi, ganti rilis aktif, lalu restart `bni-webapp.service`.
5. Pastikan proses berasal dari rilis baru dan aplikasi merespons. Jika gagal, jalankan kembali rilis sebelumnya.

Database, foto, dan `.env.local` tetap berada pada folder proyek awal dan dibagikan ke setiap rilis.
Environment Python yang sudah terpasang tetap digunakan. Perubahan dependensi Python memerlukan pembaruan environment tersebut.
Tiga rilis terbaru serta rilis aktif/sebelumnya dipertahankan. Commit yang gagal tidak dibangun berulang kali sampai ada commit baru atau retry manual.
Backup database disimpan di `webapp/data/backups` dan tidak dihapus oleh pembersihan rilis.

## Pemasangan

Jalankan sebagai user aplikasi yang memiliki akses `sudo` tanpa prompt. Prasyarat: Python 3.12+, Node.js 24, Git, systemd, runtime Python model, dan service `bni-webapp.service` yang sudah berfungsi.

```sh
cd /data/home/apps/bni
python3 deploy/vps/install.py --enable
```

Installer mempertahankan konfigurasi environment service yang sudah ada. Ia hanya menambahkan override direktori rilis dan perintah startup.
Instalasi tidak me-restart aplikasi; pergantian terjadi setelah rilis baru lolos pemeriksaan.
Direktori default status/rilis adalah `/data/home/apps/bni-deploy`, di luar working tree Git.
Jika engine deployment diperbarui, jalankan installer kembali untuk memperbarui salinan yang dipakai systemd.

## Status dan log

```sh
systemctl status bni-auto-deploy.timer
systemctl status bni-auto-deploy.service
journalctl -u bni-auto-deploy.service -n 100 --no-pager
cat /data/home/apps/bni-deploy/status.json
```

`deployed_sha` pada status menunjukkan commit yang benar-benar aktif. Status service oneshot menjadi `inactive` setelah pemeriksaan selesai; timer tetap aktif.
Perubahan terlihat setelah jeda pemeriksaan maksimal sekitar satu menit, ditambah waktu install/build.
Restart singkat memutus proses pencarian yang masih tersimpan di memori, sehingga pencarian tersebut perlu diulang.

Untuk memeriksa sekarang:

```sh
sudo systemctl start bni-auto-deploy.service
```

Untuk mengulang commit yang gagal setelah penyebabnya diperbaiki:

```sh
python3 /usr/local/lib/bni-deploy/deploy.py --config /data/home/apps/bni-deploy/config.json --retry
```

Untuk menghentikan pembaruan otomatis:

```sh
sudo systemctl disable --now bni-auto-deploy.timer
```

Database tidak dikembalikan ke backup saat rollback kode. Perubahan skema database yang tidak kompatibel dengan versi lama harus direncanakan terpisah.
