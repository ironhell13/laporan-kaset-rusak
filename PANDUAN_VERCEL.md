# Panduan Lengkap: Deploy Web App ke Vercel (Data Otomatis Masuk ke Google Spreadsheet)

Solusi ini memisahkan **Frontend Antarmuka** (dijalankan di **Vercel** yang cepat, responsif, dan ramah smartphone) dengan **Backend Database** (tetap masuk ke **Google Spreadsheet** melalui Google Apps Script Webhook).

---

## Mengapa Vercel Jauh Lebih Baik di HP Dibanding Link Apps Script Langsung?

1. **Bebas Masalah Login Google**: Tim lapangan tidak akan lagi mengalami stuck di login akun Google / *redirect loop* saat membuka link di WhatsApp atau browser HP.
2. **Kamera Belakang Berjalan 100% Native**: Apps Script membatasi kamera karena berjalan di dalam *iframe sandboxed*. Di domain Vercel (`https://xxx.vercel.app`), browser HP memberikan izin kamera live secara penuh tanpa pemblokiran.
3. **PWA Standalone (Home Screen)**: Aplikasi dapat ditambahkan ke Layar Utama HP dan terbuka seperti aplikasi Android/iOS native tanpa address bar browser.
4. **Kecepatan Akses Tinggi**: Halaman web dimuat lewat Vercel Global Edge Network (< 200 milidetik).

---

## Arsitektur Sistem

```
[ Smartphone Tim Lapangan (HP) ]
           │
           ▼
[ Vercel Web App (HTTPS) ] ──▶ Akses Kamera Native, Validasi Form, PWA
           │
           ▼ (Serverless API /api/*)
[ Google Apps Script Webhook (Code.gs) ]
           │
           ▼
[ Google Spreadsheet ("Format Laporan Kaset Rusak") ]
```

---

## Langkah 1: Siapkan Backend di Google Spreadsheet (5 Menit)

1. Buka spreadsheet Google Anda (yang berisi sheet **"Format Laporan Kaset Rusak"** dan **"Type Mesin"**).
2. Buka menu **Ekstensi** > **Apps Script**.
3. Buka file `Code.gs`, hapus kodenya dan ganti dengan isi dari file [`Code.gs`](file:///Users/macbookpro/Documents/kantor/Dashboard%20Cassette%20Alsut/Code.gs) terbaru di folder ini.
4. Klik ikon **Simpan** (ikon disket).
5. Jalankan fungsi `getInitialData` sekali untuk otorisasi (*Review Permissions* > *Advanced* > *Go to ... (unsafe)* > *Allow*).
6. Buat Webhook:
   - Klik tombol **Deploy** di kanan atas > **New deployment**.
   - Pilih jenis: **Web app**.
   - Isi konfigurasi:
     - **Execute as**: **Me** (akun Google Anda).
     - **Who has access**: **Anyone** (Siapa saja — *wajib agar Vercel bisa mengirim data tanpa terhalang login Google*).
   - Klik **Deploy**.
7. **Salin Web App URL** yang diberikan (berformat `https://script.google.com/macros/s/.../exec`). Simpan URL ini untuk langkah 2.

---

## Langkah 2: Deploy ke Vercel

Anda dapat memilih salah satu cara termudah di bawah ini:

### Cara A: Melalui Vercel CLI (Paling Cepat dari Terminal)
1. Buka terminal di folder ini:
   ```bash
   cd "/Users/macbookpro/Documents/kantor/Dashboard Cassette Alsut"
   ```
2. Jalankan perintah deploy Vercel:
   ```bash
   npx vercel
   ```
3. Ikuti pertanyaan di terminal (tekan Enter untuk opsi default).
4. Setelah selesai, deploy ke production:
   ```bash
   npx vercel --prod
   ```
5. Tambahkan Environment Variable `GAS_URL`:
   ```bash
   npx vercel env add GAS_URL
   ```
   *Paste URL Apps Script Anda dari Langkah 1.*

---

### Cara B: Melalui GitHub & Dashboard Vercel (Rekomendasi Tim)
1. Push folder proyek ini ke repositori GitHub Anda.
2. Buka [vercel.com](https://vercel.com) dan login.
3. Klik **Add New...** > **Project**.
4. Import repositori GitHub Anda.
5. Pada bagian **Environment Variables**, tambahkan:
   - **Key**: `GAS_URL`
   - **Value**: *Paste URL Web App Apps Script dari Langkah 1*
6. Klik **Deploy**.
7. Dalam 1 menit, Vercel akan memberikan link website aktif, misalnya:
   `https://laporan-kaset-alsut.vercel.app`

---

## Langkah 3: Pengaturan Cadangan (Tanpa Edit Environment Variable)

Jika Anda ingin langsung mencoba tanpa menyetel Environment Variable di Vercel:
1. Buka link Vercel Anda di browser.
2. Di pojok kanan atas samping judul, ketuk ikon **Pengaturan (⚙️)**.
3. Tempelkan URL Google Apps Script Anda, lalu klik **Simpan**.
4. URL akan otomatis tersimpan di HP tersebut dan langsung terhubung ke Google Spreadsheet!

---

## Langkah 4: Cara Penggunaan di Smartphone Tim Lapangan

Bagikan tautan Vercel kepada tim lapangan:
1. Buka tautan di **Google Chrome (Android)** atau **Safari (iPhone)**.
2. Saat pertama kali menekan tombol kamera (Scan), browser akan meminta izin:
   - Pilih **"Izinkan" (Allow)**.
3. Kamera belakang akan langsung aktif dengan reticle pemindai.
4. Setelah berhasil mengisi dan menekan **"Simpan Laporan"**:
   - Data otomatis masuk ke baris kosong sheet *"Format Laporan Kaset Rusak"*.
   - WSID dan Tipe Mesin otomatis tersimpan untuk kaset berikutnya.
   - Kolom G dan H (diisi CCAS) tetap terjaga rapi tanpa disentuh.

---

## Tips: Pasang ke Layar Utama HP (Icon App)

- **Android (Chrome)**: Ketuk titik tiga (⋮) > **"Add to Home screen"** / **"Install app"**.
- **iPhone (Safari)**: Ketuk ikon Share (kotak panah ke atas) > **"Add to Home Screen"**.
Aplikasi akan muncul di layar HP dengan ikon kaset dan dapat dibuka layaknya aplikasi native tanpa bar browser!
