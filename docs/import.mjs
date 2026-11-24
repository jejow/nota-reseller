import { validDate } from './model.mjs';

export const SAMPLE_TEXT = 'contoh@pelanggan.example|SandiContoh!|KUNCI-CONTOH';
export const MAX_IMPORT = 8 * 1024 * 1024;
export const MAX_TEXT = 250000;

const emailSource = "[a-z0-9.!#$%&'*+/=?^_\x60{|}~-]+@[a-z0-9-]+(?:\\.[a-z0-9-]+)+";
const emailOnly = new RegExp('^' + emailSource + '$', 'i');
const pairedLink = new RegExp('^(' + emailSource + ')(?:-{3,}|\\+|\\s*[:=]\\s*)(https?://\\S+)$', 'i');
const labelKey = (value) =>
  String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
const first = (...values) =>
  values.find((value) => value !== undefined && value !== null && String(value).trim()) ?? '';
const trimmed = (value, max = 1000) =>
  String(value ?? '')
    .trim()
    .slice(0, max);

export function parseAmount(value) {
  const original = trimmed(value, 80);
  if (!original) return null;
  const letters = original.match(/[A-Za-z]+/g) ?? [];
  const foreignSymbol = /\p{Sc}/u.test(original);
  const isIdr = !foreignSymbol && letters.every((word) => /^(IDR|Rp|rb|ribu|k)$/i.test(word));
  if (!isIdr) return { original, idr: null };
  let amount = original.replace(/[^\d.,k-]/gi, '');
  const thousands = /(?:k|rb|ribu)\s*$/i.test(original);
  amount = amount.replace(/k$/i, '');
  if (!amount || amount.startsWith('-')) return { original, idr: null };
  if (thousands) amount = amount.replace(',', '.');
  else amount = amount.replace(/[,.]\d{2}$/, '').replace(/[,.]/g, '');
  const idr = Math.round(Number(amount) * (thousands ? 1000 : 1));
  return { original, idr: Number.isSafeInteger(idr) ? idr : null };
}

function parseDate(value) {
  const text = trimmed(value);
  const iso = text.match(/^(\d{4})-(\d\d)-(\d\d)/);
  const dayFirst = text.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})\b/);
  const sortable =
    iso?.[0] ||
    (dayFirst && [dayFirst[3], dayFirst[2].padStart(2, '0'), dayFirst[1].padStart(2, '0')].join('-'));
  return validDate(sortable) ? sortable : '';
}

function normalizeLink(value) {
  try {
    const link = new URL(trimmed(value, 3000));
    return ['https:', 'http:'].includes(link.protocol) ? link.href : '';
  } catch {
    return '';
  }
}

const accountAliases = {
  email: ['email', 'emailakun', 'accountemail', 'alamatemail', 'username', 'user', 'loginemail'],
  password: ['password', 'pass', 'pw', 'sandi', 'katasandi', 'accountpassword'],
  key: ['2fa', '2fakey', 'key2fa', 'secret', 'secretkey', 'authenticator', 'totp', 'totpsecret'],
  verification: [
    'verification',
    'verificationurl',
    'verificationlink',
    'linkverifikasiemail',
    'linkverifikasi',
    'linkemail',
    'linkkodeemail',
    'emailverificationlink',
    'getcode',
    'getcodelink',
    'verificationemaillink',
    'emaillink',
  ],
};
const metadataAliases = {
  reference: [
    'ordercode',
    'orderid',
    'idpesanan',
    'kodepesanan',
    'nomororder',
    'supplierref',
    'referensisupplier',
    'nomorinvoice',
  ],
  date: [
    'purchasedate',
    'orderdate',
    'tanggal',
    'tanggalinvoice',
    'tanggalpembelian',
    'tanggalpesanan',
    'date',
  ],
  customer: ['customer', 'pelanggan', 'customerinformation', 'namapelanggan', 'buyer', 'pembeli'],
  product: ['product', 'produk', 'namaproduk', 'item'],
  qty: ['quantity', 'jumlah', 'qty', 'jumlahakun', 'kuantitas'],
  amount: ['amount', 'totalamount', 'supplieramount', 'modaltotal', 'totalsupplier'],
  packageHint: ['plan', 'paket', 'package', 'warranty', 'garansi'],
};

const fieldFor = (label, aliases) => Object.keys(aliases).find((name) => aliases[name].includes(label));
const objectFields = (object) =>
  Object.fromEntries(Object.entries(object).map(([key, value]) => [labelKey(key), value]));
const aliasValue = (fields, aliases) => first(...aliases.map((alias) => fields[alias]));

function makeAccount(fields) {
  const email = trimmed(fields.email, 320);
  return emailOnly.test(email)
    ? {
        email,
        password: trimmed(fields.password, 500),
        key: trimmed(fields.key, 600),
        verification: normalizeLink(fields.verification),
      }
    : null;
}

function csvRows(text, delimiter) {
  const rows = [];
  let row = [],
    field = '',
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (quoted || !field) quoted = !quoted;
      else field += '"';
    } else if (!quoted && (char === delimiter || char === '\n')) {
      row.push(field);
      field = '';
      if (char === '\n') {
        rows.push(row);
        row = [];
      }
    } else field += char;
  }
  if (field || row.length) rows.push([...row, field]);
  return rows;
}

export function parseOrder(raw, filename = '') {
  const input = String(raw || '')
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .trim();
  const result = { accounts: [], meta: {}, warnings: [], conflict: false };
  if (!input) return result;
  if (input.length > MAX_TEXT) {
    return { ...result, conflict: true, warnings: ['Teks terlalu panjang. Gunakan satu order per impor.'] };
  }
  const known = new Map();
  const links = new Map();
  const references = new Set();
  let receiptCount = 0;
  let skippedFailed = 0;
  let technical = false;

  function remember(fields) {
    const account = makeAccount(fields);
    if (!account || known.size >= 1000) return;
    const key = account.email.toLowerCase();
    const earlier = known.get(key);
    if (!earlier) known.set(key, account);
    else {
      for (const name of ['password', 'key', 'verification']) {
        if (!earlier[name] && account[name]) earlier[name] = account[name];
      }
    }
  }

  function metadata(name, value) {
    const clean = trimmed(value, 250);
    if (!clean || /^(?:none|not provided|n\/a|tidak ada|—|-)$/i.test(clean)) return;
    if (name === 'reference') {
      if (/^[a-z0-9][a-z0-9._/-]{2,79}$/i.test(clean)) {
        references.add(clean.toLowerCase());
        result.meta.reference ||= clean;
      }
    } else if (name === 'date') result.meta.date ||= parseDate(clean);
    else if (name === 'qty') {
      const rank = clean.match(/^\d{1,4}(?:\s*(?:akun|unit|pcs))?$/i);
      if (rank) result.meta.qty ||= Math.min(1000, Number(rank[0].match(/^\d+/)[0]));
    } else if (name === 'amount') result.meta.amount ||= parseAmount(clean);
    else if (name === 'packageHint') {
      if (/full\s*(?:garansi|warranty)|garansi\s*full/i.test(clean)) result.meta.packageId ||= 'full';
      if (/(?:garansi|warranty)?\s*\b3\s*(?:hari|days)\b/i.test(clean)) result.meta.packageId ||= 'short';
    } else if (name === 'product' && /\bchatgpt plus 1m\b/i.test(clean)) {
      result.meta.product ||= 'ChatGPT Plus 1 Bulan';
    } else result.meta[name] ||= clean;
  }

  function readObject(value, includeAccounts = true) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return;
    const fields = objectFields(value);
    for (const [name, aliases] of Object.entries(metadataAliases)) metadata(name, aliasValue(fields, aliases));
    if (includeAccounts)
      remember(
        Object.fromEntries(
          Object.entries(accountAliases).map(([name, aliases]) => [name, aliasValue(fields, aliases)]),
        ),
      );
  }

  let parsedStructured = false;
  if (/^[{\[]/.test(input)) {
    try {
      const data = JSON.parse(input);
      const rows = Array.isArray(data) ? data : first(data.accounts, data.akun, data.data);
      if (!Array.isArray(data)) readObject(data, !Array.isArray(rows));
      if (Array.isArray(rows)) rows.forEach((row) => readObject(row));
      parsedStructured = true;
    } catch {
      if (/\.json$/i.test(filename)) {
        return {
          ...result,
          warnings: ['JSON tidak valid. Periksa struktur file atau tempel data akun sebagai teks.'],
        };
      }
    }
  }

  const lines = input.split('\n');
  if (!parsedStructured) {
    const header = lines[0].trim();
    for (const delimiter of [',', ';', '\t', '|']) {
      const columns = csvRows(header, delimiter)[0]?.map(labelKey) ?? [];
      if (columns.length < 2 || !columns.some((column) => accountAliases.email.includes(column))) continue;
      const [, ...rows] = csvRows(input, delimiter);
      rows.forEach((row) =>
        readObject(Object.fromEntries(columns.map((column, index) => [column, row[index]]))),
      );
      parsedStructured = true;
      break;
    }
  }

  if (!parsedStructured) {
    let active = {};
    let failedSection = false;
    for (const baseLine of lines) {
      let line = baseLine.trim();
      if (!line) continue;
      if (/^={2,}\s*(?:gagal|failed)\b/i.test(line)) {
        remember(active);
        active = {};
        failedSection = true;
        continue;
      }
      if (/^={2,}\s*(?:sukses|berhasil|success)\b/i.test(line)) {
        failedSection = false;
        continue;
      }
      if (failedSection) {
        if (line.includes('@')) skippedFailed++;
        continue;
      }
      if (/^(?:shop order delivery|order has been paid)$/i.test(line)) receiptCount++;
      if (
        /^\s*(?:curl\b|(?:-H\s+)?["']?Authorization:|Bearer\s|api[ _-]?key\s*[:=]|sk-[\w-]{15,})/i.test(line)
      ) {
        technical = true;
        continue;
      }
      line = line.replace(/^(?:[*_>]+\s*|\d+[.)]\s+)/, '');
      line = line.replace(/^(?:attached data|account|akun)\s*:\s*/i, '');
      if (!line) continue;
      const pair = line.match(pairedLink);
      if (pair) {
        links.set(pair[1].toLowerCase(), normalizeLink(pair[2]));
        continue;
      }
      const label = line.match(/^([^:=|@]{1,45})[:=]\*?\s*(.+)$/);
      if (label) {
        const name = labelKey(label[1]);
        const accountField = fieldFor(name, accountAliases);
        if (accountField) {
          if (accountField === 'email') {
            remember(active);
            active = {};
          }
          active[accountField] = label[2];
          continue;
        }
        const metaField = fieldFor(name, metadataAliases);
        if (metaField) {
          metadata(metaField, label[2].replace(/\*$/, ''));
          continue;
        }
      }

      const parts = line.includes('|')
        ? line.split('|')
        : line.includes('\t')
          ? line.split('\t')
          : line.includes(';')
            ? csvRows(line, ';')[0]
            : line.includes(',')
              ? csvRows(line, ',')[0]
              : line.match(new RegExp('^(' + emailSource + '):(.*)$', 'i'))?.slice(1);
      if (parts?.length >= 2 && emailOnly.test(parts[0].trim())) {
        remember(active);
        const lastFields =
          parts.length === 2 && !/[|,;\t]/.test(line) ? parts[1].split(/:(?!(?:\/\/))/, 2) : parts.slice(1);
        active = {
          email: parts[0],
          password: lastFields[0],
          key: normalizeLink(lastFields[1]) ? '' : lastFields[1],
          verification: normalizeLink(lastFields[2]) || normalizeLink(lastFields[1]),
        };
        remember(active);
        continue;
      }
      if (emailOnly.test(line)) {
        remember(active);
        active = { email: line };
      } else if (active.email && normalizeLink(line)) active.verification ||= normalizeLink(line);
    }
    remember(active);
  }

  if (references.size > 1 || receiptCount > 1) {
    return {
      ...result,
      conflict: true,
      meta: {},
      warnings: ['Beberapa nomor order terdeteksi. Tempel data satu order saja agar akun tidak tercampur.'],
    };
  }
  if (!result.meta.reference)
    result.meta.reference =
      filename.match(/^(AIS-[\w-]+|data_[\w-]+)\.[^.]+$/i)?.[1]?.replace(/^data_/i, '') || '';
  result.accounts = [...known.values()].map((account) => ({
    ...account,
    verification: account.verification || links.get(account.email.toLowerCase()) || '',
  }));
  if ([...links.keys()].some((email) => !known.has(email))) {
    result.warnings.push(
      'Ada tautan verifikasi untuk email yang tidak cocok. Periksa email sebelum menambahkan tautannya secara manual.',
    );
  }
  if (skippedFailed) result.warnings.push('Bagian gagal pada laporan ganti email dilewati.');
  if (technical) result.warnings.push('Perintah curl dan kunci API di luar kolom akun dilewati.');
  if (result.meta.amount?.idr === null)
    result.warnings.push('Nominal supplier memakai mata uang asing. Isi modal dalam rupiah.');
  if (!result.accounts.length && !result.warnings.length) {
    result.warnings.push(
      'Belum ada baris akun yang dikenali. Masukkan email, password, dan 2FA dalam satu baris atau isi detail akun manual.',
    );
  }
  return result;
}

export async function readImportFile(file) {
  if (file.size > MAX_IMPORT) throw new Error('Maksimal 8 MB per file.');
  const type = file.name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  if (!['txt', 'csv', 'tsv', 'json', 'pdf'].includes(type)) {
    throw new Error('Pilih file TXT, CSV, TSV, JSON, atau PDF berisi teks.');
  }
  if (type !== 'pdf') {
    const data = new Uint8Array(await file.arrayBuffer());
    const decoder = new TextDecoder(
      data[0] === 255 && data[1] === 254
        ? 'utf-16le'
        : data[0] === 254 && data[1] === 255
          ? 'utf-16be'
          : 'utf-8',
    );
    const text = decoder.decode(data);
    if (text.length > MAX_TEXT) throw new Error('File teks terlalu panjang. Gunakan satu order per file.');
    return text;
  }
  const pdfjs = await import('./vendor/pdf.min.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('./vendor/pdf.worker.min.mjs', import.meta.url).href;
  let document;
  try {
    document = await pdfjs.getDocument({
      data: await file.arrayBuffer(),
      isEvalSupported: false,
      disableFontFace: true,
      stopAtErrors: true,
    }).promise;
  } catch (error) {
    throw new Error(
      error.name === 'PasswordException'
        ? 'PDF terkunci. Gunakan salinan tanpa kata sandi atau tempel teksnya.'
        : 'PDF tidak bisa dibuka. Periksa file atau tempel teksnya.',
    );
  }
  let text = '';
  try {
    if (document.numPages > 50) throw new Error('PDF maksimal 50 halaman per impor.');
    for (let i = 1; i <= document.numPages; i++) {
      const page = await document.getPage(i);
      const content = await page.getTextContent();
      let last = null;
      for (const item of content.items) {
        if (!('str' in item)) continue;
        if (last && !last.hasEOL) {
          const step = Math.abs(last.transform[5] - item.transform[5]);
          const gap = item.transform[4] - last.transform[4] - last.width;
          if (step > Math.max(3, item.height * 0.35)) text += '\n';
          else if (gap > Math.max(2, item.height * 0.15)) text += ' ';
        }
        text += item.str + (item.hasEOL ? '\n' : '');
        last = item;
      }
      text += '\n';
      if (text.length > MAX_TEXT) throw new Error('Isi PDF terlalu panjang. Gunakan satu order per file.');
    }
  } finally {
    await document.destroy();
  }
  if (!text.trim())
    throw new Error('PDF ini tidak memiliki teks yang bisa dibaca. Salin teksnya atau unggah file TXT.');
  return text.trim();
}
