/**
 * =========================================================================
 * LAPORAN KASET ALSUT - BACKEND GOOGLE APPS SCRIPT (API & SHEET ENGINE)
 * =========================================================================
 * Bertindak sebagai Headless API untuk frontend Vercel maupun Google Apps Script.
 * Data disimpan ke Google Spreadsheet pada sheet "Format Laporan Kaset Rusak".
 * Kolom A-G diisi PKT, Kolom H-I (CCAS) tidak disentuh sama sekali.
 * Dioptimasi khusus untuk penggunaan bersamaan hingga 20+ orang secara simultan.
 */

// =========================================================================
// KONFIGURASI APLIKASI
// =========================================================================
const CONFIG = {
  // SPREADSHEET_ID opsional:
  // - Jika script dibuat container-bound (Extensions > Apps Script dari Spreadsheet), biarkan kosong "".
  // - Jika script dibuat standalone (terpisah), isi ID spreadsheet di bawah ini.
  SPREADSHEET_ID: "",

  // Nama sheet
  SHEET_NAME_REPORT: "Format Laporan Kaset Rusak",
  SHEET_NAME_TYPE: "Type Mesin",
  SHEET_NAME_WSID: "WSID",
  SHEET_NAME_MODULE: "Module",

  // Struktur baris
  HEADER_ROW: 2,
  FIRST_DATA_ROW: 3,

  // Zona waktu & format tanggal
  TIMEZONE: "Asia/Jakarta",
  DATE_DISPLAY_FORMAT: "dd MMM yyyy",
  DATE_NUMBER_FORMAT: "d MMM yyyy",

  // Normalisasi S/N
  SN_NORMALIZE: true,
  SN_PREFIX: "SAB10",

  // Dimensi foto pada sel Spreadsheet (Lebar: 12,31 cm x Tinggi: 9,25 cm pada 96 DPI)
  PHOTO_CELL_WIDTH: 465,   // Lebar: 12,31 cm = ~465 pixel
  PHOTO_CELL_HEIGHT: 350   // Tinggi: 9,25 cm = ~350 pixel
};

/**
 * Mendapatkan referensi Spreadsheet (Container-bound atau Standalone via ID)
 */
function getSpreadsheet() {
  if (CONFIG.SPREADSHEET_ID && CONFIG.SPREADSHEET_ID.trim() !== "") {
    return SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID.trim());
  }
  var active = SpreadsheetApp.getActiveSpreadsheet();
  if (!active) {
    throw new Error("Spreadsheet tidak ditemukan. Jika script standalone, isi CONFIG.SPREADSHEET_ID pada Code.gs.");
  }
  return active;
}

/**
 * HTTP GET:
 * - Jika dipanggil dengan ?action=..., return response JSON (API Mode).
 * - Jika dibuka langsung di browser tanpa parameter, render HTML (Web App Mode).
 */
function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) ? e.parameter.action : "";

  if (action) {
    var result = { success: false, message: "Aksi tidak dikenal" };
    try {
      if (action === "getInitialData") {
        result = getInitialData();
      } else if (action === "checkDuplicate") {
        result = checkDuplicate(e.parameter.nomorKaset);
      } else {
        result = { success: false, message: "Aksi GET '" + action + "' tidak didukung." };
      }
    } catch (err) {
      result = { success: false, message: "Server error: " + err.message };
    }

    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // Fallback: Jika dibuka di browser langsung
  var template = HtmlService.createTemplateFromFile("Index");
  return template.evaluate()
    .setTitle("Laporan Kaset Alsut")
    .addMetaTag("viewport", "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * HTTP POST:
 * Endpoint utama API untuk Frontend Vercel.
 * Menerima payload JSON: { action: "getInitialData" | "checkDuplicate" | "saveReport", ... }
 */
function doPost(e) {
  var result = { success: false, message: "Request tidak valid" };

  try {
    var raw = (e && e.postData && e.postData.contents) ? e.postData.contents : "";
    var body = {};

    if (raw) {
      try {
        body = JSON.parse(raw);
      } catch (parseErr) {
        body = e.parameter || {};
      }
    } else if (e && e.parameter) {
      body = e.parameter;
    }

    var action = body.action || (e && e.parameter && e.parameter.action) || "";

    if (action === "getInitialData") {
      result = getInitialData();
    } else if (action === "checkDuplicate") {
      var nomorKaset = body.nomorKaset || (e && e.parameter && e.parameter.nomorKaset) || "";
      result = checkDuplicate(nomorKaset);
    } else if (action === "saveReport") {
      var payload = body.payload || body;
      result = saveReport(payload);
    } else {
      result = {
        success: false,
        message: "Aksi '" + action + "' tidak dikenali. Gunakan getInitialData, checkDuplicate, atau saveReport."
      };
    }

  } catch (err) {
    result = { success: false, message: "Kesalahan server doPost: " + err.message };
  }

  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Format tanggal dalam bahasa Indonesia (mis. "22 Okt 2026")
 */
function formatIndonesianDate(date) {
  var months = [
    "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
    "Jul", "Agu", "Sep", "Okt", "Nov", "Des"
  ];
  var day = Utilities.formatDate(date, CONFIG.TIMEZONE, "d");
  var monthIndex = parseInt(Utilities.formatDate(date, CONFIG.TIMEZONE, "M"), 10) - 1;
  var year = Utilities.formatDate(date, CONFIG.TIMEZONE, "yyyy");
  return day + " " + months[monthIndex] + " " + year;
}

/**
 * Sanitasi string untuk mencegah Formula Injection di Spreadsheet
 */
function sanitizeInput(val) {
  if (val === null || val === undefined) return "";
  var str = String(val).trim();
  if (/^[=+\-@]/.test(str)) {
    return "'" + str;
  }
  return str;
}

/**
 * Normalisasi S/N kaset ATM CRM
 */
function normalizeSN(raw) {
  if (!raw) return "";
  var str = String(raw).trim().toUpperCase();

  if (!CONFIG.SN_NORMALIZE) {
    return str;
  }

  str = str.replace(/^(SN\s*:|S\/N\s*:?)\s*/i, "").trim();

  var sabMatch = str.match(/SAB10[\s\-_]*(\d+)/i);
  if (sabMatch && sabMatch[1]) {
    return CONFIG.SN_PREFIX + sabMatch[1];
  }

  if (/^\d+$/.test(str)) {
    return CONFIG.SN_PREFIX + str;
  }

  return str;
}

/**
 * Mendapatkan data awal untuk form saat pertama dibuka:
 * - Tanggal hari ini (Asia/Jakarta, format ID)
 * - Daftar Type Mesin dari sheet "Type Mesin"
 * - Daftar Module dari sheet "Module"
 * - Daftar WSID dan LOKASI dari sheet "WSID"
 */
function getInitialData() {
  try {
    var ss = getSpreadsheet();
    var now = new Date();
    var todayFormatted = formatIndonesianDate(now);

    // 1. Baca Type Mesin
    var typeSheet = ss.getSheetByName(CONFIG.SHEET_NAME_TYPE);
    var typeMesinList = [];
    if (typeSheet && typeSheet.getLastRow() >= 2) {
      var rawTypes = typeSheet.getRange(2, 1, typeSheet.getLastRow() - 1, 1).getValues();
      var seenTypes = {};
      for (var i = 0; i < rawTypes.length; i++) {
        var tVal = String(rawTypes[i][0] || "").trim();
        if (tVal && !seenTypes[tVal]) {
          seenTypes[tVal] = true;
          typeMesinList.push(tVal);
        }
      }
    }
    if (typeMesinList.length === 0) {
      typeMesinList = ["Hyosung", "Hitachi", "OKI", "NCR", "YIHUA"];
    }

    // 2. Baca Module
    var moduleSheet = ss.getSheetByName(CONFIG.SHEET_NAME_MODULE);
    var moduleList = [];
    if (moduleSheet && moduleSheet.getLastRow() >= 2) {
      var rawModules = moduleSheet.getRange(2, 1, moduleSheet.getLastRow() - 1, 1).getValues();
      var seenModules = {};
      for (var m = 0; m < rawModules.length; m++) {
        var mCell = rawModules[m][0];
        if (mCell !== null && mCell !== undefined) {
          var mVal = String(mCell).trim();
          if (mVal && !seenModules[mVal]) {
            seenModules[mVal] = true;
            moduleList.push(mVal);
          }
        }
      }
    }
    if (moduleList.length === 0) {
      moduleList = ["1", "2", "3", "4", "5", "Reject", "Retract"];
    }

    // 3. Baca WSID dan LOKASI
    var wsidSheet = ss.getSheetByName(CONFIG.SHEET_NAME_WSID);
    var wsidList = [];
    if (wsidSheet && wsidSheet.getLastRow() >= 2) {
      var numWsid = wsidSheet.getLastRow() - 1;
      var rawWsid = wsidSheet.getRange(2, 1, numWsid, 2).getValues();
      var seenWsid = {};
      for (var w = 0; w < rawWsid.length; w++) {
        var wCode = String(rawWsid[w][0] || "").trim().toUpperCase();
        var wLokasi = String(rawWsid[w][1] || "").trim();
        if (wCode && !seenWsid[wCode]) {
          seenWsid[wCode] = true;
          wsidList.push([wCode, wLokasi]);
        }
      }
    }

    return {
      success: true,
      today: todayFormatted,
      typeMesinList: typeMesinList,
      moduleList: moduleList,
      wsidList: wsidList
    };

  } catch (err) {
    return {
      success: false,
      message: "Gagal mengambil data awal: " + err.message,
      today: formatIndonesianDate(new Date()),
      typeMesinList: [],
      moduleList: ["1", "2", "3", "4", "5", "Reject", "Retract"],
      wsidList: []
    };
  }
}

/**
 * Cek apakah Nomor Kaset sudah pernah dilaporkan sebelumnya di kolom D (Col 4)
 * Kolom A=WSID, B=Lokasi, C=Tanggal, D=Nomor Kaset
 */
function checkDuplicate(nomorKaset) {
  try {
    if (!nomorKaset) {
      return { success: true, isDuplicate: false };
    }

    var cleanKaset = String(nomorKaset).trim().toUpperCase();
    var ss = getSpreadsheet();
    var sheet = ss.getSheetByName(CONFIG.SHEET_NAME_REPORT);
    if (!sheet) {
      return { success: true, isDuplicate: false };
    }

    var lastRow = sheet.getLastRow();
    if (lastRow < CONFIG.FIRST_DATA_ROW) {
      return { success: true, isDuplicate: false };
    }

    var numRows = lastRow - CONFIG.FIRST_DATA_ROW + 1;
    // Kolom A-D (Col 1-4)
    var values = sheet.getRange(CONFIG.FIRST_DATA_ROW, 1, numRows, 4).getValues();

    for (var i = values.length - 1; i >= 0; i--) {
      var row = values[i];
      var existingKaset = String(row[3] || "").trim().toUpperCase();
      if (existingKaset === cleanKaset) {
        var existingWsid = String(row[0] || "-").trim();
        var existingLokasi = String(row[1] || "-").trim();
        var rawDate = row[2];
        var existingDate = "-";
        if (rawDate instanceof Date) {
          existingDate = formatIndonesianDate(rawDate);
        } else if (rawDate) {
          existingDate = String(rawDate).trim();
        }

        return {
          success: true,
          isDuplicate: true,
          duplicateInfo: {
            nomorKaset: cleanKaset,
            wsid: existingWsid,
            lokasi: existingLokasi,
            tanggal: existingDate,
            rowNumber: CONFIG.FIRST_DATA_ROW + i
          }
        };
      }
    }

    return { success: true, isDuplicate: false };

  } catch (err) {
    return {
      success: false,
      message: "Gagal memeriksa duplikasi: " + err.message
    };
  }
}

/**
 * Konversi base64 string menjadi Google Apps Script Blob
 */
function createPhotoBlob(base64String, safeFilename) {
  if (!base64String) return null;
  var contentType = "image/jpeg";
  var cleanBase64 = String(base64String || "").trim();

  var commaIndex = cleanBase64.indexOf(",");
  if (commaIndex !== -1) {
    var header = cleanBase64.substring(0, commaIndex);
    cleanBase64 = cleanBase64.substring(commaIndex + 1);
    var typeMatch = header.match(/data:([^;]+)/i);
    if (typeMatch && typeMatch[1]) {
      contentType = typeMatch[1].trim();
    }
  }

  cleanBase64 = cleanBase64.replace(/\s+/g, "");
  var decoded = Utilities.base64Decode(cleanBase64);
  var cleanName = (safeFilename || "foto.jpg").replace(/[^a-zA-Z0-9_\.]/g, "_");
  return Utilities.newBlob(decoded, contentType, cleanName);
}

/**
 * Penamaan file foto otomatis & terstruktur
 * Contoh: RESULT_TEST_Z005_WCR2063_20261023_151022.jpg
 */
function generateSafePhotoFilename(typePrefix, wsid, nomorKaset) {
  var now = new Date();
  var dateStr = Utilities.formatDate(now, CONFIG.TIMEZONE, "yyyyMMdd_HHmmss");
  var cleanWsid = String(wsid || "NOWSID").replace(/[^A-Za-z0-9]/g, "");
  var cleanKaset = String(nomorKaset || "NOKASET").replace(/[^A-Za-z0-9]/g, "");
  return typePrefix + "_" + cleanWsid + "_" + cleanKaset + "_" + dateStr + ".jpg";
}

/**
 * Menyisipkan gambar OverGridImage tepat pada kolom dan baris target
 * dengan nama file otomatis & terstruktur serta cell note
 */
function insertImageWithRetry(sheet, blob, col, row, width, height, filename, noteInfo) {
  var maxAttempts = 2;
  for (var attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      // Pastikan sel kosong dari teks agar gambar tampil rapi
      sheet.getRange(row, col).setValue("");

      var img = sheet.insertImage(blob, col, row);
      if (img) {
        try {
          if (width) img.setWidth(width);
          if (height) img.setHeight(height);
          if (filename) {
            img.setAltTextTitle(filename);
            img.setAltTextDescription(noteInfo || filename);
          }
        } catch (resizeErr) {}

        // Pasang catatan sel (Note) agar saat kursor diarahkan ke sel di Spreadsheet,
        // nama file terstruktur, WSID, dan nomor kaset langsung terlihat jelas
        if (noteInfo) {
          try {
            sheet.getRange(row, col).setNote(noteInfo);
          } catch (noteErr) {}
        }

        return img;
      }
    } catch (e) {
      Logger.log("Percobaan " + attempt + " insertImage gagal (Col " + col + ", Row " + row + "): " + e.message);
      if (attempt < maxAttempts) {
        Utilities.sleep(150);
      }
    }
  }
  return null;
}

/**
 * Pemetaan kolom dinamis pada sheet Format Laporan Kaset Rusak
 */
function getReportColumnMapping(sheet) {
  var headerRow = CONFIG.HEADER_ROW || 2;
  var lastCol = Math.max(sheet.getLastColumn(), 11);
  var headers = sheet.getRange(headerRow, 1, 1, lastCol).getValues()[0];

  var map = {
    wsid: 1,
    lokasi: 2,
    tanggal: 3,
    nomorKaset: 4,
    sn: 5,
    module: 6,
    typeMesin: 7,
    fotoTestCash: 8,
    fotoLabelBad: 9,
    cekCpc: 10,
    tglBongkaran: 11
  };

  for (var c = 0; c < headers.length; c++) {
    var txt = String(headers[c] || "").trim().toLowerCase();
    var colIdx = c + 1;
    if (/wsid/i.test(txt)) map.wsid = colIdx;
    else if (/lokasi/i.test(txt)) map.lokasi = colIdx;
    else if (/replenish|tgl.*replenish|tanggal/i.test(txt)) map.tanggal = colIdx;
    else if (/nomor.*kaset|barcode.*alsut|no.*kaset/i.test(txt)) map.nomorKaset = colIdx;
    else if (/s\/n|serial/i.test(txt)) map.sn = colIdx;
    else if (/module/i.test(txt)) map.module = colIdx;
    else if (/type.*mesin|tipe.*mesin/i.test(txt)) map.typeMesin = colIdx;
    else if (/result|test.*cash|fatal|layar/i.test(txt)) map.fotoTestCash = colIdx;
    else if (/label.*kaset|posisi.*modul|bad.*posisi/i.test(txt)) map.fotoLabelBad = colIdx;
    else if (/cek.*cpc/i.test(txt)) map.cekCpc = colIdx;
    else if (/tgl.*bongkaran|bongkaran/i.test(txt)) map.tglBongkaran = colIdx;
  }

  return map;
}

/**
 * Menyimpan laporan kaset dan menyisipkan 2 foto (Result Test Cash & Label Modul)
 * Dimensi sel: Lebar: 12,31 cm x Tinggi: 9,25 cm (465x350 px).
 * Dioptimasi tinggi untuk konkurensi 50+ pengguna (Blob dibuat di luar lock).
 */
function saveReport(payload) {
  if (!payload || typeof payload !== "object") {
    return { success: false, message: "Data laporan tidak valid." };
  }

  // 1. Sanitasi & Validasi cepat di memori SEBELUM mengunci script
  var wsid = String(payload.wsid || "").trim().toUpperCase();
  var lokasi = String(payload.lokasi || "").trim();
  var nomorKaset = String(payload.nomorKaset || "").trim().toUpperCase();
  var rawSN = String(payload.sn || "").trim();
  var normalizedSN = normalizeSN(rawSN);
  var moduleVal = String(payload.module !== null && payload.module !== undefined ? payload.module : "").trim();
  var typeMesin = String(payload.typeMesin || "").trim();
  var allowDuplicate = !!payload.allowDuplicate;

  if (!wsid || !nomorKaset || !normalizedSN || !moduleVal || !typeMesin) {
    return { success: false, message: "Semua kolom wajib diisi (WSID, Lokasi, Nomor Kaset, S/N, Module, Type Mesin)." };
  }

  if (!/^[A-Z0-9]{3,12}$/.test(wsid)) {
    return { success: false, message: "WSID harus terdiri dari 3-12 karakter huruf/angka." };
  }

  var serverDate = new Date();

  // 2. Dekode Base64 foto DI LUAR LOCK (menghemat waktu antrean lock ~300ms)
  var blobTestCash = null;
  var blobLabelBad = null;
  var fn1 = "";
  var fn2 = "";

  if (payload.fotoTestCash) {
    try {
      fn1 = generateSafePhotoFilename("RESULT_TEST", wsid, nomorKaset);
      blobTestCash = createPhotoBlob(payload.fotoTestCash, fn1);
    } catch (e1) {
      Logger.log("Gagal membuat blob fotoTestCash: " + e1.message);
    }
  }

  if (payload.fotoLabelBad) {
    try {
      fn2 = generateSafePhotoFilename("LABEL_MODUL", wsid, nomorKaset);
      blobLabelBad = createPhotoBlob(payload.fotoLabelBad, fn2);
    } catch (e2) {
      Logger.log("Gagal membuat blob fotoLabelBad: " + e2.message);
    }
  }

  // 3. Dapatkan referensi Spreadsheet di luar lock
  var ss = getSpreadsheet();
  var reportSheet = ss.getSheetByName(CONFIG.SHEET_NAME_REPORT);
  if (!reportSheet) {
    return {
      success: false,
      message: "Sheet '" + CONFIG.SHEET_NAME_REPORT + "' tidak ditemukan."
    };
  }

  var colMap = getReportColumnMapping(reportSheet);

  // 4. Dapatkan ScriptLock atomik dengan timeout 25 detik (mendukung 50+ user)
  var lock = LockService.getScriptLock();
  var lockAcquired = false;

  try {
    lockAcquired = lock.tryLock(25000);
    if (!lockAcquired) {
      return {
        success: false,
        message: "Sistem sedang melayani antrian penulisan. Silakan klik Simpan kembali."
      };
    }

    // 5. Cari baris kosong & periksa duplikasi dalam 1 kali pembacaan range
    var lastRow = reportSheet.getLastRow();
    var targetRow = CONFIG.FIRST_DATA_ROW;

    if (lastRow >= CONFIG.FIRST_DATA_ROW) {
      var numToCheck = lastRow - CONFIG.FIRST_DATA_ROW + 1;
      var dataCols = reportSheet.getRange(CONFIG.FIRST_DATA_ROW, 1, numToCheck, Math.max(colMap.nomorKaset, 4)).getValues();

      // Cek duplikasi nomor kaset jika belum disetujui pengguna
      if (!allowDuplicate) {
        for (var i = dataCols.length - 1; i >= 0; i--) {
          var exKaset = String(dataCols[i][colMap.nomorKaset - 1] || "").trim().toUpperCase();
          if (exKaset === nomorKaset) {
            var rawDate = dataCols[i][colMap.tanggal - 1];
            var exDate = (rawDate instanceof Date) ? formatIndonesianDate(rawDate) : String(rawDate || "-");

            lock.releaseLock();
            lockAcquired = false;

            return {
              success: false,
              isDuplicate: true,
              duplicateInfo: {
                nomorKaset: nomorKaset,
                wsid: String(dataCols[i][colMap.wsid - 1] || "-"),
                lokasi: String(dataCols[i][colMap.lokasi - 1] || "-"),
                tanggal: exDate
              }
            };
          }
        }
      }

      // Hitung baris target dari Kolom A yang sudah terisi
      var lastFilledOffset = -1;
      for (var r = dataCols.length - 1; r >= 0; r--) {
        if (dataCols[r][0] !== "" && dataCols[r][0] !== null && dataCols[r][0] !== undefined) {
          lastFilledOffset = r;
          break;
        }
      }
      targetRow = (lastFilledOffset === -1)
        ? CONFIG.FIRST_DATA_ROW
        : (CONFIG.FIRST_DATA_ROW + lastFilledOffset + 1);
    }

    // Pastikan kapasitas baris cukup
    var maxRows = reportSheet.getMaxRows();
    if (targetRow > maxRows) {
      reportSheet.insertRowsAfter(maxRows, 50);
    }

    // 6. Siapkan nilai kolom teks (kolom foto dikosongkan agar OverGridImage rapi)
    var maxColsToWrite = Math.max(colMap.typeMesin, colMap.fotoTestCash || 8, colMap.fotoLabelBad || 9, 9);
    var rowValues = [];
    for (var c = 0; c < maxColsToWrite; c++) rowValues.push("");

    rowValues[colMap.wsid - 1] = sanitizeInput(wsid);
    rowValues[colMap.lokasi - 1] = sanitizeInput(lokasi);
    rowValues[colMap.tanggal - 1] = serverDate;
    rowValues[colMap.nomorKaset - 1] = sanitizeInput(nomorKaset);
    rowValues[colMap.sn - 1] = sanitizeInput(normalizedSN);
    rowValues[colMap.module - 1] = sanitizeInput(moduleVal);
    rowValues[colMap.typeMesin - 1] = sanitizeInput(typeMesin);

    // Tulis data teks langsung
    reportSheet.getRange(targetRow, 1, 1, maxColsToWrite).setValues([rowValues]);
    reportSheet.getRange(targetRow, colMap.tanggal).setNumberFormat(CONFIG.DATE_NUMBER_FORMAT);

    // 7. Atur dimensi sel presisi Lebar: 12,31 cm x Tinggi: 9,25 cm
    reportSheet.setRowHeight(targetRow, CONFIG.PHOTO_CELL_HEIGHT);
    if (colMap.fotoTestCash) {
      reportSheet.setColumnWidth(colMap.fotoTestCash, CONFIG.PHOTO_CELL_WIDTH);
    }
    if (colMap.fotoLabelBad) {
      reportSheet.setColumnWidth(colMap.fotoLabelBad, CONFIG.PHOTO_CELL_WIDTH);
    }

    // 8. Sisipkan kedua foto langsung ke koordinat sel masing-masing
    var dateFormattedStr = formatIndonesianDate(serverDate);
    if (blobTestCash && colMap.fotoTestCash) {
      var note1 = "File: " + fn1 + "\nKategori: Result Test Cash (Layar ATM Error Code/Fatal)\nWSID: " + wsid + "\nNomor Kaset: " + nomorKaset + "\nTanggal: " + dateFormattedStr;
      insertImageWithRetry(reportSheet, blobTestCash, colMap.fotoTestCash, targetRow, CONFIG.PHOTO_CELL_WIDTH, CONFIG.PHOTO_CELL_HEIGHT, fn1, note1);
    }
    if (blobLabelBad && colMap.fotoLabelBad) {
      var note2 = "File: " + fn2 + "\nKategori: Kaset dengan Label Bad\nWSID: " + wsid + "\nNomor Kaset: " + nomorKaset + "\nTanggal: " + dateFormattedStr;
      insertImageWithRetry(reportSheet, blobLabelBad, colMap.fotoLabelBad, targetRow, CONFIG.PHOTO_CELL_WIDTH, CONFIG.PHOTO_CELL_HEIGHT, fn2, note2);
    }

    // Lepas lock secepatnya setelah penulisan selesai
    lock.releaseLock();
    lockAcquired = false;

    return {
      success: true,
      message: "Laporan kaset dan foto berhasil disimpan.",
      data: {
        rowNumber: targetRow,
        wsid: wsid,
        lokasi: lokasi,
        tanggal: formatIndonesianDate(serverDate),
        nomorKaset: nomorKaset,
        sn: normalizedSN,
        module: moduleVal,
        typeMesin: typeMesin,
        hasPhotoTestCash: !!blobTestCash,
        hasPhotoLabelBad: !!blobLabelBad
      }
    };

  } catch (err) {
    return {
      success: false,
      message: "Terjadi kesalahan server saat menyimpan: " + err.message
    };
  } finally {
    if (lockAcquired) {
      try {
        lock.releaseLock();
      } catch (e) {}
    }
  }
}
