This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Klasifikasi toko

Halaman pencarian menjalankan job di `GET /api/v1/search`, lalu mengambil progresnya lewat
parameter `job`. Nama dan kategori yang jelas diperiksa lebih dulu; hanya foto toko yang
masih ambigu diproses oleh `../scraper/classify_batch.py`. `POST /api/v1/classify` juga
tersedia untuk klasifikasi batch. Model aktif adalah `../scraper/trained_model_v3` jika berkas
`approved.json` ada; jika tidak, model lama di `../scraper/trained_model` dipakai.

Pencarian area menjalankan seluruh kata kunci pada setiap titik grid dengan tiga halaman
Google Maps paralel dalam satu browser. Foto yang belum dimuat ditelusuri hanya untuk toko
yang lolos batas area dan aturan jenis usaha; foto toko yang sama dipakai ulang selama job
berjalan. Hasil sementara tersedia saat penelusuran berlangsung, dengan ID toko tetap agar
pembaruan tidak membuat duplikasi. Penyimpanan daftar dibuka setelah job selesai. Optimasi
ini tidak mengubah ambang model, jumlah titik grid, atau batas polygon pencarian.

Progres pencarian agen dimiliki oleh layout dashboard melalui `AgentSearchProvider`.
Pindah ke Kunjungan, Ringkasan, atau halaman dashboard lainnya tetap melanjutkan polling
job yang sama. Nama daerah, polygon, posisi peta, hasil, dan pilihan toko dipertahankan
ketika kembali. `sessionStorage` menyimpan sesi per akun pada tab browser yang sama agar
muat ulang halaman dapat melanjutkan job aktif. Jika job telah kedaluwarsa atau server
dimulai ulang, halaman menampilkan kesalahan dan membuka pencarian ulang tanpa memulai
job baru secara otomatis.

Hasil akhir mengikuti jenis usaha yang jelas pada nama atau kategori Google Maps. Aturannya
ada di `src/lib/business-taxonomy.json`: sembako, kelontong, swalayan, dan minimarket termasuk
potensial, termasuk jika tidak ada foto. Tekstil, pakaian, elektronik, usaha siap saji,
kos/pondokan, dan jasa di luar target disaring dari pencarian agen.
Indomaret, Alfamart, Superindo, Circle K, dan Alfamidi juga dikecualikan, termasuk variasi penulisan
seperti "Super Indo". Pengecualian merek berlaku sebelum aturan kategori minimarket/swalayan.
Toko yang jenis usahanya belum jelas tidak otomatis menjadi potensial meskipun model foto
memberi skor tinggi; statusnya **Perlu verifikasi jenis usaha**. Skor di antara batas negatif
dan positif masuk **Perlu ditinjau: model belum yakin**, bukan otomatis negatif karena
belum melewati ambang positif. Toko ambigu tanpa foto dan foto yang gagal dibaca juga
ditandai tersendiri. Angka confidence dari model adalah skor
klasifikasi foto, bukan peluang bisnis toko.

Dataset hasil kurasi dan pembagian berdasarkan toko dibuat dengan
`../scraper/prepare_dataset_v2.py`. Skrip `train_model_v2.py`, `fine_tune_model_v3.py`, dan
`evaluate_thresholds.py` menyimpan kandidat dan evaluasi tanpa menimpa model lama. Evaluasi
model v3 saat ini bersifat indikatif: model v3 diturunkan dari bobot model lama, sehingga
sebagian foto pada set evaluasi yang baru mungkin pernah dilihat model lama. Untuk mengukur
akurasi sebenarnya, kumpulkan set uji baru dari toko yang sama sekali belum masuk pelatihan.

Jalankan webapp dari folder `webapp` di dalam struktur proyek ini. Python pada `PATH` harus
memiliki TensorFlow, NumPy, dan Pillow. Jika perlu, set `BNI_PYTHON_EXECUTABLE` ke path
Python yang memiliki dependensi tersebut. Proses klasifikasi membutuhkan akses server ke
foto Google Maps dan dapat menambah waktu pencarian. Endpoint ini memerlukan runtime Node.js
dan akses lokal ke folder `scraper` beserta modelnya saat deployment.

## Catat kunjungan dan ekspor Excel

Form kunjungan agen dan merchant mengikuti 19 kolom pada sheet **Toko_Jenengan dan Krodan**
dari template: No, Nama Usaha, kategori, Alamat, Nama PIC, No telp, Gmaps, Produk, LJK,
Potensi, Follow up, Catatan, Tindak Lanjut, Foto Kunjungan, Hasil Prospek, Latitude,
Longitude, Area Kunjungan, dan ID Usaha. Semua isian tetap opsional.

Produk dan LJK dapat diisi dari penyedia Agen/QRIS/EDC atau diedit langsung. Potensi adalah
catatan peluang produk dari kunjungan. Follow up mencatat perkembangan; Tindak Lanjut
memakai kolom yang sama dengan catatan Tindak Lanjut pada data lama. ID Usaha dibuat
otomatis dengan format `USH-001` dan tetap dipertahankan saat data diperbarui.

Di halaman Kunjungan, **Ekspor daftar ini** mengunduh daftar aktif sebagai `.xlsx`.
**Ekspor semua daftar** membuat satu sheet untuk setiap daftar. Nama sheet mengikuti
area kunjungan, dengan awalan `Toko_`. Foto kunjungan disertakan sebagai gambar pada
kolom Foto Kunjungan, nomor telepon disimpan sebagai teks agar angka nol awal tetap ada,
dan koordinat disimpan sebagai angka. Ekspor diproses di browser menggunakan ExcelJS.
Data kunjungan masih tersimpan di browser untuk akun dan role yang sedang masuk.

Kolom pilihan pada **Catat kunjungan** menampilkan semua opsi saat kolom atau tombol
panahnya diklik, termasuk saat sudah berisi nilai. Ini berlaku untuk Kategori, Produk,
Penyedia agen, penyedia QRIS, bank EDC, Potensi, Tindak Lanjut, dan Hasil Prospek.
Nilai custom tetap dapat diketik, dan semua kolom tetap opsional. Gunakan tombol
panah atas/bawah dan Enter untuk memilih, atau Esc untuk menutup daftar pilihan.

Tombol **Hapus toko** pada setiap baris menampilkan popup konfirmasi di dalam aplikasi
dengan nama toko dan daftar tujuan. **Batal**, tombol Esc, atau klik di luar popup menutup
konfirmasi tanpa menghapus data. Setelah dikonfirmasi, toko beserta catatan dan foto
kunjungannya dihapus dari daftar aktif. Jumlah kunjungan dan ekspor mengikuti
data yang tersisa. Jika seluruh toko dihapus, daftar daerah tetap tersedia untuk penambahan
toko berikutnya. Daftar lain dan data akun lain tidak berubah.

### Peta kunjungan

Halaman Kunjungan untuk agen dan merchant memiliki pilihan **Daftar toko** dan
**Peta kunjungan**. Peta mengambil toko berstatus **Sudah dikunjungi** dari daftar
tersimpan akun yang sedang masuk, dengan filter semua daftar atau satu daftar.
Titik menggunakan koordinat yang tersimpan pada toko. Toko dengan koordinat kosong,
tidak valid, atau `0,0` tetap bisa dipilih dari daftar pada tampilan peta untuk mengambil
lokasi melalui **Catat kunjungan**, tetapi tidak diberi titik perkiraan.

Klik titik atau nama toko untuk melihat alamat, PIC, nomor telepon, area, Produk/LJK,
status dan penyedia Agen/QRIS/EDC, potensi, hasil prospek, follow up, tindak lanjut, catatan, dan foto kunjungan yang sudah
diisi. Foto bisa diperbesar, dan catatan bisa diedit dari tampilan peta. Perubahan data
tersimpan langsung memperbarui titik dan informasinya; perubahan status menjadi
**Belum dikunjungi** mengeluarkan toko dari peta. Peta dimuat saat tampilan ini dibuka,
menggunakan Leaflet yang dibundel aplikasi dan ubin OpenStreetMap.

### Laporan visual dan insight

Menu **Laporan** tersedia untuk agen (`/dashboard/reports`) dan merchant
(`/merchant/reports`). Laporan otomatis mengambil catatan berstatus **Sudah dikunjungi**
dari akun yang sedang masuk. Penyimpanan kunjungan memperbarui laporan tanpa impor manual.
Data agen dan merchant tetap memakai penyimpanan terpisah di browser; laporan tidak
menyinkronkan data antarperangkat.

Susunan analisis mengikuti contoh `Insight MAP.pbix`: total usaha dikunjungi, Closing,
perlu tindak lanjut, grafik kategori usaha, proporsi status tindak lanjut, hasil prospek,
peta persebaran, dan tabel catatan. Filter area, kategori, dan status diterapkan pada
semua tampilan, insight, serta **Ekspor data laporan**. Grafik kategori dan legenda status
juga dapat diklik untuk memfilter. Grafik menampilkan delapan kelompok teratas, dengan
tombol untuk melihat seluruh kelompok; tabel menggunakan halaman berisi 15 catatan.

Ringkasan memakai warna status dan indikator proporsi. Grafik batang menggunakan skala
persentase yang sama (0–100% dari data yang ditampilkan). Donat menampilkan rincian status
saat disorot dengan pointer atau fokus keyboard; klik segmen atau legenda untuk memfilter.
Panel grafik dan insight menyesuaikan tinggi konten, lalu ditumpuk pada layar HP.

Status Closing berasal dari isian Potensi/Tindak Lanjut "Closing" atau Hasil Prospek
"Closing", "Berhasil menjadi agen", "Berhasil menjadi merchant", atau "Berhasil mendaftar".
Kepemilikan Agen/QRIS/EDC saja tidak dihitung sebagai Closing. Tindak Lanjut yang terisi
selain Closing/tanpa tindak lanjut, atau hasil yang masih memerlukan proses, dihitung
sebagai perlu tindak lanjut. Catatan tanpa rencana tindak lanjut dan hasil penolakan
masuk tidak ada tindak lanjut. Informasi yang belum cukup masuk **Belum ditentukan**.
Aturan lengkap dapat dibuka dari bagian **Aturan perhitungan laporan**.

Insight menghitung hasil kunjungan, kategori terbanyak, persebaran area, ketersediaan
nomor telepon untuk tindak lanjut, dan data yang belum lengkap. Angka mengikuti filter;
tidak ada klaim tren atau perbandingan periode karena tanggal kunjungan tidak dicatat.
Toko tanpa koordinat valid tetap masuk grafik dan tabel, tetapi tidak diberi titik peta.
Warna titik menunjukkan status tindak lanjut; klik titik untuk melihat dan mengedit
catatan. Setiap catatan dihitung sekali per daftar, termasuk jika toko yang sama ada
di beberapa daftar.

Ekspor memakai format Excel 19 kolom yang sudah digunakan, dengan hanya catatan
kunjungan yang sesuai filter. Grafik dan insight dibuat langsung di aplikasi web;
tidak membutuhkan Power BI Desktop maupun publikasi report Power BI.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
