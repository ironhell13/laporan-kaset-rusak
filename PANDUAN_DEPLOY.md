# Panduan Pemasangan & Penggunaan Web App "Laporan Kaset Alsut"

Aplikasi **Laporan Kaset Alsut** adalah aplikasi berbasis Google Apps Script yang dirancang khusus untuk mempermudah tim lapangan (PKT) menginput kaset ATM CRM secara cepat, akurat, dan mobile-friendly via smartphone.

---

## 1. Persiapan File
Di dalam folder ini telah tersedia 3 file utama yang siap disalin ke Google Apps Script:
- `Code.gs` : Script backend (logika simpan data, kunci lock, sanitasi formula, normalisasi S/N).
- `Index.html` : Antarmuka web mobile-first lengkap dengan scanner barcode 3-lapis (kamera live, foto, manual).
- `appsscript.json` : Konfigurasi manifest Apps Script (zona waktu Asia/Jakarta, akses web app).

---

## 2. Cara Memasang Kode ke Google Apps Script (Container-Bound)

1. Buka file Google Spreadsheet Anda yang berisi sheet **"Format Laporan Kaset Rusak"** dan **"Type Mesin"**.
2. Pada menu atas spreadsheet, klik **Ekstensi (Extensions)** > **Apps Script**.
3. Di editor Apps Script:
   - **File Code.gs**:
     - Hapus semua isi default di file `Code.gs`.
     - Salin seluruh isi dari file [`Code.gs`](file:///Users/macbookpro/Documents/kantor/Dashboard%20Cassette%20Alsut/Code.gs) lokal ke tab `Code.gs` di editor Apps Script.
   - **File Index.html**:
     - Klik tombol **+** di sebelah tulisan *Files* > Pilih **HTML**.
     - Beri nama file: `Index` (Apps Script otomatis menambahkan ekstensi `.html`).
     - Hapus kode bawaan, lalu salin seluruh isi dari file [`Index.html`](file:///Users/macbookpro/Documents/kantor/Dashboard%20Cassette%20Alsut/Index.html) ke dalamnya.
   - **File appsscript.json (Opsional / Jika ingin menyamakan izin & manifest)**:
     - Klik ikon **Roda Gigi (Project Settings)** di panel kiri.
     - Centang opsi *"Show "appsscript.json" manifest file in editor"*.
     - Kembali ke tab editor (< > *Editor*), buka file `appsscript.json`.
     - Salin isi dari [`appsscript.json`](file:///Users/macbookpro/Documents/kantor/Dashboard%20Cassette%20Alsut/appsscript.json).
4. Klik ikon **Simpan (Save)** (ikon disket) atau tekan `Ctrl + S` / `Cmd + S`.

---

## 3. Otorisasi Izin Pertama Kali

1. Di editor Apps Script, pilih fungsi `getInitialData` pada dropdown fungsi di bilah atas.
2. Klik tombol **Run (Jalankan)**.
3. Google akan memunculkan dialog **"Authorization required"** (Izin diperlukan).
4. Klik **Review Permissions** (Tinjau Izin).
5. Pilih akun Google Anda.
6. Jika muncul peringatan *"Google hasn't verified this app"*, klik **Advanced (Lanjutan)** di bagian kiri bawah, lalu klik **Go to Laporan Kaset Alsut (unsafe)**.
7. Klik **Allow (Izinkan)**.
8. Pastikan di panel *Execution log* muncul status `Completed`.

---

## 4. Deploy sebagai Web App

1. Klik tombol biru **Deploy** di kanan atas > pilih **New deployment** (Penerapan baru).
2. Klik ikon gerigi di sebelah *"Select type"* > pilih **Web app**.
3. Atur parameter berikut:
   - **Description**: `Versi 1.0 - Laporan Kaset Alsut`
   - **Execute as**: **Me** (akun Google Anda)
   - **Who has access**:
     - Pilih **Anyone** (Siapa saja - agar tim lapangan bisa langsung buka tanpa login akun kantor/Google), atau
     - Pilih **Anyone with Google account** (jika ingin membatasi hanya yang punya akun Google).
4. Klik tombol **Deploy**.
5. Salin tautan **Web App URL** yang diberikan (formatnya: `https://script.google.com/macros/s/.../exec`). URL inilah yang dibagikan kepada tim lapangan.

---

## 5. Cara Update Versi Saat Kode Diubah

Jika Anda melakukan perubahan kode di `Code.gs` atau `Index.html`:
1. Simpan perubahan kode (`Ctrl + S` / `Cmd + S`).
2. Klik tombol **Deploy** > **Manage deployments** (Kelola penerapan).
3. Klik ikon pensil (**Edit**) pada penerapan Web App aktif.
4. Pada dropdown **Version**, pilih **New version** (Versi baru).
5. Klik **Deploy**.
> **Penting**: Jangan membuat *New deployment* baru setiap edit, melainkan perbarui versi pada *Manage deployments* agar link URL yang dibagikan ke tim lapangan tidak berubah!

---

## 6. Menambah atau Mengubah Daftar "Type Mesin"

Aplikasi membaca daftar mesin langsung dari Google Spreadsheet secara real-time:
1. Buka sheet **"Type Mesin"** di Google Spreadsheet.
2. Tambahkan nama mesin baru di baris berikutnya pada Kolom A (mulai baris A2 ke bawah).
3. Tanpa perlu deploy ulang atau mengubah kode, ketika tim lapangan membuka web app, opsi baru otomatis muncul di dropdown form!

---

## 7. Menambahkan Aplikasi ke Layar Utama (Home Screen) HP

Untuk kenyamanan tim lapangan agar aplikasi terasa seperti aplikasi native tanpa perlu mencari link:

### Di Android (Google Chrome):
1. Buka link Web App di browser Google Chrome.
2. Ketuk ikon titik tiga (⋮) di pojok kanan atas browser.
3. Pilih **"Add to Home screen"** (Tambahkan ke Layar Utama) atau **"Install app"**.
4. Beri nama "Kaset Alsut", lalu ketuk **Add**.

### Di iPhone / iOS (Safari):
1. Buka link Web App di browser Safari.
2. Ketuk tombol **Share** (ikon kotak dengan panah ke atas) di bagian bawah.
3. Gulir ke bawah dan pilih **"Add to Home Screen"** (Tambah ke Layar Utama).
4. Ketuk **Add** di pojok kanan atas.

---

## 8. Panduan Troubleshooting

| Masalah | Penyebab | Solusi |
| :--- | :--- | :--- |
| **Kamera live tidak muncul / error izin** | Browser memblokir akses kamera di dalam iframe Google Apps Script atau link dibuka dari in-app browser (misal WhatsApp / Telegram). | 1. Buka tautan langsung di browser native (Google Chrome di Android, Safari di iPhone).<br>2. Izinkan permission kamera di pengaturan situs browser.<br>3. Gunakan tombol **"Ambil Foto Barcode"** yang otomatis aktif sebagai alternatif foto kamera. |
| **Dropdown Type Mesin Kosong / Tombol Simpan Mati** | Sheet `"Type Mesin"` tidak ditemukan atau kolom A baris 2 kosong. | Pastikan nama sheet di Spreadsheet persis bertuliskan `Type Mesin` dan baris A2 ke bawah terisi tipe mesin. |
| **Data submit tidak masuk** | Lock timeout karena banyak pengiriman bersamaan atau izin spreadsheet belum diberikan. | Sistem memiliki timeout otomatis 30 detik. Coba submit kembali. Pastikan otorisasi izin (Langkah 3) sudah disetujui. |
| **Nomor barcode terpotong angka 0 depannya** | Terjadi konversi otomatis ke angka oleh Spreadsheet. | Sistem sudah diatur otomatis menyetel format `@` (Plain Text) pada kolom C dan D sehingga nomor awalan 0 atau teks alfanumerik tersimpan utuh. |
