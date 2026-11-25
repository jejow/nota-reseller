import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseOrder, parseAmount } from '../docs/import.mjs';
import {
  createState,
  today,
  cleanInvoice,
  cleanClaim,
  cleanExpense,
  priceDetails,
  financialReport,
  warrantyFor,
  nextNumber,
  composeMessage,
  readBackup,
  mergeBackup,
  csvString,
} from '../docs/model.mjs';

const day = '2026-11-25';
const sampleEmail = 'akun@contoh.test';

test('supplier receipt keeps foreign currency separate and reads the account', () => {
  const input = [
    'Order has been paid',
    'Order code: PAY-CONTOH',
    'Purchase date: 14/11/2026 18:34:39',
    'Product: ChatGPT Plus 1M GPay BH24H',
    'Quantity: 1',
    'Amount: 100000 VND',
    'Attached data:',
    sampleEmail + '|SandiContoh|KEY-CONTOH',
  ].join('\n');
  const order = parseOrder(input);
  assert.deepEqual(order.meta.amount, { original: '100000 VND', idr: null });
  assert.equal(order.meta.date, '2026-11-14');
  assert.equal(order.meta.product, 'ChatGPT Plus 1 Bulan');
  assert.equal(order.meta.status, undefined);
  assert.equal(order.accounts[0].email, sampleEmail);
  assert.equal(parseAmount('Rp 80.000,00').idr, 80000);
});

test('change-mail report pairs verification by exact email and skips failures', () => {
  const raw = [
    '=== Sukses (1) ===',
    sampleEmail + '|sandi|KEY',
    sampleEmail + '+https://contoh.test/kode?t=simulasi',
    'orang-lain@contoh.test----https://contoh.test/tidak-cocok',
    '=== Gagal (1) ===',
    'gagal@contoh.test|sandi|KEY',
  ].join('\n');
  const record = parseOrder(raw);
  assert.equal(record.accounts.length, 1);
  assert.equal(record.accounts[0].verification, 'https://contoh.test/kode?t=simulasi');
  assert.equal(record.warnings.length, 2);
});

test('CSV, JSON and labelled text retain the same account fields', () => {
  const csv = 'email,password,2fa\n' + sampleEmail + ',"sandi,contoh",KEY\n';
  const json = JSON.stringify({ accounts: [{ email: sampleEmail, password: 'sandi,contoh', '2fa': 'KEY' }] });
  const text = 'Email: ' + sampleEmail + '\nPassword: sandi,contoh\n2FA Key: KEY';
  assert.deepEqual(parseOrder(csv).accounts, parseOrder(json).accounts);
  assert.deepEqual(parseOrder(text).accounts, parseOrder(csv).accounts);
  assert.equal(parseOrder('Order ID: ORDER-A\n' + csv + '\nOrder ID: ORDER-B').conflict, true);
  assert.equal(parseOrder('curl https://contoh.test\nAuthorization: Bearer KEY-CONTOH').accounts.length, 0);
});

test('AIS dash separators keep the exact account email and pair its OTP link', () => {
  const verification = 'https://otp.example.test/api/v1/mailboxes/address%40mail.test/code?ref=example';
  const raw = sampleEmail + '|Pass!?#|JBSWY3DPEHPK3PXP\n' + sampleEmail + '----' + verification;
  const { accounts, warnings } = parseOrder(raw);
  assert.deepEqual(accounts, [
    { email: sampleEmail, password: 'Pass!?#', key: 'JBSWY3DPEHPK3PXP', verification },
  ]);
  assert.deepEqual(warnings, []);
});

test('shop exports extract Base32 from a 2FA URL and distinguish the email OTP link', () => {
  const key = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';
  const generator = 'https://2fa.example.test/' + key;
  const verification = 'https://otp.example.test/code?email=akun%40contoh.test';
  for (const separator of ['|', '----', ':']) {
    const raw = [
      'Shop Order Delivery',
      'Order ID: TEST-123',
      'Hướng dẫn đăng nhập',
      'https://guide.example.test/example',
      '1. ' + [sampleEmail, 'Sandi&khusus', generator].join(separator),
      'Link OTP Email: ' + verification,
    ].join('\n');
    assert.deepEqual(parseOrder(raw).accounts, [
      { email: sampleEmail, password: 'Sandi&khusus', key, verification },
    ]);
  }
  const labelled = [
    '📧 Email: ' + sampleEmail,
    'Password: Sandi:khusus',
    'Authenticator Key: otpauth://totp/Contoh?secret=' + key.toLowerCase(),
    'https://guide.example.test/support',
  ].join('\n');
  assert.deepEqual(parseOrder(labelled).accounts, [
    { email: sampleEmail, password: 'Sandi:khusus', key, verification: '' },
  ]);
});

function invoice(fields = {}) {
  return cleanInvoice({
    id: 'inv-a',
    number: 'JUU-261125-053',
    date: day,
    paymentDate: day,
    status: 'paid',
    packageId: 'short',
    packageLabel: 'Garansi 3 Hari',
    warrantyDays: 3,
    price: 80000,
    qty: 2,
    unitCost: 50000,
    discount: 5000,
    fee: 2000,
    ...fields,
  });
}

test('report assigns payments, refunds, claim costs, and credits to their own dates', () => {
  const state = createState();
  const sale = invoice({ refund: 15000, refundDate: '2026-12-01' });
  state.invoices.push(sale, invoice({ id: 'inv-b', qty: 1, status: 'pending' }));
  state.claims.push(
    cleanClaim({
      id: 'claim-a',
      number: 'JUU-GR-261125-001',
      date: day,
      costDate: day,
      cost: 18000,
      reimbursement: 5000,
      reimbursementDate: '2026-12-02',
      packageId: 'short',
    }),
  );
  state.expenses.push(cleanExpense({ id: 'fee-a', date: day, name: 'Promosi', amount: 10000 }));
  assert.equal(priceDetails(sale).gross, 40000);
  const month = financialReport(state, { start: '2026-11-01', end: '2026-11-30' });
  assert.equal(month.totals.revenue, 155000);
  assert.equal(month.totals.gross, 55000);
  assert.equal(month.totals.net, 25000);
  assert.equal(month.packages.short.net, 35000);
  assert.equal(month.receivable, 75000);
  const december = financialReport(state, { start: '2026-12-01', end: '2026-12-31' });
  assert.equal(december.totals.net, -10000);
  state.invoices.push(invoice({ id: 'inv-c', unitCost: null }));
  assert.equal(financialReport(state, {}).totals.missing, 1);
});

test('invoice numbers, warranty dates, and separate editable templates', () => {
  const state = createState();
  assert.equal(state.settings.packages.short.price, 80000);
  assert.equal(state.settings.packages.full.price, 120000);
  assert.equal(nextNumber(state, 'invoice', day).number, 'JUU-261125-053');
  assert.equal(warrantyFor(invoice(), '2026-11-28').tone, 'green');
  assert.equal(warrantyFor(invoice(), '2026-11-29').tone, 'red');
  state.settings.invoiceTemplate = '{{nomor}} | {{total}} | {{bagian_akun}}';
  state.settings.claimTemplate = '{{status}} → {{nomor_invoice}}';
  const draft = { ...invoice(), accounts: parseOrder(sampleEmail + '|Sandi|KUNCI').accounts };
  assert.match(composeMessage('invoice', draft, state), /JUU-261125-053 \| Rp155\.000.*DETAIL AKUN/s);
  assert.equal(
    composeMessage(
      'claim',
      { date: day, status: 'resolved', invoiceNumber: draft.number, packageId: 'short' },
      state,
    ),
    'Selesai → JUU-261125-053',
  );
});

test('a new ledger starts empty and the calendar rolls over at midnight WIB', () => {
  assert.equal(today(new Date('2026-11-25T16:59:59Z')), '2026-11-25');
  assert.equal(today(new Date('2026-11-25T17:00:00Z')), '2026-11-26');
  const report = financialReport(createState(), {});
  assert.equal(report.events.length, 0);
  assert.equal(report.totals.revenue, 0);
  assert.equal(report.totals.net, 0);
});

test('invoice copy follows payment status and fills the order date and account sections', () => {
  const state = createState();
  const order = {
    ...invoice(),
    number: '',
    accounts: parseOrder(sampleEmail + '|Sandi|KUNCI').accounts,
    customer: 'Rani',
  };
  const paid = composeMessage('invoice', order, state);
  assert.match(paid, /Pembayaran Diterima!/);
  assert.match(paid, /Order ID: JUU-261125-053\nTanggal: 25 Nov 2026\nQuantity: 2 akun\nPelanggan: Rani/);
  assert.match(paid, /DETAIL AKUN.*CARA LOGIN.*ATURAN PENTING.*SYARAT & KETENTUAN GARANSI/s);
  assert.doesNotMatch(paid, /\{\{|\n{3,}/);

  const pending = composeMessage('invoice', { ...order, status: 'pending', accounts: [] }, state);
  assert.match(pending, /Invoice Pembayaran.*Silakan lakukan pembayaran/s);
  assert.doesNotMatch(pending, /Pembayaran Diterima|DETAIL AKUN|CARA LOGIN/);
});

test('invoice includes package validity and claim instructions with default or custom templates', () => {
  const state = createState();
  const paid = composeMessage('invoice', invoice(), state);
  assert.match(paid, /SYARAT & KETENTUAN GARANSI.*28 Nov 2026.*Sertakan Order ID/s);
  const full = invoice({ packageId: 'full', packageLabel: 'Full Garansi', warrantyDays: null });
  assert.match(composeMessage('invoice', full, state), /Full Garansi berlaku selama masa aktif paket/);

  state.settings.terms = 'Laporkan kendala ke admin.';
  state.settings.invoiceTemplate = 'Invoice {{nomor}}';
  assert.match(
    composeMessage('invoice', full, state),
    /SYARAT & KETENTUAN GARANSI.*Laporkan kendala ke admin/s,
  );
  state.settings.invoiceTemplate = 'Masa aktif: {{garansi}}\nTerima kasih.';
  assert.match(
    composeMessage('invoice', full, state),
    /masa aktif paket\.\nLaporkan kendala ke admin\.\nTerima kasih/,
  );
  state.settings.invoiceTemplate = 'Ketentuan toko\n{{ketentuan}}';
  assert.equal(composeMessage('invoice', full, state), 'Ketentuan toko\nLaporkan kendala ke admin.');
});

test('the earlier standard warranty text upgrades when reading a saved ledger', () => {
  const state = createState();
  const currentTerms = state.settings.terms;
  state.settings.terms =
    'Simpan Order ID untuk pengajuan klaim. Jika ada kendala, sertakan Order ID dan jelaskan kendalanya. Pelanggaran ketentuan penggunaan layanan dapat membatalkan garansi.';
  assert.equal(readBackup(state).settings.terms, currentTerms);
});

test('claim copy responds to its status and mentions a replacement only when provided', () => {
  const state = createState();
  const claim = cleanClaim({
    date: day,
    invoiceNumber: 'JUU-261124-052',
    packageLabel: 'Full Garansi',
    issue: 'Akses bermasalah',
    resolution: 'Hasil peninjauan',
  });
  const message = (status, accounts = []) => composeMessage('claim', { ...claim, status, accounts }, state);
  assert.match(message('filed'), /Order ID: JUU-261124-052.*Pengajuan garansi sudah kami terima/s);
  assert.match(message('processing'), /Klaim Anda sedang diperiksa/);
  assert.match(message('resolved'), /Klaim garansi Anda sudah ditangani/);
  assert.doesNotMatch(message('resolved'), /akun pengganti/i);
  const accounts = parseOrder(sampleEmail + '|Sandi|KUNCI').accounts;
  assert.match(message('resolved', accounts), /AKUN PENGGANTI.*Silakan coba masuk dengan akun pengganti/s);
  assert.match(message('rejected'), /belum dapat kami setujui.*Alasan keputusan: Hasil peninjauan/s);
});

test('reading a backup retains custom message templates and recorded turnover', () => {
  const state = createState();
  state.settings.invoiceTemplate = 'Invoice versi toko {{nomor}}';
  state.settings.claimTemplate = 'Klaim versi toko {{nomor_klaim}}';
  state.settings.terms = 'Ketentuan toko.';
  state.settings.loginGuide = '';
  state.invoices.push(invoice());
  const restored = readBackup(state);
  assert.equal(restored.settings.invoiceTemplate, state.settings.invoiceTemplate);
  assert.equal(restored.settings.claimTemplate, state.settings.claimTemplate);
  assert.equal(restored.settings.terms, state.settings.terms);
  assert.equal(restored.settings.loginGuide, '');
  assert.equal(financialReport(restored, {}).totals.revenue, 155000);
});

test('backup excludes raw data and older copies cannot restore deleted rows', () => {
  const base = createState();
  base.invoices.push({
    ...invoice({ updatedAt: '2026-11-25T10:00:00.000Z' }),
    raw: 'not-in-backup',
    accounts: [{ password: 'not-in-backup' }],
  });
  const read = readBackup(base);
  assert.equal(Object.hasOwn(read.invoices[0], 'accounts'), false);
  assert.equal(Object.hasOwn(read.invoices[0], 'raw'), false);
  const current = createState();
  current.deleted['inv-a'] = '2026-11-25T11:00:00.000Z';
  assert.equal(mergeBackup(current, read).invoices.length, 0);
  assert.equal(csvString([['=1+1', -50]]), '\uFEFF"\'=1+1",-50');
});
