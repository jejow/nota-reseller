export const STORAGE_KEY = 'nota-reseller.v1';
export const PACKAGES = ['short', 'full'];
export const PAYMENT = { pending: 'Menunggu', paid: 'Lunas', cancelled: 'Batal' };
export const CLAIM = { filed: 'Diajukan', processing: 'Diproses', resolved: 'Selesai', rejected: 'Ditolak' };
export const EXPENSES = ['Operasional', 'Promosi', 'Langganan', 'Lainnya'];

const rupiah = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 });
const jakarta = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Jakarta',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
const shortDate = new Intl.DateTimeFormat('id-ID', {
  timeZone: 'UTC',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

export const money = (value) => `${value < 0 ? '−' : ''}Rp${rupiah.format(Math.abs(value || 0))}`;
export const today = () => jakarta.format(new Date());
export const formatDate = (value) =>
  validDate(value) ? shortDate.format(new Date(`${value}T00:00:00Z`)) : '—';
export const validDate = (value) => {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\d$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
};

export function addDays(date, days) {
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

export const invoiceTemplate = `*{{judul_pembayaran}}*
*{{toko}} · {{nomor}}*

Pelanggan: {{pelanggan}}
Tanggal: {{tanggal}}
Produk: {{produk}}
Paket: {{paket}}
Jumlah: {{jumlah}} akun
Harga per akun: {{harga_satuan}}
{{baris_diskon}}
Total: *{{total}}*
Status: {{status}}
{{baris_pembayaran}}
{{baris_refund}}

{{bagian_akun}}
{{baris_panduan}}

*SYARAT GARANSI*
{{garansi}}
{{ketentuan}}

{{catatan}}
Terima kasih sudah order di {{toko}}! {{kontak_toko}}`;

export const claimTemplate = `*UPDATE KLAIM GARANSI*
*{{toko}} · {{nomor_klaim}}*

Invoice asal: {{nomor_invoice}}
Pelanggan: {{pelanggan}}
Tanggal klaim: {{tanggal}}
Paket: {{paket}}
Status: *{{status}}*
{{baris_keluhan}}
{{baris_solusi}}

{{bagian_akun}}
{{baris_panduan}}

{{garansi}}
{{catatan}}
{{kontak_toko}}`;

const DEFAULT_SETTINGS = {
  business: 'JUU',
  prefix: 'JUU',
  product: 'ChatGPT Plus 1 Bulan',
  contact: '',
  paymentInfo: '',
  loginGuide:
    'Gunakan email dan password pada detail akun untuk masuk. Jika diminta verifikasi, ikuti metode yang tercantum di detail akun.',
  terms:
    'Simpan nomor invoice untuk pengajuan klaim. Gunakan akun sesuai ketentuan layanan. Jika ada kendala akses, hubungi admin dengan menyertakan nomor invoice dan penjelasan kendalanya.',
  packages: {
    short: { label: 'Garansi 3 Hari', price: 80000, cost: null, days: 3 },
    full: { label: 'Full Garansi', price: 120000, cost: null, days: null },
  },
  invoiceTemplate,
  claimTemplate,
};

export function createState() {
  return {
    version: 1,
    updatedAt: '',
    settingsAt: '',
    nextInvoice: 53,
    nextClaim: 1,
    settings: structuredClone(DEFAULT_SETTINGS),
    invoices: [],
    claims: [],
    expenses: [],
    deleted: {},
  };
}

export function newId() {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now().toString(36)}-${globalThis.crypto.getRandomValues(new Uint32Array(3)).join('-')}`
  );
}

export function nextNumber(state, type, date) {
  const isClaim = type === 'claim';
  const prefix = state.settings.prefix + (isClaim ? '-GR' : '');
  const key = isClaim ? 'nextClaim' : 'nextInvoice';
  const taken = new Set(state[isClaim ? 'claims' : 'invoices'].map((record) => record.number));
  const day = validDate(date) ? date : today();
  let sequence = state[key];
  let number;
  do {
    number = `${prefix}-${day.slice(2).replaceAll('-', '')}-${String(sequence++).padStart(3, '0')}`;
  } while (taken.has(number));
  return { number, next: sequence };
}

export function priceDetails(invoice) {
  const running = integer(invoice.price) * integer(invoice.qty, 0, 1000);
  const discount = Math.min(running, integer(invoice.discount));
  const total = running - discount;
  const fee = integer(invoice.fee);
  const cost =
    invoice.unitCost === null || invoice.unitCost === '' || invoice.unitCost === undefined
      ? null
      : integer(invoice.unitCost) * integer(invoice.qty, 0, 1000);
  const refund = Math.min(total, integer(invoice.refund, 0, 1000000000000));
  const revenue = total - refund;
  return {
    running,
    discount,
    total,
    fee,
    cost,
    refund,
    revenue,
    gross: cost === null ? null : revenue - cost,
    net: cost === null ? null : revenue - cost - fee,
  };
}

export function paymentLabel(invoice) {
  if (invoice.status === 'paid' && invoice.refund > 0) {
    return priceDetails(invoice).refund === priceDetails(invoice).total ? 'Refund penuh' : 'Refund sebagian';
  }
  return PAYMENT[invoice.status] ?? PAYMENT.pending;
}

export function warrantyFor(invoice, now = today()) {
  if (!invoice) return { label: 'Belum terhubung', tone: 'muted', message: '' };
  const label = invoice.packageLabel;
  if (invoice.status === 'pending') {
    return {
      label: 'Menunggu pembayaran',
      tone: 'amber',
      message: `${label} mulai setelah pembayaran diterima.`,
    };
  }
  if (invoice.status === 'cancelled' || paymentLabel(invoice) === 'Refund penuh') {
    return {
      label: 'Tidak aktif',
      tone: 'muted',
      message: `Garansi untuk invoice ${invoice.number} tidak aktif.`,
    };
  }
  const start = invoice.paymentDate || invoice.date;
  const end =
    invoice.warrantyEnd ||
    (invoice.warrantyDays && validDate(start) ? addDays(start, invoice.warrantyDays) : '');
  if (!end)
    return { label: 'Selama masa aktif', tone: 'green', message: `${label} berlaku selama masa aktif paket.` };
  if (now > end)
    return { label: 'Kedaluwarsa', tone: 'red', end, message: `${label} berakhir pada ${formatDate(end)}.` };
  return { label: 'Aktif', tone: 'green', end, message: `${label} berlaku sampai ${formatDate(end)}.` };
}

export function dateRange(period = 'month', start = '', end = '', now = today()) {
  if (period === 'all') return { start: '', end: '' };
  if (period === 'custom') return { start, end };
  if (period === 'week') return { start: addDays(now, -6), end: now };
  const first = `${now.slice(0, 7)}-01`;
  if (period === 'previous') {
    const last = addDays(first, -1);
    return { start: `${last.slice(0, 7)}-01`, end: last };
  }
  return { start: first, end: now };
}

export const within = (date, range) =>
  Boolean(date) && (!range.start || date >= range.start) && (!range.end || date <= range.end);

export function financialReport(state, range) {
  const events = [];
  for (const invoice of state.invoices) {
    if (invoice.status !== 'paid') continue;
    const detail = priceDetails(invoice);
    const common = { id: invoice.id, reference: invoice.number, packageId: invoice.packageId };
    events.push({
      ...common,
      date: invoice.paymentDate || invoice.date,
      kind: 'sale',
      label: 'Penjualan',
      description: invoice.customer || invoice.product,
      revenue: detail.total,
      cost: detail.cost,
      fee: detail.fee,
      quantity: invoice.qty,
    });
    if (detail.refund)
      events.push({
        ...common,
        date: invoice.refundDate || invoice.paymentDate || invoice.date,
        kind: 'refund',
        label: 'Refund',
        description: invoice.customer || invoice.product,
        revenue: -detail.refund,
        cost: 0,
        fee: 0,
      });
  }
  for (const claim of state.claims) {
    if (claim.cost)
      events.push({
        id: claim.id,
        reference: claim.number,
        date: claim.costDate || claim.date,
        kind: 'claim',
        label: 'Biaya garansi',
        description: claim.customer || claim.invoiceNumber,
        packageId: claim.packageId,
        revenue: 0,
        cost: 0,
        fee: claim.cost,
      });
    if (claim.reimbursement)
      events.push({
        id: claim.id,
        reference: claim.number,
        date: claim.reimbursementDate || claim.costDate || claim.date,
        kind: 'credit',
        label: 'Kredit supplier',
        description: claim.customer || claim.invoiceNumber,
        packageId: claim.packageId,
        revenue: 0,
        cost: 0,
        fee: -claim.reimbursement,
      });
  }
  for (const expense of state.expenses)
    events.push({
      id: expense.id,
      reference: '',
      date: expense.date,
      kind: 'expense',
      label: expense.category,
      description: expense.name,
      revenue: 0,
      cost: 0,
      fee: expense.amount,
    });

  const scoped = events
    .filter((event) => within(event.date, range))
    .sort((a, b) => b.date.localeCompare(a.date));
  const totals = {
    revenue: 0,
    cost: 0,
    fee: 0,
    operating: 0,
    warranty: 0,
    refund: 0,
    gross: 0,
    net: 0,
    sales: 0,
    missing: 0,
  };
  const packages = Object.fromEntries(
    PACKAGES.map((id) => [id, { revenue: 0, quantity: 0, gross: 0, net: 0, missing: 0 }]),
  );
  for (const event of scoped) {
    const packageTotal = packages[event.packageId];
    totals.revenue += event.revenue;
    totals.cost += event.cost ?? 0;
    if (event.kind === 'sale') {
      totals.sales++;
      totals.fee += event.fee;
      totals.missing += Number(event.cost === null);
      packageTotal.quantity += event.quantity;
      packageTotal.missing += Number(event.cost === null);
    }
    if (event.kind === 'refund') totals.refund -= event.revenue;
    if (event.kind === 'expense') totals.operating += event.fee;
    if (event.kind === 'claim' || event.kind === 'credit') totals.warranty += event.fee;
    if (packageTotal) {
      packageTotal.revenue += event.revenue;
      packageTotal.gross += event.revenue - (event.cost ?? 0);
      packageTotal.net += event.revenue - (event.cost ?? 0) - event.fee;
    }
  }
  totals.gross = totals.revenue - totals.cost;
  totals.net = totals.gross - totals.fee - totals.operating - totals.warranty;
  const pending = state.invoices.filter((i) => i.status === 'pending' && within(i.date, range));
  return {
    events: scoped,
    totals,
    packages,
    receivable: pending.reduce((sum, i) => sum + priceDetails(i).total, 0),
    pending: pending.length,
  };
}

export function trendPoints(events, range, now = today()) {
  const dates = events.map((e) => e.date).sort();
  const last = range.end || dates.at(-1) || now;
  const first = range.start || dates[0] || addDays(last, -6);
  const days = Math.max(1, Math.round((Date.parse(last) - Date.parse(first)) / 86400000) + 1);
  const width = Math.ceil(days / Math.min(days, 7));
  const buckets = [];
  for (let offset = 0; offset < days; offset += width) {
    buckets.push({ date: addDays(first, offset), revenue: 0, net: 0 });
  }
  for (const event of events) {
    const offset = Math.floor((Date.parse(event.date) - Date.parse(first)) / 86400000 / width);
    const bucket = buckets[offset];
    if (!bucket) continue;
    bucket.revenue += event.revenue;
    bucket.net += event.revenue - (event.cost ?? 0) - event.fee;
  }
  return buckets;
}

export const VARIABLES = {
  invoice: {
    toko: 'Nama toko',
    nomor: 'Nomor invoice',
    tanggal: 'Tanggal invoice',
    pelanggan: 'Pelanggan',
    produk: 'Produk',
    paket: 'Paket garansi',
    jumlah: 'Jumlah akun',
    harga_satuan: 'Harga per akun',
    total: 'Total tagihan',
    status: 'Status pembayaran',
    judul_pembayaran: 'Judul pembayaran',
    baris_diskon: 'Diskon jika ada',
    baris_pembayaran: 'Cara bayar',
    baris_refund: 'Detail refund',
    bagian_akun: 'Detail akun',
    baris_panduan: 'Panduan akses akun',
    garansi: 'Masa garansi',
    ketentuan: 'Ketentuan garansi',
    catatan: 'Catatan untuk pelanggan',
    kontak_toko: 'Kontak admin',
  },
  claim: {
    toko: 'Nama toko',
    nomor_klaim: 'Nomor klaim',
    nomor_invoice: 'Invoice asal',
    tanggal: 'Tanggal klaim',
    pelanggan: 'Pelanggan',
    paket: 'Paket garansi',
    status: 'Status klaim',
    baris_keluhan: 'Keluhan',
    baris_solusi: 'Tindakan',
    bagian_akun: 'Akun pengganti',
    baris_panduan: 'Panduan akses akun',
    garansi: 'Masa garansi',
    catatan: 'Catatan untuk pelanggan',
    kontak_toko: 'Kontak admin',
  },
};

export function accountBlock(accounts, claim) {
  const details = accounts
    .filter((account) => account.email)
    .map((account, index, all) =>
      [
        all.length > 1 ? `Akun ${index + 1}` : '',
        `Email: ${account.email}`,
        account.password ? `Password: ${account.password}` : '',
        account.key ? `2FA Key: ${account.key}` : '',
        account.verification ? `Link verifikasi email: ${account.verification}` : '',
      ]
        .filter(Boolean)
        .join('\n'),
    );
  return details.length ? `*${claim ? 'AKUN PENGGANTI' : 'DETAIL AKUN'}*\n${details.join('\n\n')}` : '';
}

export function composeMessage(type, draft, state) {
  const { settings } = state;
  const isClaim = type === 'claim';
  const linked = isClaim ? state.invoices.find((i) => i.id === draft.invoiceId) : draft;
  const warranty = warrantyFor(linked);
  const accounts = accountBlock(draft.accounts ?? [], isClaim);
  const values = {
    toko: settings.business,
    tanggal: formatDate(draft.date),
    pelanggan: draft.customer || 'Pelanggan',
    paket: draft.packageLabel || settings.packages[draft.packageId].label,
    bagian_akun: accounts,
    baris_panduan: accounts && settings.loginGuide ? `\n*PANDUAN AKSES*\n${settings.loginGuide}` : '',
    garansi: warranty.message,
    catatan: draft.messageNote || '',
    kontak_toko: settings.contact ? `Hubungi admin di ${settings.contact}.` : '',
  };
  if (isClaim)
    Object.assign(values, {
      nomor_klaim: draft.number || nextNumber(state, type, draft.date).number,
      nomor_invoice: linked?.number || draft.invoiceNumber || '—',
      status: CLAIM[draft.status],
      baris_keluhan: draft.issue ? `Keluhan: ${draft.issue}` : '',
      baris_solusi: draft.resolution ? `Tindakan: ${draft.resolution}` : '',
    });
  else {
    const detail = priceDetails(draft);
    const status = paymentLabel(draft);
    const title =
      {
        Lunas: 'Pembayaran Diterima!',
        'Refund penuh': 'Konfirmasi Refund',
        'Refund sebagian': 'Konfirmasi Refund Sebagian',
        Batal: 'Invoice Dibatalkan',
      }[status] || 'Invoice Pembayaran';
    Object.assign(values, {
      nomor: draft.number || nextNumber(state, type, draft.date).number,
      produk: draft.product || settings.product,
      jumlah: draft.qty,
      harga_satuan: money(draft.price),
      total: money(detail.total),
      status,
      judul_pembayaran: title,
      ketentuan: settings.terms,
      baris_diskon: detail.discount ? `Diskon: ${money(detail.discount)}` : '',
      baris_pembayaran:
        draft.status === 'pending' && settings.paymentInfo ? `Pembayaran: ${settings.paymentInfo}` : '',
      baris_refund:
        draft.status === 'paid' && detail.refund
          ? `Refund: ${money(detail.refund)} · ${formatDate(draft.refundDate)}`
          : '',
    });
  }
  return settings[isClaim ? 'claimTemplate' : 'invoiceTemplate']
    .replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (full, key) =>
      Object.hasOwn(values, key) ? String(values[key] ?? '') : full,
    )
    .replace(/[\t ]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const str = (value, max = 300) => (typeof value === 'string' ? value.trim().slice(0, max) : '');
const integer = (value, min = 0, max = 1000000000) =>
  Math.min(max, Math.max(min, Math.round(Number(value) || 0)));
const nullable = (value, min = 0, max = 1000000000) =>
  value === null || value === undefined || value === '' ? null : integer(value, min, max);
const dateOr = (value, fallback = '') => (validDate(value) ? value : fallback);
const oneOf = (value, values, fallback) => (values.includes(value) ? value : fallback);
const base = (record) => ({
  id: str(record.id, 100),
  number: str(record.number, 80),
  date: dateOr(record.date, today()),
  createdAt: str(record.createdAt, 50),
  updatedAt: str(record.updatedAt, 50),
});

export function cleanInvoice(record) {
  const invoice = {
    ...base(record),
    customer: str(record.customer),
    product: str(record.product),
    contact: str(record.contact, 100),
    supplierRef: str(record.supplierRef, 120),
    supplierAmount: str(record.supplierAmount, 80),
    supplierDate: dateOr(record.supplierDate),
    packageId: oneOf(record.packageId, PACKAGES, 'short'),
    packageLabel: str(record.packageLabel, 80),
    warrantyDays: nullable(record.warrantyDays, 1, 3650),
    warrantyEnd: dateOr(record.warrantyEnd),
    qty: integer(record.qty, 1, 1000),
    price: integer(record.price),
    unitCost: nullable(record.unitCost),
    discount: integer(record.discount),
    fee: integer(record.fee),
    status: oneOf(record.status, Object.keys(PAYMENT), 'pending'),
    paymentDate: dateOr(record.paymentDate),
    refund: integer(record.refund, 0, 1000000000000),
    refundDate: dateOr(record.refundDate),
    paymentMethod: str(record.paymentMethod, 80),
    notes: str(record.notes, 1000),
  };
  if (invoice.status === 'paid') invoice.paymentDate ||= invoice.date;
  else Object.assign(invoice, { paymentDate: '', refund: 0, refundDate: '' });
  const detail = priceDetails(invoice);
  invoice.discount = detail.discount;
  invoice.refund = detail.refund;
  invoice.refundDate = invoice.refund ? invoice.refundDate || invoice.paymentDate : '';
  return invoice;
}

export function cleanClaim(record) {
  return {
    ...base(record),
    invoiceId: str(record.invoiceId, 100),
    invoiceNumber: str(record.invoiceNumber, 80),
    customer: str(record.customer),
    contact: str(record.contact, 100),
    product: str(record.product),
    packageId: oneOf(record.packageId, PACKAGES, 'short'),
    packageLabel: str(record.packageLabel, 80),
    status: oneOf(record.status, Object.keys(CLAIM), 'filed'),
    issue: str(record.issue, 1000),
    resolution: str(record.resolution, 1000),
    cost: integer(record.cost),
    costDate: dateOr(record.costDate, dateOr(record.date, today())),
    reimbursement: integer(record.reimbursement),
    reimbursementDate: dateOr(record.reimbursementDate, dateOr(record.costDate, dateOr(record.date, today()))),
  };
}

export function cleanExpense(record) {
  return {
    ...base(record),
    name: str(record.name),
    amount: integer(record.amount),
    category: oneOf(record.category, EXPENSES, 'Lainnya'),
    notes: str(record.notes, 1000),
  };
}

export function cleanSettings(values) {
  const defaults = createState().settings;
  return {
    business: str(values.business, 60) || defaults.business,
    prefix:
      str(values.prefix, 14)
        .toUpperCase()
        .replace(/[^A-Z0-9-]/g, '') || defaults.prefix,
    product: str(values.product) || defaults.product,
    contact: str(values.contact, 120),
    paymentInfo: str(values.paymentInfo, 700),
    terms: str(values.terms, 2200),
    loginGuide: typeof values.loginGuide === 'string' ? str(values.loginGuide, 1600) : defaults.loginGuide,
    packages: Object.fromEntries(
      PACKAGES.map((id) => {
        const p = values.packages?.[id] ?? defaults.packages[id];
        return [
          id,
          {
            label: str(p.label, 60) || defaults.packages[id].label,
            price: integer(p.price),
            cost: nullable(p.cost),
            days: nullable(p.days, 1, 3650),
          },
        ];
      }),
    ),
    invoiceTemplate: str(values.invoiceTemplate, 10000) || invoiceTemplate,
    claimTemplate: str(values.claimTemplate, 10000) || claimTemplate,
  };
}

export function readBackup(data) {
  if (
    data?.version !== 1 ||
    !data.settings ||
    !['invoices', 'claims', 'expenses'].every((key) => Array.isArray(data[key]))
  ) {
    throw new Error('File ini bukan cadangan Nota Reseller yang valid.');
  }
  const mapping = { invoices: cleanInvoice, claims: cleanClaim, expenses: cleanExpense };
  const records = {};
  const validId = (value) =>
    typeof value === 'string' &&
    /^[a-z0-9_-]{1,100}$/i.test(value) &&
    !['__proto__', 'constructor', 'prototype'].includes(value);
  for (const [key, clean] of Object.entries(mapping)) {
    const ids = new Set();
    records[key] = data[key].map((value) => {
      if (
        !value ||
        !validId(value.id) ||
        !validDate(value.date) ||
        (key !== 'expenses' && !str(value.number, 80))
      ) {
        throw new Error('Ada data transaksi yang tidak lengkap di dalam cadangan.');
      }
      const record = clean(value);
      if (ids.has(record.id)) throw new Error('Cadangan berisi ID transaksi ganda.');
      ids.add(record.id);
      return record;
    });
  }
  const deleted = Object.fromEntries(
    Object.entries(data.deleted ?? {}).filter(
      ([id, timestamp]) => validId(id) && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(timestamp),
    ),
  );
  return {
    version: 1,
    updatedAt: str(data.updatedAt, 50),
    settingsAt: str(data.settingsAt, 50),
    nextInvoice: integer(data.nextInvoice || 53, 1, 99999999),
    nextClaim: integer(data.nextClaim, 1, 99999999),
    settings: cleanSettings(data.settings),
    ...records,
    deleted,
  };
}

export function mergeBackup(current, incoming) {
  const next = structuredClone(current);
  for (const [id, stamp] of Object.entries(incoming.deleted)) {
    if (!Object.hasOwn(next.deleted, id) || stamp > next.deleted[id]) next.deleted[id] = stamp;
  }
  for (const key of ['invoices', 'claims', 'expenses']) {
    const records = new Map(next[key].map((record) => [record.id, record]));
    for (const item of incoming[key]) {
      const existing = records.get(item.id);
      if (!existing || item.updatedAt > existing.updatedAt) records.set(item.id, item);
    }
    next[key] = [...records.values()].filter(
      (record) => !Object.hasOwn(next.deleted, record.id) || record.updatedAt > next.deleted[record.id],
    );
  }
  const invoices = new Set(next.invoices.map((record) => record.id));
  for (const claim of next.claims) if (claim.invoiceId && !invoices.has(claim.invoiceId)) claim.invoiceId = '';
  if (incoming.settingsAt > next.settingsAt || !next.updatedAt) {
    next.settings = incoming.settings;
    next.settingsAt = incoming.settingsAt;
  }
  next.nextInvoice = Math.max(current.nextInvoice, incoming.nextInvoice);
  next.nextClaim = Math.max(current.nextClaim, incoming.nextClaim);
  return next;
}

export function csvString(rows) {
  return (
    '\uFEFF' +
    rows
      .map((row) =>
        row
          .map((value) => {
            if (typeof value === 'number') return String(value);
            const cell = String(value ?? '');
            const plain = /^[=+\-@\t\r]/.test(cell.trimStart()) ? `'${cell}` : cell;
            return `"${plain.replaceAll('"', '""')}"`;
          })
          .join(','),
      )
      .join('\r\n')
  );
}

export function exampleState(now = today()) {
  const example = createState();
  const monthDay = Number(now.slice(-2));
  const offsets = [0, 1, 2, 3, 5, 7, 9, 11, 12, 14, 16, 18, 21, 23];
  const people = [
    'Alif Ramadhan',
    'Nadia Putri',
    'Bayu Saputra',
    'Maya Sari',
    'Rizky Pratama',
    'Dina Amelia',
    'Fajar Maulana',
  ];
  const groups = [
    'full',
    'short',
    'full',
    'short',
    'short',
    'full',
    'full',
    'short',
    'short',
    'full',
    'short',
    'full',
    'short',
    'full',
  ];
  const amounts = [2, 3, 1, 2, 2, 3, 2, 1, 2, 2, 1, 2, 1, 1];
  example.invoices = offsets.map((offset, index) => {
    const date = addDays(now, -Math.min(offset, monthDay - 1));
    const packageId = groups[index];
    const settings = example.settings.packages[packageId];
    return cleanInvoice({
      id: `contoh-invoice-${index}`,
      number: `JUU-${date.slice(2).replaceAll('-', '')}-${String(66 - index).padStart(3, '0')}`,
      status: index === 1 ? 'pending' : 'paid',
      date,
      paymentDate: date,
      customer: people[index % people.length],
      packageId,
      packageLabel: settings.label,
      product: example.settings.product,
      warrantyDays: settings.days,
      price: settings.price,
      qty: amounts[index],
      unitCost: packageId === 'short' ? 48500 : 72000,
      discount: index % 4 === 0 ? 5000 : 0,
      fee: 2500,
    });
  });
  example.claims = [
    cleanClaim({
      id: 'contoh-klaim',
      number: 'JUU-GR-CONTOH',
      date: now,
      customer: 'Alif Ramadhan',
      invoiceId: example.invoices[0].id,
      invoiceNumber: example.invoices[0].number,
      packageId: 'full',
      packageLabel: 'Full Garansi',
      status: 'processing',
      issue: 'Ada kendala akses',
      cost: 18000,
    }),
  ];
  example.expenses = [
    cleanExpense({ id: 'contoh-biaya-1', date: now, name: 'Promosi toko', amount: 38000, category: 'Promosi' }),
    cleanExpense({
      id: 'contoh-biaya-2',
      date: addDays(now, -Math.min(5, monthDay - 1)),
      name: 'Biaya operasional',
      amount: 25000,
      category: 'Operasional',
    }),
  ];
  return example;
}
