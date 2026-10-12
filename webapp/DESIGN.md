# DESIGN.md: BNI Agen & Merchant

## 1. Brief untuk Stitch

Rancang ulang tampilan aplikasi canvasing BNI untuk pengguna agen dan merchant. Arah desain yang diminta pemilik: **profesional, minimalis, netral, dan tetap menarik**. Gunakan dokumen ini sebagai acuan seluruh layar.

Aplikasi digunakan untuk mencari usaha di peta, menyimpan daftar toko, mencatat kunjungan lapangan, dan membaca laporan. Pengguna perlu menemukan tombol, melihat hasil, serta mengisi data dengan cepat dari laptop maupun HP.

Bahasa antarmuka: Bahasa Indonesia. Pertahankan fitur dan pemisahan akun yang sudah ada. Perombakan berfokus pada tampilan, hierarki informasi, dan kemudahan interaksi.

### Karakter visual

- Dasar putih dan abu-abu netral, teks arang, serta satu aksen oranye BNI yang terkendali.
- Tampilan aplikasi operasional dengan tipografi jelas, garis pemisah halus, dan ruang yang cukup untuk konten.
- Daya tarik berasal dari komposisi peta, grafik yang terbaca, alignment, dan detail interaksi.
- Judul singkat, informasi langsung, serta tombol yang menyebut tindakan sebenarnya.
- Tema utama terang untuk pekerjaan lapangan dan pengisian formulir. Desain ini tidak membutuhkan tombol ganti tema.

Kalibrasi: kepadatan 5/10, variasi komposisi 3/10, gerak 2/10.
Dial: ENERGY 1 / RHYTHM 2 / MOTION 1. Ritme mengikuti kebutuhan halaman: peta dominan di pencarian, baris data di kunjungan, grafik di laporan.

## 2. Konteks produk dan batas fitur

### Akun agen

- Setelah login masuk ke Ringkasan.
- Menu: Ringkasan, Eksplorasi toko, Kunjungan, Laporan, Pengaturan.
- Eksplorasi mencari toko berdasarkan nama daerah atau polygon yang digambar pengguna.
- Hasil memiliki penilaian Potensial, Perlu tinjau, atau Tidak sesuai bila tercatat dalam data, dengan alasan bila tersedia. Skor model foto tidak boleh ditampilkan sebagai kepastian peluang bisnis.
- Target pencarian adalah kelontong, sembako, dan usaha yang sesuai aturan aplikasi. Indomaret, Alfamart, Superindo, Circle K, dan Alfamidi dikecualikan.
- Pencarian agen yang berjalan tetap dilanjutkan saat pengguna berpindah halaman dalam workspace agen.

### Akun merchant

- Setelah login masuk ke Cari merchant.
- Menu: Cari merchant, Kunjungan merchant, Laporan.
- Pengguna menggambar jalur dari titik awal, belokan, sampai titik akhir.
- Pencarian berada di sepanjang jalur dengan jarak 25, 50, atau 100 meter ke tiap sisi.
- Jalur valid minimal 5 meter dan maksimal 1.000 meter. Garis mengikuti titik pengguna; aplikasi tidak otomatis menempelkannya ke jalan.
- Hasil merchant tidak diberi prediksi model Potensial/Non-Potensial.

### Penyimpanan dan laporan

- Daftar, isian, dan foto tersimpan di database laptop berdasarkan akun yang masuk.
- Akun agen dan merchant memiliki data terpisah. Perangkat dengan akun yang sama membaca data akun tersebut ketika server aktif.
- Ringkasan menggunakan daftar yang sudah disimpan. Hasil pencarian yang belum disimpan belum masuk statistik.
- Peta kunjungan dan laporan mengambil catatan berstatus Sudah dikunjungi.
- Catatan dapat ditambah, diedit, dihapus, dan diekspor ke Excel.
- Pengaturan belum memiliki fitur aktif. Tampilkan keadaan belum tersedia secara sederhana.

Jangan menambahkan fitur yang belum ada seperti pembagian tim, target bulanan, CRM pipeline baru, notifikasi palsu, perbandingan periode, atau pemilih role yang memberi akses ke akun lain.

### Peta halaman aplikasi

| Halaman | Agen | Merchant |
| --- | --- | --- |
| Login bersama | `/` | `/` |
| Ringkasan | `/dashboard` | Tidak ada halaman ringkasan merchant terpisah |
| Pencarian | `/dashboard/search` | `/merchant` |
| Kunjungan | `/dashboard/canvasing` | `/merchant/canvasing` |
| Laporan | `/dashboard/reports` | `/merchant/reports` |
| Pengaturan | `/dashboard/settings` | Tidak tersedia |

Dialog catatan, popup hapus, dan pratinjau foto dibuka dari halaman terkait; tidak memerlukan halaman baru.

## 3. Palet warna dan peran

Gunakan satu keluarga abu-abu netral. Permukaan utama tidak memakai cream, peach, atau abu-abu kebiruan. Oranye cukup pada navigasi terpilih, garis area/jalur, fokus, dan tindakan yang memerlukan penekanan.

| Token | Warna | Penggunaan |
| --- | --- | --- |
| Canvas | `#F7F7F8` | Latar halaman di luar panel |
| Surface | `#FFFFFF` | Form, panel peta, tabel, sidebar |
| Surface muted | `#F0F0F2` | Hover netral, tab tidak aktif, latar grafik |
| Text primary | `#27272A` | Judul, nama toko, isi penting |
| Text secondary | `#52525B` | Deskripsi dan metadata |
| Text muted | `#71717A` | Informasi tambahan pada permukaan putih |
| Divider | `#E4E4E7` | Pemisah dekoratif dan batas panel |
| Control border | `#86868F` | Batas input dan kontrol yang perlu dikenali |
| Action charcoal | `#27272A` | Tombol utama dengan teks putih |
| Action hover | `#3F3F46` | Hover tombol utama |
| BNI accent | `#A84D27` | Aksen interaksi; bukan spesifikasi warna logo resmi |
| Accent surface | `#FFF3EC` | Latar navigasi terpilih dengan teks aksen |
| Focus | `#A84D27` | Outline fokus 2 px dengan offset 2 px |

Warna status hanya untuk arti data:

| Status | Teks / indikator | Latar ringan |
| --- | --- | --- |
| Selesai, Sudah dikunjungi, Closing | `#31624A` | `#EDF5EF` |
| Perlu tinjau / Perlu tindak lanjut | `#805B16` | `#FBF4E4` |
| Error / Hapus | `#9D352E` | `#FCEFED` |
| Belum ditentukan | `#52525B` | `#F0F0F2` |

Utamakan teks status. Sertakan legenda peta dan grafik. Warna status tidak menjadi aksen dekorasi tambahan. Logo resmi menggunakan warna aslinya.

## 4. Tipografi

Gunakan **Geist Sans** sebagai keluarga utama. Font ini sudah digunakan proyek dan jelas untuk nama usaha, formulir, serta angka laporan. Fallback: system-ui, sans-serif.

| Elemen | Desktop | HP | Berat / tinggi baris |
| --- | --- | --- | --- |
| Judul halaman | 30 px | 26 px | 600 / 1,2 |
| Judul panel | 18 px | 18 px | 600 / 1,4 |
| Judul dialog | 22 px | 20 px | 600 / 1,3 |
| Angka ringkasan | 34 px | 30 px | 600 / 1,1 |
| Isi dan tombol | 15 px | 16 px untuk input | 400 atau 500 / 1,5 |
| Label form | 14 px | 14 px | 500 / 1,4 |
| Metadata | 13 px | 14 px | 400 / 1,5 |

Angka tabular untuk jumlah, persentase, koordinat, dan tabel agar kolom sejajar. Geist Mono hanya opsional untuk ID usaha dan koordinat. Judul memakai tracking ringan sekitar -0,02em; isi tracking normal.

Hindari serif, label uppercase dengan jarak huruf lebar, judul raksasa, serta teks abu-abu pucat. Batasi paragraf panjang sekitar 65 karakter per baris; tabel dan peta mengikuti lebar workspace.

## 5. Struktur ruang kerja

### Desktop, mulai 1.200 px

- Sidebar 232 px: identitas di atas, navigasi di tengah, akun dan Keluar di bawah.
- Header 64 px: nama halaman atau breadcrumb ringkas. Jangan mengulang judul besar dalam beberapa baris.
- Padding konten 32 px; jarak antarpanel 24 px.
- Konten maksimum 1.600 px. Pencarian memanfaatkan lebar tersedia; jangan membatasi peta menjadi kolom kecil di tengah layar.
- Grid berdasarkan konten. Peta dan panel hasil sekitar 60:40; panel kanan minimal 360 px bila ruang mencukupi.
- Halaman menggulir vertikal. Jangan memaksa seluruh aplikasi masuk satu tinggi layar hingga bagian bawah terpotong.
- Footer kecil atau menyatu dengan akhir konten agar ruang peta dan hasil tetap cukup.

### Tablet, 768 sampai 1.199 px

- Sidebar berubah menjadi menu yang dapat dibuka dari header dengan tombol Menu.
- Panel yang tidak cukup lebar ditumpuk. Peta boleh berdampingan dengan hasil hanya bila hasil masih terbaca.
- Padding konten 24 px.

### HP, di bawah 768 px

- Satu kolom, padding 16 px, jarak bagian 20 px.
- Header menampilkan Menu, judul halaman, dan identitas role yang ringkas.
- Peta di atas hasil, tinggi sekitar 360 sampai 420 px sesuai viewport.
- Sidebar menjadi drawer dengan label Menu, backdrop, halaman aktif, dan tombol tutup.
- Tabel menjadi baris bertumpuk dengan pasangan label-nilai. Nama usaha dan tindakan tetap terlihat.
- Form satu kolom. Input 16 px, tinggi minimal 44 px; area sentuh kontrol minimal 44 x 44 px.
- Aksi sticky menyediakan ruang bawah dan safe area agar konten terakhir tetap terjangkau.
- Tidak ada scroll horizontal seluruh halaman, teks terpotong, atau kontrol yang hanya muncul saat hover.

## 6. Sistem komponen

### Bentuk dan jarak

Skala jarak: 4, 8, 12, 16, 24, 32, 48 px. Radius 8 px untuk input/tombol, 12 px untuk panel/dialog, dan 6 px untuk label status. Jangan membuat semua kontrol berbentuk kapsul.

Panel putih dapat memakai border 1 px Divider. Tabel dan daftar memakai pemisah baris, tanpa kotak baru untuk setiap informasi. Shadow hanya untuk dialog, dropdown, dan toolbar di atas peta: `0 8px 24px rgba(39,39,42,0.10)`.

### Tombol

- Primary: arang dengan teks putih. Satu tindakan utama dalam satu kelompok tugas.
- Secondary: putih, border Control border, teks arang.
- Tertiary: teks dengan area sentuh yang cukup untuk aksi tambahan.
- Destructive: label merah; merah solid digunakan dalam konfirmasi penghapusan.
- Tinggi 44 px, padding horizontal 16 px, teks 14 sampai 15 px.
- Hover memberi perubahan warna ringan. Press memberi feedback kecil tanpa animasi pantulan.
- Disabled tetap terbaca dan memiliki alasan bila pengguna belum memenuhi syarat.
- Saat menyimpan, label menjadi Menyimpan… dan tombol mencegah pengiriman ganda.

### Input dan pilihan

- Label di atas, nilai di dalam, bantuan atau error di bawah bila diperlukan.
- Pilihan custom memakai combobox: opsi tetap dapat dibuka saat sudah berisi nilai; pengguna dapat mengetik nilai sendiri.
- Dropdown tidak terpotong oleh panel/form. Tingginya dibatasi dengan scroll internal.
- Checkbox mempunyai label/area klik yang cukup.
- Validasi menyebut isian yang perlu diperbaiki. Asterisk hanya untuk field yang benar-benar wajib.

### Status dan ikon

Status memakai latar ringan dan teks terbaca, tanpa glow. Ikon line sederhana 18 sampai 20 px dengan bentuk konsisten, untuk tindakan nyata seperti cari, peta, laporan, tambah, foto, edit, dan hapus. Ikon penting memiliki label; tidak perlu ikon pada setiap metadata.

### Dialog

- Hapus toko: lebar sekitar 440 px, judul Hapus toko?, nama toko dan daftar, penjelasan bahwa catatan/foto ikut terhapus, tombol Batal dan Hapus toko.
- Catat kunjungan: maksimal 920 px, header ringkas, isi scroll vertikal, footer aksi terlihat dengan ruang konten yang cukup.
- Klik di luar dialog, Tutup, dan Esc dapat menutup. Perubahan belum disimpan memunculkan konfirmasi dalam aplikasi sebelum membuang draft.
- Saat penyimpanan gagal, form tetap terbuka dan draft dipertahankan. Fokus tetap dalam modal aktif dan kembali ke pemicu setelah ditutup.

## 7. Arahan per halaman

### A. Login

Satu form tenang, terpusat, lebar sekitar 400 sampai 440 px. Latar Canvas, permukaan putih, logo resmi di atas. Judul Masuk, satu kalimat bantuan, Username, Password, tombol Masuk. Akun menentukan workspace setelah login; tidak ada pemilih role yang melewati autentikasi.

Aset referensi: `webapp/public/bni-logo.svg`, logo BNI standar. Pertahankan rasio dan ruang kosong logo. Jika aset tidak disertakan ke Stitch, gunakan placeholder bertuliskan Logo BNI resmi dan catat kebutuhan penggantian aset. Jangan menggambar ulang simbol BNI atau membuat logo Agen46 baru.

Akun demo berada di disclosure kecil karena merupakan fitur prototipe. Tidak ada ilustrasi rute besar, slogan, statistik, atau klaim keamanan pada login.

### B. Ringkasan agen

Header Ringkasan dengan tindakan Cari toko. Empat statistik dalam satu strip dengan pemisah ringan: Toko tersimpan, Potensial tersimpan, Sudah dikunjungi, Sudah menjadi agen.

Kunjungan terbaru menjadi bagian dominan: nama usaha, area, hasil, dan waktu pembaruan. Bagian kecil di samping menampung akses Kunjungan dan Laporan sebagai daftar tautan. Hindari blok Cari toko besar yang menyita ruang statistik dan aktivitas.

Jumlah mengikuti akun. Data kosong menampilkan 0 dan bantuan untuk menyimpan daftar. Gagal dimuat menampilkan error dan Coba lagi, bukan angka 0. Tanggal yang belum ada diberi label Waktu belum tercatat.

### C. Eksplorasi toko agen

Header Pencarian toko. Toolbar ringkas memuat mode Nama daerah / Area peta. Mode nama daerah mempunyai input daerah dan Cari toko. Mode area mempunyai Gambar area / Edit area, Urungkan titik, Gambar ulang, dan tindakan akhir yang jelas.

Peta langsung di bawah toolbar dan menjadi elemen dominan. Pada desktop, peta dan panel hasil minimal sekitar 560 px; halaman boleh menggulir sehingga workspace tidak terjepit header. Hindari panel hasil yang hanya memperlihatkan satu atau dua baris karena kontrol di atas terlalu tinggi.

Polygon memakai outline aksen 2 sampai 3 px, fill ringan, titik kontras, dan nomor titik secukupnya. Pengguna membuat minimal tiga titik dan dapat menggeser titik. Saat menggambar, tampilkan Mode gambar aktif serta petunjuk satu kalimat. Selesai & cari toko mudah ditemukan; validasi muncul bila titik belum cukup.

Header hasil: jumlah toko, filter Potensial, jumlah dipilih, dan Simpan pilihan. Baris: checkbox, thumbnail opsional, nama, alamat, kategori, dan status penilaian. Alasan dapat menjadi teks sekunder. Detail panjang dibuka saat baris/titik dipilih.

Tampilkan progres nyata bila tersedia, seperti jumlah penelusuran selesai dari total. Jangan mengarang perkiraan menit atau persentase. Skeleton hanya pada informasi yang belum tersedia; hasil sementara tetap terlihat. Progres agen tetap dapat terlihat saat pindah menu tanpa overlay yang menghalangi pekerjaan lain.

### D. Cari merchant

Peta lebar dan panel Ruas pencarian yang ringkas. Pindah daerah di toolbar atas. Panel memuat gambar/edit, urungkan, gambar ulang, jarak pencarian ke sisi garis, panjang aktual, Lihat seluruh jalur, serta Selesai & cari merchant atau Cari merchant sesuai keadaan gambar.

Label Awal dan Akhir terbaca. Garis berwarna aksen; titik dapat digeser. Batas 1.000 m dijelaskan singkat. Jika terlampaui, error berada dekat kontrol. Jangan memberi kesan garis otomatis mengikuti jalan.

Hasil di bagian bawah memakai daftar/tabel yang lega: checkbox, nama, alamat, kategori, jarak, dan Buka di Google Maps. Header memuat kategori, pilih yang tampil, jumlah pilihan, dan Simpan pilihan. Banyak hasil memakai pagination atau scroll terarah, bukan kartu besar identik tanpa batas. Jangan memberi badge klasifikasi AI pada merchant.

### E. Kunjungan agen dan merchant

Header Kunjungan atau Kunjungan merchant. Pilihan Daftar toko / Peta kunjungan dekat judul.

Pada desktop, daftar daerah sekitar 240 px di kiri konten: nama daftar, area, jumlah toko dan jumlah dikunjungi. Bagian utama menampilkan daftar aktif, progres, Tambah toko lapangan, Ekspor daftar ini / Ekspor semua daftar.

Toko sebagai baris yang rapi: nama usaha, alamat, kategori, status kunjungan, dan hasil penting. Catatan panjang dibuka sebagai detail. Catat kunjungan jelas terlihat. Hapus toko merupakan aksi sekunder yang mudah ditemukan dan membuka popup konfirmasi.

Pada HP, pemilih daftar di atas. Setiap baris vertikal dengan Catat kunjungan terlihat. Jangan memaksa seluruh 19 kolom menjadi tabel horizontal.

### F. Catat kunjungan

Kelompok form mengikuti data yang tersedia. Seluruh isian catatan tetap opsional.

1. Identitas usaha: Nama Usaha, Kategori, Alamat, Nama PIC, No telp, Area Kunjungan, Gmaps, ID Usaha.
2. Lokasi: Ambil lokasi saya & isi alamat, Latitude, Longitude, status akurasi bila ada.
3. Produk dan LJK: Produk, LJK, isi dari penyedia, status agen untuk workspace agen, QRIS dan EDC.
4. Hasil kunjungan: Status kunjungan, Potensi, Follow up, Tindak Lanjut, Hasil Prospek, Catatan.
5. Foto kunjungan: upload, maksimal tiga foto, thumbnail yang bisa dibuka, hapus tiap foto.

QRIS dan EDC mendukung beberapa penyedia. Contoh opsi BNI, BCA, Mandiri, BRI, serta nilai custom. Baris memiliki Tambah penyedia / Tambah bank dan Hapus. Jangan menggantinya dengan pilihan yang hanya menyimpan satu bank.

Dua kolom di desktop untuk pasangan field yang cukup lebar. Alamat, LJK, catatan, dan foto boleh mengambil seluruh lebar. Label tidak menjadi placeholder. Potensi, kategori, produk, hasil, dan pilihan lain tetap dapat dibuka ulang ketika nilainya sudah diisi.

Footer: Semua kolom opsional, Tutup, dan primary Simpan kunjungan. Sukses menampilkan Tersimpan. Jika catatan berubah dari perangkat lain, pertahankan draft dan jelaskan kebutuhan membuka data terbaru.

Kontrak ekspor tetap 19 kolom dengan urutan:

`No | Nama Usaha | kategori | Alamat | Nama PIC | No telp | Gmaps | Produk | LJK | Potensi | Follow up | Catatan | Tindak Lanjut | Foto Kunjungan | Hasil Prospek | Latitude | Longitude | Area Kunjungan | ID Usaha`

Urutan visual kelompok boleh membantu pengisian. Jangan menghapus field atau menyatukan Potensi, Follow up, Tindak Lanjut, dan Hasil Prospek.

### G. Peta kunjungan

Peta besar dengan filter semua daftar / satu daftar. Titik hanya untuk toko berstatus Sudah dikunjungi dengan koordinat valid. Warna marker mengikuti hasil/tindak lanjut dan memiliki legenda.

Klik titik membuka panel: nama, alamat, area, PIC, telepon, produk/LJK, penyedia, hasil, tindak lanjut, catatan, foto. Sertakan Catat kunjungan serta Buka di Google Maps. Di HP gunakan panel di bawah peta atau sheet yang dapat digulir tanpa menutupi seluruh kontrol.

Toko tanpa koordinat tetap berada di daftar berlabel Lokasi belum tersedia dan dapat diedit. Jangan memasang titik perkiraan di tengah area.

### H. Laporan agen dan merchant

Header Laporan kunjungan, bantuan singkat, Buka kunjungan, Ekspor data laporan. Satu baris filter: Area kunjungan, Kategori, Status tindak lanjut, Reset filter. Tampilkan jumlah catatan sesuai filter.

Tiga indikator dari data nyata: Total usaha dikunjungi, Closing, Perlu tindak lanjut. Strip angka ringkas dengan penekanan total dan indikator proporsi kecil; hindari tiga kartu promosi besar identik.

Pilihan Grafik & insight / Peta persebaran. Grafik memakai dua kolom sekitar 58:42 sesuai isi: kategori sebagai bagian utama, distribusi status berupa donat/legenda, hasil prospek berupa batang, insight berupa kalimat dengan angka dan konteks.

Ketentuan grafik:

- Batang horizontal dengan kategori, jumlah, persentase. Label panjang dapat membungkus.
- Skala sama untuk grafik yang dibandingkan. Titik nol jelas; tidak ada sumbu terpotong yang membesar-besarkan perbedaan.
- Kategori memakai arang atau aksen tunggal; status memakai warna semantik.
- Donat mempunyai total dan legenda nilai. Segmen 0 tidak diberi irisan palsu.
- Tooltip/fokus menjelaskan label, jumlah, persentase. Pemilihan batang/segmen/legenda memfilter laporan dan menunjukkan filter aktif.
- Tampilkan delapan kelompok teratas dan Lihat semua bila perlu.
- Tanpa 3D, gradient, gauge palsu, tren tanpa tanggal, atau kenaikan tanpa data pembanding.

Tabel Data kunjungan di bawah grafik memuat nama usaha, area/kategori, status tindak lanjut, hasil prospek, ringkasan catatan, dan Lihat catatan. Gunakan pagination bila perlu. Ekspor mengikuti filter aktif. Aturan perhitungan berada dalam disclosure.

### I. Pengaturan

Pertahankan navigasi agen. Judul Pengaturan dan keadaan Pengaturan belum tersedia, sederhana. Jangan menampilkan preferensi, sinkronisasi, atau pengelolaan akun seolah sudah berfungsi.

## 8. Keadaan UI dan kejujuran data

| Keadaan | Tampilan yang diminta |
| --- | --- |
| Belum ada daftar | Judul singkat, bantuan satu kalimat, Buka pencarian |
| Tidak ada hasil pencarian | Tidak ada toko ditemukan, bantuan memperbaiki area/jalur |
| Filter tanpa hasil | Tidak ada data sesuai filter, Reset filter |
| Loading database | Skeleton dan Memuat data…; angka belum dianggap 0 |
| Pencarian berjalan | Progres nyata, hasil sementara, tindakan belum tersedia disabled |
| Menyimpan / menghapus | Status tombol; sukses menunggu konfirmasi server |
| Gagal koneksi | Error relevan, Coba lagi, draft/konten yang sudah ada dipertahankan |
| Impor data lama | Jumlah daftar/toko yang benar-benar dipindahkan, Tutup; kegagalan memiliki Coba pindahkan lagi |
| Tanpa foto | Placeholder netral dengan inisial, bukan foto rekaan |
| Tanpa tanggal/koordinat | Waktu belum tercatat / Lokasi belum tersedia |

Mockup Stitch boleh memakai data dengan label **Data contoh untuk desain**. Nama seperti Contoh toko 01 dan Contoh area. Jangan memakai angka contoh sebagai klaim performa, akurasi model, pelanggan, atau data akun. Label contoh hanya dilepas setelah tersambung ke data aplikasi.

## 9. Interaksi, gerak, dan aksesibilitas

- Transisi hover, fokus, drawer, dialog sekitar 120 sampai 180 ms dengan ease-out lembut.
- Gerak membantu perubahan keadaan. Tidak ada pulse terus-menerus, floating panel, typewriter, parallax, atau cascade panjang pada daftar.
- Animasi memakai opacity/transform. Hormati prefers-reduced-motion.
- Teks biasa minimal kontras 4,5:1, teks besar 3:1. Fokus, batas kontrol yang diperlukan, dan indikator grafik minimal 3:1.
- Kontrol mempunyai keadaan normal, hover, fokus, aktif, disabled, loading, error sesuai konteks.
- Tab mengikuti urutan visual; Enter/Space menjalankan tombol; Arrow/Enter memilih combobox; Esc menutup menu/dialog.
- Ikon memiliki nama aksesibel. Status penting diumumkan dan tidak mengandalkan warna saja.
- Dukung zoom teks 200%, nama toko/kategori/alamat panjang, keyboard HP, serta koneksi lambat.
- Attribution peta tetap terlihat. Warna peta asli boleh dipertahankan untuk konteks jalan; panel di sekitarnya netral.

## 10. Larangan visual dan copy

- Gradient, neon, glow, glassmorphism, bayangan pada semua panel, dot grid, ilustrasi dekoratif besar.
- Pure black `#000000`, serif dashboard, emoji, custom cursor, campuran font tanpa peran.
- Slogan seperti Langkah berikutnya dimulai dari sini, Buka peluang, Mulai perjalanan Anda.
- Tombol generik Explore, Get Started, Learn More. Gunakan Cari toko, Simpan pilihan, Catat kunjungan, Ekspor Excel.
- Aksen warna pada kategori, tab, ikon, angka, dan background sekaligus.
- Border/card/badge bertumpuk yang menghambat pemindaian informasi.
- Peta/hasil terlalu pendek demi memuat semua konten dalam satu layar.
- Teks terpotong, aksi tertutup sticky footer, horizontal overflow di HP.
- Avatar orang rekaan, logo baru, statistik palsu, kontrol fitur yang belum tersedia.

## 11. Layar yang perlu dihasilkan Stitch

Gunakan komponen yang sama di seluruh layar:

1. Login.
2. Ringkasan agen.
3. Eksplorasi toko agen, Area peta dengan hasil; variasi menggambar, pencarian berjalan, kosong.
4. Cari merchant, jalur dan hasil.
5. Kunjungan agen; adaptasi merchant dengan struktur yang sama.
6. Dialog Catat kunjungan, termasuk beberapa QRIS/EDC.
7. Peta kunjungan dengan toko dipilih dan informasi.
8. Laporan, grafik/insight; variasi Peta persebaran dan tanpa data.
9. Popup Hapus toko dan pratinjau foto sebagai komponen pendukung.

Referensi desktop **1440 x 900** dan HP **390 x 844**. Form/laporan panjang memiliki kelanjutan scroll, bukan diperkecil menjadi satu gambar pendek. Buat variasi HP untuk pencarian, kunjungan, form, dan laporan.

Identitas sidebar: BNI dengan label Agen atau Merchant. Jangan menampilkan brand Canvas sebagai role. Nama halaman berbahasa Indonesia dan konsisten dengan navigasi.

## 12. Kriteria review desain

- Pengguna dapat mengenali halaman aktif, pekerjaan utama, dan tindakan berikutnya dengan cepat.
- Peta/hasil cukup luas di laptop; tombol selesai/cari tidak hilang.
- Nama toko, alamat, status, tindakan mudah dipindai.
- Seluruh field kunjungan dan beberapa QRIS/EDC tetap tersedia.
- Grafik terbaca, filter jelas, insight mengikuti data yang ditampilkan.
- Role agen/merchant dan status kunjungan tidak tertukar.
- Empty, loading, error, konflik data, konfirmasi hapus memiliki rancangan.
- Tanpa slogan, klaim palsu, dekorasi berlebihan, atau fitur baru yang tersirat tersedia.
- Lebar 390 px tetap utuh, tombol mudah disentuh, konten terakhir terjangkau.

## 13. Prompt pembuka untuk Stitch

> Rancang ulang aplikasi BNI Agen & Merchant menggunakan DESIGN.md ini sebagai acuan. Gunakan tampilan profesional, minimalis, netral, dengan Geist Sans, dasar putih/abu-abu, teks arang, dan aksen oranye BNI secukupnya. Pertahankan alur dan fitur agen serta merchant yang dijelaskan. Utamakan ruang peta dan hasil pencarian, formulir kunjungan yang jelas, dan laporan yang mudah dibaca. Buat komponen konsisten dan versi desktop serta HP. Mulai dari Eksplorasi toko agen, lalu Laporan kunjungan, sebelum menerapkan sistem yang sama ke layar lain. Gunakan Bahasa Indonesia. Jika perlu data mockup, labeli sebagai data contoh untuk desain.


