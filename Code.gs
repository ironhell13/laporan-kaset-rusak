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
  SN_PREFIX: "SAB10"
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
 * Menyimpan laporan kaset ke baris kosong berikutnya di sheet "Format Laporan Kaset Rusak"
 * Kolom A-G diisi PKT, Kolom H-I (CCAS) tidak disentuh sama sekali.
 * Sangat dioptimasi untuk penanganan 20 pengguna bersamaan (Hold lock < 200ms).
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

  if (!wsid || !nomorKaset || !normalizedSN || !moduleVal || !typeMesin) {
    return { success: false, message: "Semua kolom wajib diisi (WSID, Lokasi, Nomor Kaset, S/N, Module, Type Mesin)." };
  }

  if (!/^[A-Z0-9]{3,12}$/.test(wsid)) {
    return { success: false, message: "WSID harus terdiri dari 3-12 karakter huruf/angka." };
  }

  var serverDate = new Date();

  // Siapkan data baris (7 kolom: Col A sampai Col G)
  var rowData = [[
    sanitizeInput(wsid),
    sanitizeInput(lokasi),
    serverDate,
    sanitizeInput(nomorKaset),
    sanitizeInput(normalizedSN),
    sanitizeInput(moduleVal),
    sanitizeInput(typeMesin)
  ]];

  var formats = [["@", "@", CONFIG.DATE_NUMBER_FORMAT, "@", "@", "@", "@"]];

  // 2. Dapatkan ScriptLock untuk penulisan atomik tanpa tabrakan baris
  var lock = LockService.getScriptLock();
  var lockAcquired = false;

  try {
    lockAcquired = lock.tryLock(30000);
    if (!lockAcquired) {
      return {
        success: false,
        message: "Sistem sedang sibuk melayani antrian. Silakan coba submit kembali."
      };
    }

    var ss = getSpreadsheet();
    var reportSheet = ss.getSheetByName(CONFIG.SHEET_NAME_REPORT);
    if (!reportSheet) {
      return {
        success: false,
        message: "Sheet '" + CONFIG.SHEET_NAME_REPORT + "' tidak ditemukan."
      };
    }

    // Cari baris kosong berikutnya hanya dengan membaca Kolom A (sangat cepat ~10ms)
    var lastRow = reportSheet.getLastRow();
    var targetRow = CONFIG.FIRST_DATA_ROW;

    if (lastRow >= CONFIG.FIRST_DATA_ROW) {
      var numToCheck = lastRow - CONFIG.FIRST_DATA_ROW + 1;
      var colA = reportSheet.getRange(CONFIG.FIRST_DATA_ROW, 1, numToCheck, 1).getValues();
      var lastFilledOffset = -1;
      for (var r = colA.length - 1; r >= 0; r--) {
        if (colA[r][0] !== "" && colA[r][0] !== null && colA[r][0] !== undefined) {
          lastFilledOffset = r;
          break;
        }
      }
      targetRow = (lastFilledOffset === -1)
        ? CONFIG.FIRST_DATA_ROW
        : (CONFIG.FIRST_DATA_ROW + lastFilledOffset + 1);
    }

    if (targetRow > reportSheet.getMaxRows()) {
      reportSheet.insertRowsAfter(reportSheet.getMaxRows(), 10);
    }

    // Tulis ke kolom A-G (Cols 1-7)
    var targetRange = reportSheet.getRange(targetRow, 1, 1, 7);
    targetRange.setNumberFormats(formats);
    targetRange.setValues(rowData);

    // Pastikan tersimpan segera
    SpreadsheetApp.flush();

    return {
      success: true,
      message: "Laporan kaset berhasil disimpan.",
      data: {
        rowNumber: targetRow,
        wsid: wsid,
        lokasi: lokasi,
        tanggal: formatIndonesianDate(serverDate),
        nomorKaset: nomorKaset,
        sn: normalizedSN,
        module: moduleVal,
        typeMesin: typeMesin
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
