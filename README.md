# Sistem Canvasing BNI

Satu ruang kerja canvasing BNI berbasis Next.js dan SQLite. Menu utamanya **Ringkasan**, **Eksplorasi toko**, **Kunjungan**, dan **Laporan**. Ringkasan mengikuti tampilan dashboard sebelumnya; pencarian, kunjungan, dan laporan menggunakan alur merchant.

## Menjalankan

Gunakan Node.js 24 dan npm:

```sh
cd webapp
npm ci
npm run dev
```

Buka http://localhost:3000. Build produksi: `npm run build`, kemudian `npm start`.

| Akun | Username | Password awal |
| --- | --- | --- |
| Admin | admin | admin123 |
| Canvaser | canvaser | canvaser123 |

Akun agen dan merchant lama tidak dapat login. Admin dan canvaser menggunakan daftar bersama pada ruang kerja BNI. Password akun yang sudah ada tidak diubah saat pembaruan.

## Daftar dan akses

- Cari toko berdasarkan daerah, area peta, atau ruas jalan, lalu simpan pilihan sebagai daftar kunjungan.
- Password daftar bersifat opsional. Admin bisa menyiapkan daftar terlebih dahulu, kemudian memasang password saat siap dibagikan.
- Di header, admin memilih **Kelola daftar** untuk rename, memasang/mengganti/menghapus password, atau menghapus daftar beserta seluruh toko, catatan, dan fotonya.
- Admin selalu dapat melihat seluruh daftar. Canvaser membuka daftar berpassword untuk memperoleh akses selama 15 menit pada perangkat tersebut.
- Perubahan password membatalkan akses daftar yang sebelumnya terbuka pada perangkat canvaser.
- Hasil pencarian memberi keterangan nama daftar yang sudah menyimpan toko. Duplikat juga diperiksa kembali di server ketika menyimpan dan mengimpor, termasuk pada daftar terkunci.
- Pencocokan menggunakan ID tempat Google Maps jika tersedia, atau nama dan lokasi/alamat. Toko dengan nama sama pada lokasi berbeda tetap dapat disimpan. Hasil pencarian yang tidak lengkap dapat membatasi pencocokan.

## Catat kunjungan

Saat formulir dibuka, status awalnya **Sudah dikunjungi**; ubah ke **Belum dikunjungi** jika hanya menyiapkan data. Server mencatat `visitedAt` ketika kunjungan pertama disimpan. Penyuntingan berikutnya mempertahankan waktu awal dan memperbarui `updatedAt`.

Waktu disimpan dalam ISO UTC di database, ditampilkan sebagai hari, tanggal, dan jam WIB di aplikasi, serta disertakan dalam ekspor Excel. Kunjungan impor tanpa waktu asli tidak diberi waktu kunjungan buatan.

Formulir meliputi QRIS, EDC, status KUR/BWU, potensi KUR/BWU, tindak lanjut, hasil prospek, lokasi, PIC, catatan, dan maksimal tiga foto.

## Impor tanpa template tetap

Di **Kunjungan** atau **Laporan**, pilih **Impor data**. File `.xlsx`, `.xls`, dan `.csv` didukung, maksimal 15 MB dan 10.000 toko per impor.

1. Pilih file dan sheet.
2. Periksa baris judul dan pemetaan kolom. Nama seperti Nama Toko, Nama Usaha, Address, Daerah, dan Google Maps dikenali otomatis. Jika judul berada pada baris lain, ubah barisnya lalu tekan **Baca ulang judul**.
3. **Nama Usaha** wajib dipetakan. Kolom lain opsional; area kosong memakai area pilihan atau nama sheet.
4. Tentukan status jika file tidak memiliki status, lalu buat pratinjau.
5. Periksa pratinjau dan tekan **Simpan impor**. Setiap area menjadi daftar terpisah; pilih sheet lain untuk impor berikutnya.

Foto XLSX pada kolom Foto Kunjungan yang dikenali ikut dibaca. Untuk waktu kunjungan, gunakan tanggal Excel atau ISO dengan zona waktu, misalnya `2026-11-03T09:30:00+07:00`. Duplikat dilewati tanpa menimpa catatan tersimpan. Migrasi otomatis dari penyimpanan browser versi lama dinonaktifkan agar database yang dikosongkan tetap kosong.

## Database dan cadangan

Database lokal berada di `webapp/data/canvasing.sqlite`, atau path `BNI_DATABASE_PATH` pada `.env.local`. Data dan backup tidak masuk Git.

Dari folder `webapp`:

```sh
npm run db:status
npm run db:backup
```

Untuk mengosongkan data, hentikan server dahulu:

```sh
npm run db:reset -- --confirm
```

Reset membuat cadangan `data/backups/before-bni-reset-*.sqlite` terlebih dahulu, menghapus semua daftar/kunjungan/foto/sesi serta akun agen dan merchant, lalu mempertahankan akun admin dan canvaser beserta passwordnya. Jalankan aplikasi lagi setelah reset. Reset berlaku hanya pada database yang dituju; database VPS terpisah memerlukan langkah yang sama di VPS.

## Pengujian

```sh
cd webapp
npm run lint
npm run test:list-access
npm run test:agent-import
npm run build
npm run test:list-access-http
```

Tes menggunakan database sementara. Tes kompatibilitas impor lama menggunakan akun fixture yang hanya dibuat di database pengujian.

## Hosting

Panduan auto-deploy VPS ada di [deploy/vps/README.md](deploy/vps/README.md). Untuk demo dari laptop Windows, jalankan `Start-Online.ps1` dari folder utama; hentikan dengan `Stop-Online.ps1`. Laptop harus tetap aktif dan tersambung internet. Quick Tunnel dapat berganti alamat ketika dinyalakan ulang.

Pencarian memerlukan internet dan bergantung pada hasil Google Maps. Tugas pencarian berjalan di background dan hasilnya tersedia sementara di memori server. Restart server membatalkan tugas pencarian yang belum disimpan.
