Buatkan saya web app mobile-first menggunakan Google Apps Script (Code.gs + Index.html, plus appsscript.json) dengan nama aplikasi "Laporan Kaset Alsut". Aplikasi ini dipakai tim lapangan lewat HP untuk mendata barcode kaset (cassette) ATM CRM, dan datanya otomatis masuk ke Google Spreadsheet.

==================================================
1. TUJUAN
==================================================
Tim lapangan (PKT) mengisi form di HP setiap menemukan kaset rusak/perlu dilaporkan. Setiap submit = 1 baris baru di sheet "Format Laporan Kaset Rusak". Kolom G dan H (diisi CCAS) TIDAK boleh disentuh oleh aplikasi.

==================================================
2. SPREADSHEET & SHEET
==================================================
- Gunakan spreadsheet yang saya upload (Format_Laporan_Kaset_Rusak.xlsx, sudah saya import ke Google Sheets). Script dibuat container-bound (Extensions > Apps Script) agar bisa pakai SpreadsheetApp.getActiveSpreadsheet(). Sediakan juga konstanta SPREADSHEET_ID opsional sebagai fallback (SpreadsheetApp.openById) bila script dibuat standalone.
- Sheet tujuan: "Format Laporan Kaset Rusak"
  - Baris 1: grup header (A1:F1 merged "diisi PKT", G1:H1 merged "diisi CCAS") -> jangan diubah.
  - Baris 2: header kolom, urutan persis:
    A: WSID
    B: Tanggal Replenish
    C: Nomor Kaset (Barcode Alsut)
    D: S/N
    E: Module
    F: Type Mesin
    G: Cek CPC Alsut (diisi CCAS, biarkan kosong)
    H: Tgl Bongkaran (diisi CCAS, biarkan kosong)
  - Perhatian: beberapa teks header punya spasi di akhir (mis. "WSID ", "Type Mesin "). Tulis data berdasarkan POSISI KOLOM (A-F), jangan mencari kolom berdasarkan teks header.
  - Data mulai baris 3. Jangan hapus/timpa data yang sudah ada.
  - Cari baris kosong berikutnya berdasarkan baris terakhir yang berisi data di kolom A-F (bukan getLastRow() mentah, karena bisa ada formatting/validasi di bawah). Tulis hanya ke kolom A-F.
- Sheet "Contoh Pelaporan" hanya contoh, jangan diubah.
- Sheet "Type Mesin" SUDAH ADA di spreadsheet: header di A1 ("Type Mesin"), daftar mulai A2 (saat ini 22 type, mis. HYOSUNG 5600, DIEBOLD 5500, HITACHI SR7500, NCR SS22, OKI RG8+, WINCORE 280, dst).
  - Aplikasi membaca daftar dari kolom A mulai baris 2 SECARA DINAMIS setiap aplikasi dibuka (jangan hardcode, karena saya akan menambah/mengubah type sendiri di sheet). Abaikan sel kosong, trim spasi, hilangkan duplikat, pertahankan urutan sesuai sheet.
  - Nilai yang tersimpan ke kolom F harus sama persis dengan teks di sheet "Type Mesin" (sudah di-trim).
  - Jika sheet tidak ditemukan atau kosong, tampilkan pesan jelas di form: "Daftar Type Mesin tidak tersedia, hubungi admin." dan nonaktifkan tombol simpan.

==================================================
3. FIELD FORM (urutan dari atas ke bawah)
==================================================
1) WSID
   - Input teks, wajib. Otomatis uppercase, trim spasi. Hanya huruf & angka (contoh: Z565J). Tidak perlu fitur scan.
2) Tanggal Replenish
   - Terisi otomatis dengan tanggal saat aplikasi dibuka (zona waktu Asia/Jakarta), tampilan "dd MMM yyyy" (mis. 22 Okt 2026).
   - Field read-only (tidak bisa diubah user). Di server, tanggal tetap dihitung ulang dengan new Date() saat submit (jangan percaya nilai dari client), lalu disimpan ke sheet sebagai nilai tanggal asli (bukan teks) dengan number format "d MMM yyyy".
3) Nomor Kaset (Barcode Alsut)
   - Input teks wajib + tombol "Scan" (ikon kamera) di dalam/di samping field. Bisa juga diketik manual.
   - Contoh isi barcode: WCR2063 (label krem di kaset berisi barcode 1D + teks WCR2063).
   - Simpan sebagai TEKS (set number format "@" pada sel sebelum menulis) agar tidak berubah jadi angka/hilang nol di depan. Uppercase + trim.
4) S/N
   - Input teks wajib + tombol "Scan" (kamera) + bisa manual.
   - FORMAT S/N YANG DISIMPAN: LENGKAP dengan awalan, contoh: SAB10153994.
   - Sumber barcode/QR S/N di kaset:
     a. Stiker "CATRIDGE CRM" berisi QR, teks "SN: SAB10153994" -> hasil yang diharapkan SAB10153994
     b. Label Hitachi-Omron berisi barcode 1D dan teks "S/N 153994" / "TS-M1U2-SAB10 153994" -> hasil yang diharapkan SAB10153994
   - Aturan normalisasi hasil scan (fungsi normalizeSN, mudah diubah, taruh nilainya di CONFIG):
       1. Trim, uppercase, hapus awalan "SN:" / "S/N" bila ada.
       2. Jika mengandung pola "SAB10" yang diikuti angka (boleh ada spasi/strip di antaranya, mis. "SAB10 153994") -> hasilkan "SAB10" + angka tersebut, tanpa spasi (SAB10153994).
       3. Jika hasil scan HANYA angka (mis. 153994) -> tambahkan awalan SN_PREFIX ("SAB10") di depannya.
       4. Selain itu -> pakai hasil scan apa adanya (trim, uppercase).
     - Konstanta CONFIG: SN_NORMALIZE = true, SN_PREFIX = "SAB10". Jika SN_NORMALIZE = false, simpan hasil scan mentah.
     - Normalisasi juga berlaku saat user mengetik manual (dijalankan saat field kehilangan fokus/blur dan sekali lagi di server sebelum simpan), sehingga ketik "153994" otomatis menjadi "SAB10153994".
   - Hasil scan otomatis mengisi field tapi tetap bisa diedit manual.
   - Simpan sebagai teks ("@").
5) Module
   - Dropdown (select) pilihan angka 1 sampai 6. Wajib dipilih; default placeholder "Pilih module". Simpan sebagai angka.
6) Type Mesin
   - Dropdown dari sheet "Type Mesin" (lihat poin 2). Wajib dipilih; default placeholder "Pilih type mesin".

Tombol utama: "Simpan Laporan" (full width, besar, mudah ditekan jempol). Tombol sekunder: "Reset".

==================================================
4. FITUR SCAN KAMERA (PENTING)
==================================================
Catatan teknis: Apps Script HTML Service berjalan di dalam iframe, dan akses kamera live (getUserMedia) sering diblokir di iframe tersebut. Maka implementasikan 3 lapis, otomatis fallback:

A) Scan live: tombol "Scan" membuka modal full-screen dengan preview kamera belakang (facingMode: environment), pakai library html5-qrcode (https://unpkg.com/html5-qrcode) atau ZXing-js dari CDN. Format yang harus didukung: QR_CODE, CODE_128, CODE_39, EAN_13, EAN_8, ITF, CODABAR, DATA_MATRIX. Beri bingkai pemindai, tombol tutup, dan tombol senter (torch) bila didukung perangkat. Setelah terbaca: getar singkat (navigator.vibrate bila ada), isi field, tutup modal otomatis.
B) Fallback foto: jika live camera gagal/ditolak/tidak tersedia, otomatis tampilkan tombol "Ambil Foto Barcode" memakai <input type="file" accept="image/*" capture="environment">, lalu decode gambar tersebut dengan library yang sama (mis. Html5Qrcode.scanFile atau ZXing decode dari gambar). Fallback ini harus berfungsi di Apps Script iframe.
C) Fallback manual: jika decode gagal, tampilkan pesan ramah "Barcode tidak terbaca, silakan ulangi atau ketik manual" dan field tetap bisa diketik.

Detail:
- Satu modal scanner dipakai bersama oleh field Nomor Kaset dan S/N (parameter target field).
- Hasil scan untuk field S/N dilewatkan ke normalizeSN sebelum ditampilkan di field.
- Pastikan stream kamera DIMATIKAN saat modal ditutup atau setelah scan sukses.
- Tampilkan pesan error spesifik yang user-friendly bila izin kamera ditolak (jelaskan cara mengizinkan di browser) sambil menawarkan fallback B.
- Gunakan hanya CDN https dan hindari library yang butuh build step.

==================================================
5. VALIDASI & LOGIKA SIMPAN
==================================================
Client-side (cek sebelum kirim) DAN server-side (wajib, jangan percaya client):
- Semua 6 field wajib terisi.
- WSID: 3-10 karakter alfanumerik uppercase.
- S/N: tidak kosong setelah dinormalisasi; bila SN_NORMALIZE aktif dan hasilnya tidak berformat SAB10 + angka, tetap boleh disimpan tapi tampilkan peringatan kuning "Format S/N tidak biasa, pastikan sudah benar".
- Module: harus bilangan bulat 1-6.
- Type Mesin: harus ada di daftar sheet "Type Mesin" (validasi di server, dibaca ulang saat submit).
- Cek duplikat: jika Nomor Kaset yang sama sudah ada di kolom C sheet tujuan, tampilkan peringatan "Nomor kaset ini sudah pernah dilaporkan (tanggal ..., WSID ...). Tetap simpan?" dengan pilihan Batal / Tetap Simpan. Jangan blokir total.
- Gunakan LockService.getScriptLock() (waitLock 30 detik) saat menulis agar tidak bentrok bila banyak orang submit bersamaan, lalu SpreadsheetApp.flush() dan lepaskan lock di blok finally.
- Semua fungsi server dibungkus try/catch dan mengembalikan objek {success, message, data}. Jangan expose stack trace ke user.
- Sanitasi input: cegah formula injection (jika nilai diawali =, +, -, @ pada WSID/nomor kaset/S-N, tolak atau awali dengan tanda kutip ').

==================================================
6. ALUR UX SETELAH SIMPAN
==================================================
- Sukses: tampilkan toast/snackbar hijau "Laporan tersimpan" + ringkasan (WSID, nomor kaset, S/N, module, type).
- Satu ATM sering punya beberapa kaset, jadi setelah simpan: yang DIPERTAHANKAN hanya WSID dan Type Mesin. Nomor Kaset, S/N, dan Module dikosongkan supaya user cepat input kaset berikutnya. Fokus otomatis ke field Nomor Kaset.
- Tombol "Reset" mengosongkan seluruh form (kecuali tanggal).
- Tombol submit disabled + spinner saat proses, cegah double-submit.
- Di bawah form tampilkan "Riwayat sesi ini": daftar laporan yang sudah berhasil dikirim selama sesi di HP tersebut (WSID, nomor kaset, S/N, jam) agar user yakin data masuk. Cukup disimpan di memori JavaScript (tidak pakai localStorage), tidak perlu membaca ulang dari sheet.
- Jika gagal (jaringan/server), tampilkan pesan error merah dan JANGAN mengosongkan form supaya data tidak hilang.

==================================================
7. DESAIN UI (simple & clean)
==================================================
- Judul app: "Laporan Kaset Alsut" di header, sub-judul kecil "Tim Lapangan" boleh ditambahkan.
- Mobile-first (lebar 360-430px), tetap rapi di desktop (container max-width ~480px di tengah).
- <meta name="viewport" content="width=device-width, initial-scale=1">. Gunakan font-size input minimal 16px agar iOS tidak auto-zoom.
- Gaya: latar putih/abu sangat muda, kartu form dengan sudut membulat dan bayangan tipis, satu warna aksen (biru), label di atas input, jarak antar field lega, tombol besar (tinggi min 48px), kontras teks bagus.
- Field tanggal tampil sebagai read-only dengan gaya berbeda (abu-abu) dan ikon kalender.
- Tombol scan berupa ikon kamera (SVG inline, tanpa library ikon eksternal) di sisi kanan input.
- Pesan error validasi muncul di bawah field terkait, border merah.
- Tanpa framework berat: HTML + CSS + vanilla JavaScript saja. Font sistem (system-ui) agar cepat.
- Dukungan dark mode tidak wajib.

==================================================
8. STRUKTUR KODE
==================================================
Code.gs:
- CONFIG di paling atas: SHEET_NAME_REPORT = "Format Laporan Kaset Rusak", SHEET_NAME_TYPE = "Type Mesin", HEADER_ROW = 2, FIRST_DATA_ROW = 3, TIMEZONE = "Asia/Jakarta", SN_NORMALIZE = true, SN_PREFIX = "SAB10".
- doGet(): return HtmlService.createTemplateFromFile('Index').evaluate() dengan setTitle('Laporan Kaset Alsut'), addMetaTag('viewport', 'width=device-width, initial-scale=1'), setXFrameOptionsMode(ALLOWALL).
- getInitialData(): return { today (string tampilan), typeMesinList }.
- checkDuplicate(nomorKaset).
- saveReport(payload).
- normalizeSN(raw).
Index.html: HTML + CSS + JS dalam satu file. Panggil server memakai google.script.run dengan withSuccessHandler/withFailureHandler. Sediakan juga fungsi normalizeSN versi JavaScript di sisi client dengan aturan yang sama.
appsscript.json: timeZone "Asia/Jakarta", runtimeVersion "V8", webapp { executeAs: "USER_DEPLOYING", access: "ANYONE" }, scope minimal (spreadsheets).

==================================================
9. DEPLOY & PANDUAN
==================================================
Sertakan panduan singkat langkah demi langkah dalam bahasa Indonesia:
1. Cara memasang kode ke Apps Script.
2. Otorisasi izin saat pertama dijalankan.
3. Deploy > New deployment > Web app, Execute as: Me, Who has access: sesuai kebutuhan (Anyone / Anyone with Google account).
4. Cara update versi saat kode diubah (Manage deployments > edit > New version).
5. Cara menambah type mesin baru (cukup tambah baris di sheet "Type Mesin", tanpa ubah kode).
6. Cara menambahkan link aplikasi ke Home Screen HP.
7. Tips troubleshooting: kamera tidak jalan (izin browser, buka lewat Chrome/Safari langsung, bukan dari dalam aplikasi chat), data tidak masuk, dropdown kosong.

==================================================
10. KRITERIA SELESAI (checklist uji)
==================================================
- Form tampil rapi di HP 360px; tanggal terisi otomatis sesuai hari ini (WIB).
- Dropdown Module berisi 1-6; dropdown Type Mesin menampilkan 22 type dari sheet "Type Mesin" dan ikut berubah setelah sheet diedit.
- Scan QR "SN: SAB10153994" menghasilkan S/N SAB10153994; scan "TS-M1U2-SAB10 153994" juga menghasilkan SAB10153994; input manual "153994" menjadi SAB10153994; scan barcode "WCR2063" mengisi Nomor Kaset WCR2063.
- Jika kamera live gagal, fallback foto dan input manual tetap bisa dipakai.
- Submit menambah 1 baris baru di baris kosong berikutnya pada kolom A-F, kolom G-H tetap kosong, format teks pada kolom C dan D terjaga, header dan merge baris 1-2 tidak berubah.
- Duplikat nomor kaset memunculkan konfirmasi.
- Setelah simpan, WSID dan Type Mesin tetap terisi, field lain kosong.
- Tidak ada double-submit; submit bersamaan dari beberapa HP tidak saling menimpa baris.

Mohon hasilkan kode lengkap yang siap copy-paste (Code.gs, Index.html, appsscript.json) beserta panduan deploy-nya.