# Pengembangan Sistem Canvasing BNI

Panduan penggunaan, akun, impor, backup/reset database, pengujian, dan hosting ada di [README utama](../README.md).

Ruang kerja aktif menggunakan modul merchant dengan Ringkasan dari dashboard. Akun aktif adalah admin dan canvaser; keduanya mengakses daftar bersama milik `canvaser`. URL `/dashboard` versi lama diarahkan ke Ringkasan BNI. Modul klasifikasi dan pembaca impor agen lama dipertahankan untuk kompatibilitas kode, dan tidak ditampilkan dalam navigasi aktif.

SQLite menyimpan daftar, foto/catatan dalam JSON kunjungan, waktu kunjungan server, hash password, dan sesi. Gunakan Node.js 24 untuk SQLite native. Fallback sql.js tetap disertakan; setelah export, foreign key diaktifkan kembali agar penghapusan berantai tetap berlaku.

- `src/lib/server/database.ts`: akun, sesi, koneksi SQLite.
- `src/lib/server/visit-store.ts`: transaksi kunjungan, daftar, duplikat, dan waktu kunjungan.
- `src/lib/server/list-access.ts`: password daftar dan grant perangkat.
- `src/app/api/v1/visits/route.ts`: otorisasi; perubahan nama/password dan hapus daftar hanya untuk admin.
- `src/lib/store-identity.ts`: pencocokan toko lintas daftar.
- `src/lib/visit-excel-import.ts`: pembaca Excel/CSV, deteksi header, dan pemetaan kolom.
- `src/components/AdminListManager.tsx`: pengelolaan daftar admin.

Tes API memerlukan hasil `npm run build` terbaru dan menjalankan server dengan database sementara. Jangan menjalankan reset pada server aktif, terutama saat memakai fallback sql.js yang memuat database ke memori.
