This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Klasifikasi toko

Halaman pencarian mengambil toko dari Google Maps, lalu mengirim nama, kategori, dan URL foto
yang tersedia ke `POST /api/v1/classify`. Model gambar di `../scraper/classify_batch.py`
memproses foto secara batch. Model aktif adalah `../scraper/trained_model_v3` jika berkas
`approved.json` ada; jika tidak, model lama di `../scraper/trained_model` dipakai.

Hasil akhir mengikuti jenis usaha yang jelas pada nama atau kategori Google Maps. Aturannya
ada di `src/lib/business-taxonomy.json`: sembako, kelontong, swalayan, dan minimarket termasuk
potensial; tekstil, pakaian, elektronik, usaha siap saji, dan jasa termasuk non-potensial.
Toko yang jenis usahanya belum jelas tidak otomatis menjadi potensial meskipun model foto
memberi skor tinggi; statusnya **Perlu verifikasi jenis usaha**. Toko tanpa foto dan foto
yang gagal dibaca juga ditandai tersendiri. Angka confidence dari model adalah keyakinan
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
