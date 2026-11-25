import { icon } from './icons.mjs';
import {
  money,
  formatDate,
  PAYMENT,
  CLAIM,
  PACKAGES,
  EXPENSES,
  VARIABLES,
  priceDetails,
  paymentLabel,
  warrantyFor,
  nextNumber,
  composeMessage,
} from './model.mjs?v=owner-access';

export const esc = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (char) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[char],
  );
const is = (value) => (value ? ' checked' : '');
const hide = (value) => (value ? ' hidden' : '');
const selectOption = (value, label, current) =>
  `<option value="${esc(value)}"${value === current ? ' selected' : ''}>${esc(label)}</option>`;
export const btn = (label, glyph, action, style = 'outline', other = '') =>
  `<button class="btn btn-${style}" type="button" data-action="${action}" ${other}>${glyph ? icon(glyph) : ''}${esc(label)}</button>`;
const iconButton = (label, glyph, action, id = '') =>
  btn(
    '',
    glyph,
    action,
    'plain btn-icon',
    `aria-label="${esc(label)}" title="${esc(label)}" data-id="${esc(id)}"`,
  );
const badge = (label, tone = 'muted') =>
  `<span class="badge ${tone}"><i class="badge-mark" aria-hidden="true"></i>${esc(label)}</span>`;
const tag = (invoice) => `<span class="tag ${invoice.packageId}">${esc(invoice.packageLabel)}</span>`;
const banner = (message, tone = '', glyph = 'info') =>
  `<div class="banner ${tone}">${icon(glyph)}<p>${esc(message)}</p></div>`;
const tile = (glyph, tone = '') => `<span class="tile-icon ${tone}">${icon(glyph)}</span>`;

const NAV = {
  dashboard: ['Ringkasan', 'dashboard'],
  invoice: ['Buat invoice', 'receipt'],
  claim: ['Klaim garansi', 'shield'],
  history: ['Riwayat', 'history'],
  finance: ['Keuangan', 'wallet'],
  settings: ['Pengaturan', 'settings'],
};

const brand = () => `<button class="brand" type="button" data-action="nav" data-id="dashboard">
  <span class="brand-mark">${icon('receipt')}</span><span class="brand-text">Nota Reseller<small>Panel penjualan</small></span>
</button>`;

export function syncControl(sync) {
  const [label, glyph] = {
    loading: ['Menghubungkan', 'clock'],
    ready: ['Tersinkron', 'checkCircle'],
    saving: ['Menyimpan', 'clock'],
    error: ['Coba sinkron', 'alert'],
  }[sync.phase];
  return btn(label, glyph, 'sync-now', 'outline btn-sm sync-link', 'title="Sinkronkan sekarang"');
}

export function chrome(view, state, sync) {
  const navButton = (
    id,
    label = NAV[id][0],
  ) => `<button type="button" class="nav-link ${id === view ? 'active' : ''}"
    ${id === view ? 'aria-current="page"' : ''} data-action="nav" data-id="${id}">${icon(NAV[id][1])}<span>${label}</span></button>`;
  return {
    sidebar: `${brand()}<nav class="sidebar-nav" aria-label="Navigasi utama">
      <p class="nav-label">Ruang kerja</p>${['dashboard', 'invoice', 'claim', 'history', 'finance'].map((id) => navButton(id)).join('')}
      <p class="nav-label">Preferensi</p>${navButton('settings')}
    </nav><div class="side-foot">${icon('lock')}<span>Pembukuan privat</span></div>`,
    topbar: `<div class="breadcrumbs"><span>Ruang kerja</span>${icon('chevronRight')}<strong>${NAV[view][0]}</strong></div>
      <div class="mobile-brand">${brand()}</div>
      <div class="top-actions">
        <div id="sync-control" class="sync-control">${syncControl(sync)}</div>
        <button class="workspace-profile" type="button" data-action="nav" data-id="settings" aria-label="Pengaturan toko">
          <span class="avatar">${esc(state.settings.business.slice(0, 3).toUpperCase())}</span>
          <span class="profile-name">${esc(state.settings.business)}</span>
        </button>
      </div>`,
    bottom: `${navButton('dashboard')}${navButton('invoice', 'Invoice')}${navButton('claim', 'Garansi')}${navButton('finance')}
      <button class="nav-link ${['history', 'settings'].includes(view) ? 'active' : ''}" type="button" data-action="mobile-menu"
        aria-haspopup="dialog">${icon('more')}<span>Lainnya</span></button>`,
  };
}

export function ownerGate(checking, phase, message) {
  const panel = checking
    ? phase === 'error'
      ? `<h1>Pembukuan belum bisa dibuka</h1>
        <p>Periksa koneksi, lalu coba lagi.</p>
        <div class="actions">${btn('Coba lagi', 'history', 'sync-now', 'primary')}${btn('Keluar', '', 'owner-logout', 'plain')}</div>`
      : '<h1>Membuka pembukuan</h1><p role="status">Memeriksa sesi dan memuat data…</p>'
    : `<h1>Masuk ke pembukuan</h1>
      <form id="owner-login" class="stack" method="post">
        <label class="field"><span>Username</span>
          <input name="username" type="text" required maxlength="80" autocomplete="username" autocapitalize="none" spellcheck="false"></label>
        <label class="field"><span>Kata sandi</span>
          <input name="password" type="password" required maxlength="256" autocomplete="current-password"></label>
        <label class="check-label"><input type="checkbox" name="remember" checked> Ingat perangkat ini</label>
        <button class="btn btn-primary owner-submit" type="submit">${icon('lock')}Masuk</button>
        <p id="owner-status" class="field-help" role="status">${esc(message)}</p>
      </form>`;
  return `<section class="card owner-panel" id="cloud-empty" aria-label="Akses pemilik">
    <div class="owner-brand"><span class="brand-mark">${icon('receipt')}</span><span>Nota Reseller</span></div>
    ${panel}
  </section>`;
}

const pageHead = (title, subtitle, actions = '') => `<header class="page-head">
  <div><h1>${esc(title)}</h1><p>${esc(subtitle)}</p></div><div class="page-actions">${actions}</div>
</header>`;

function periodFields(ui) {
  return `<div class="period"><label class="period-select">${icon('calendar')}
    <select data-control="period" aria-label="Periode laporan">
      ${Object.entries({
        month: 'Bulan ini',
        week: '7 hari terakhir',
        previous: 'Bulan lalu',
        all: 'Semua tanggal',
        custom: 'Tanggal khusus',
      })
        .map(([key, value]) => selectOption(key, value, ui.period))
        .join('')}
    </select></label>
    ${
      ui.period === 'custom'
        ? `<div class="period-dates">
      <input type="date" data-control="periodStart" value="${esc(ui.periodStart)}" aria-label="Tanggal mulai" max="${esc(ui.periodEnd)}">
      <span>s/d</span><input type="date" data-control="periodEnd" value="${esc(ui.periodEnd)}" aria-label="Tanggal akhir" min="${esc(ui.periodStart)}">
    </div>`
        : ''
    }
  </div>`;
}

function metric(label, value, detail, glyph, tone = '', className = '') {
  return `<article class="metric"><div class="metric-top"><h2 class="metric-label">${label}</h2>
    <span class="metric-icon ${tone}">${icon(glyph)}</span></div>
    <div class="metric-value ${className}">${money(value)}</div>
    <div class="metric-detail ${className === 'positive' ? 'up' : ''}">${esc(detail)}</div></article>`;
}

function metrics(report) {
  const t = report.totals;
  const margin = t.revenue > 0 ? (t.net / t.revenue) * 100 : null;
  const percent =
    margin === null
      ? 'Setelah biaya'
      : `${new Intl.NumberFormat('id-ID', { maximumFractionDigits: 1 }).format(margin)}% margin bersih`;
  return `<div class="metrics">
    ${metric('Omzet bersih', t.revenue, `${t.sales} invoice lunas`, 'coins')}
    ${metric('Modal akun', t.cost, t.missing ? `${t.missing} invoice belum diisi` : 'Total modal supplier', 'box', 'blue')}
    ${metric('Laba kotor', t.gross, t.missing ? 'Perhitungan sementara' : 'Omzet dikurangi modal', 'trend', 'gold', t.gross < 0 ? 'negative' : '')}
    ${metric('Laba bersih', t.net, t.missing ? 'Perhitungan sementara' : percent, 'bars', 'lime', t.net < 0 ? 'negative' : 'positive')}
  </div>`;
}

function chartCard(report) {
  if (!report.events.length) {
    return `<section class="card">${headCard('Tren penjualan')}
      ${empty('Belum ada aktivitas keuangan', 'Grafik akan tampil setelah transaksi dicatat.', '', 'bars')}
    </section>`;
  }
  return `<section class="card">
    <div class="card-head"><div><h2>Tren penjualan</h2><p>Omzet dan laba pada periode ini</p></div>
      <div class="chart-legend"><span class="chart-key"><i></i>Omzet bersih</span><span class="chart-key"><i class="profit"></i>Laba bersih</span></div>
    </div><div class="chart-wrap"><canvas id="trend-chart" role="img"
      aria-label="Tren penjualan. Omzet bersih ${money(report.totals.revenue)}. Laba bersih ${money(report.totals.net)}."></canvas>
      <div class="chart-tooltip" id="chart-tooltip" hidden></div>
    </div>
  </section>`;
}

function packageCard(report, state, withProfit = false) {
  const qty = PACKAGES.reduce((sum, id) => sum + report.packages[id].quantity, 0);
  return `<section class="card"><div class="card-head"><div><h2>${withProfit ? 'Laba per paket' : 'Penjualan per paket'}</h2>
    <p>${withProfit ? 'Biaya operasional umum dihitung di rincian laba.' : 'Unit dari invoice lunas'}</p></div></div>
    <div class="card-body bundle-list">
      ${PACKAGES.map((id, index) => {
        const p = report.packages[id];
        return `<div class="bundle-row">${tile(index ? 'shield' : 'clock', index ? 'lime' : '')}
          <div><strong>${esc(state.settings.packages[id].label)}</strong><p>${p.quantity} akun</p></div>
          <div class="bundle-value"><strong>${money(p.revenue)}</strong></div>
          <div class="progress" aria-hidden="true"><span class="${index ? 'gold' : ''}" style="width:${qty ? (p.quantity / qty) * 100 : 0}%"></span></div>
          ${
            withProfit
              ? `<div class="package-profit">
            <span>Kotor <strong>${money(p.gross)}</strong></span><span>Bersih <strong>${money(p.net)}</strong></span>
            ${p.missing ? '<span class="subtle">Sementara</span>' : ''}
          </div>`
              : ''
          }
        </div>`;
      }).join('')}
      <div class="package-total"><span>Total terjual</span><strong>${qty} akun</strong></div>
    </div></section>`;
}

function hero() {
  return `<section class="hero"><div class="hero-content">
  <h2>Invoice siap kirim dalam hitungan detik.</h2>
  <p>Tempel data akun atau unggah file. Pilih paket garansi, cek pesan, lalu salin untuk pelanggan.</p>
  <div class="actions">${btn('Buat invoice', 'plus', 'new-invoice', 'hero-primary')}${btn('Klaim garansi', 'shield', 'new-claim', 'hero-secondary')}</div>
</div><div class="hero-art" aria-hidden="true">
  <div class="orbit"></div><div class="paper-receipt receipt-back"></div>
  <div class="paper-receipt receipt-front"><div class="paper-logo"><span>${icon('receipt')}</span>INVOICE</div>
    <div class="paper-lines"><i></i><i></i><i></i></div><div class="paper-sum"><span>Total</span><span>Rp120.000</span></div>
  </div><span class="paper-badge">${icon('checkCircle')}Garansi aktif</span>
  <span class="paper-spark">${icon('spark')}</span><span class="paper-spark small">${icon('spark')}</span>
</div></section>`;
}

function paymentBadge(invoice) {
  const label = paymentLabel(invoice);
  return badge(
    label,
    { Lunas: 'green', Menunggu: 'amber', Batal: 'muted', 'Refund sebagian': 'blue', 'Refund penuh': 'red' }[
      label
    ],
  );
}

const claimBadge = (claim) =>
  badge(
    CLAIM[claim.status],
    { filed: 'amber', processing: 'blue', resolved: 'green', rejected: 'red' }[claim.status],
  );
const sortRecords = (a, b) =>
  b.date.localeCompare(a.date) || b.number.localeCompare(a.number, 'id', { numeric: true });

function empty(title, subtitle, action = '', glyph = 'inbox') {
  return `<div class="empty"><span class="empty-icon">${icon(glyph)}</span><h3>${title}</h3><p>${subtitle}</p>${action}</div>`;
}

function invoiceRows(rows, compact = false) {
  return `<div class="table-scroll"><table class="table responsive-table table-flat">
    <thead><tr><th>Invoice</th><th>Tanggal</th><th>Paket</th><th>Status</th><th class="num">Total</th><th><span class="subtle">Aksi</span></th></tr></thead>
    <tbody>${rows
      .map(
        (row) => `<tr>
      <td><div class="row-main">${tile('receipt')}<div><span class="row-id">${esc(row.number)}</span><small>${esc(row.customer || row.product)}</small></div></div></td>
      <td data-label="Tanggal">${formatDate(row.date)}</td><td data-label="Paket">${tag(row)}</td>
      <td data-label="Status">${paymentBadge(row)}</td><td class="num" data-label="Total"><strong>${money(priceDetails(row).total)}</strong></td>
      <td class="row-actions"><div class="row-tools">${iconButton('Buka invoice ' + row.number, 'edit', 'edit-invoice', row.id)}
        ${compact ? '' : iconButton('Buat klaim untuk ' + row.number, 'shield', 'claim-for', row.id)}</div></td>
    </tr>`,
      )
      .join('')}</tbody></table></div>`;
}

export function dashboard(state, report, ui) {
  const recent = [...state.invoices].sort(sortRecords).slice(0, 5);
  return `${pageHead('Ringkasan usaha', 'Pantau penjualan dan laba usaha reseller Anda.', periodFields(ui))}
    ${hero()}${metrics(report)}
    ${report.totals.missing ? banner('Lengkapi modal di invoice lunas agar laba dihitung dengan biaya supplier yang benar.', 'amber') : ''}
    <div class="section-grid">${chartCard(report)}${packageCard(report, state)}</div>
    <section class="card table-card"><div class="card-head"><div><h2>Invoice terbaru</h2><p>Transaksi yang baru dicatat</p></div>
      ${btn('Lihat riwayat', 'history', 'nav', 'outline btn-sm', 'data-id="history"')}</div>
      ${recent.length ? invoiceRows(recent, true) : empty('Belum ada invoice', 'Invoice yang Anda simpan akan muncul di sini.', btn('Buat invoice', 'plus', 'new-invoice', 'outline btn-sm'), 'receipt')}
    </section>`;
}

const headCard = (title, subtitle = '', glyph = '') => `<div class="card-head">${glyph ? tile(glyph) : ''}
  <div><h2>${title}</h2>${subtitle ? `<p>${subtitle}</p>` : ''}</div></div>`;
const formCard = (
  title,
  subtitle,
  glyph,
  content,
) => `<section class="card form-card">${headCard(title, subtitle, glyph)}
  <div class="card-body">${content}</div></section>`;

export function field(label, name, value, config = {}) {
  const {
    type = 'text',
    placeholder = '',
    help = '',
    wide = false,
    attr = 'data-draft',
    extra = '',
    limit = 300,
    required = false,
    currency = false,
  } = config;
  const integer = type === 'number';
  const el = `<input type="${type}" ${attr}="${esc(name)}" value="${esc(value)}" placeholder="${esc(placeholder)}"
    ${integer ? 'inputmode="numeric" min="0" step="1" max="1000000000"' : `maxlength="${limit}"`}
    ${required ? 'required' : ''} ${extra}>`;
  return `<label class="field ${wide ? 'wide' : ''}"><span>${label}</span>
    ${currency ? `<span class="money-field"><span>Rp</span>${el}</span>` : el}
    ${help ? `<small>${help}</small>` : ''}</label>`;
}

export function area(label, name, value, config = {}) {
  const { attr = 'data-draft', placeholder = '', wide = false, limit = 1000, extra = '', rows = 3 } = config;
  return `<label class="field ${wide ? 'wide' : ''}"><span>${label}</span>
    <textarea ${attr}="${esc(name)}" maxlength="${limit}" rows="${rows}" placeholder="${esc(placeholder)}" ${extra}>${esc(value)}</textarea></label>`;
}

export function picker(label, name, entries, value, config = {}) {
  const { wide = false, attr = 'data-draft', extra = '' } = config;
  const options = Array.isArray(entries) ? entries : Object.entries(entries);
  return `<label class="field ${wide ? 'wide' : ''}"><span>${label}</span><select ${attr}="${esc(name)}" ${extra}>
    ${options.map(([key, title]) => selectOption(key, title, value)).join('')}</select></label>`;
}

const quantityField = (value) => `<label class="field"><span>Jumlah akun</span>
  <input type="number" data-draft="qty" value="${esc(value)}" inputmode="numeric" min="1" max="1000" step="1" required>
</label>`;
const amountField = (label, name, value, config = {}) =>
  field(label, name, value, { ...config, type: 'number', currency: true });

function importContents(draft, isClaim) {
  return `<div class="dropzone" id="dropzone">${icon('upload')}
    ${btn('Pilih file', '', 'pick-file', 'outline btn-sm')}<small>TXT, CSV, TSV, JSON, PDF teks · maks. 8 MB</small>
  </div><input type="file" id="order-input" accept=".txt,.csv,.tsv,.json,.pdf" hidden>
  ${area(isClaim ? 'Tempel data akun pengganti' : 'Tempel teks order atau data akun', 'raw-order', draft.raw, {
    attr: 'id',
    extra: 'class="raw-text" spellcheck="false" autocomplete="off" autocapitalize="off"',
    placeholder: 'email@contoh.com|password|2FA',
    limit: 250000,
  })}
  <div class="actions import-tools">
    ${btn('Lihat contoh', 'file', 'load-sample', 'plain btn-sm')}
    ${btn('Kosongkan data akun', '', 'clear-raw', 'plain btn-sm', hide(!draft.raw && !draft.accounts.length) + ' id="clear-raw"')}
  </div>
  <div class="import-feedback" id="import-feedback" aria-live="polite">${importFeedback(draft)}</div>
  <details class="accounts-panel" id="accounts-panel"${draft.accountsOpen ? ' open' : ''}>
    <summary id="accounts-summary">Detail akun manual (${draft.accounts.length})</summary>
    <div class="account-list" id="account-list">${accountRows(draft)}</div>
    <div class="actions" style="margin-top:7px">${btn('Tambah akun', 'plus', 'add-account', 'outline btn-sm')}</div>
    <p class="account-hint">Data akun hanya tersedia selama halaman ini terbuka.</p>
  </details>`;
}

export function importFeedback(draft) {
  const source = draft.source;
  const coverage = Object.entries({
    email: 'Email',
    password: 'Password',
    key: '2FA key',
    verification: 'Tautan OTP email',
  }).map(
    ([key, label]) =>
      `${label} ${draft.accounts.filter((account) => account[key]).length}/${draft.parsedCount}`,
  );
  return `${draft.importBusy ? banner('Membaca file…') : ''}
    ${draft.importError ? banner(draft.importError, 'red', 'alert') : ''}
    ${(draft.importWarnings || []).map((message) => banner(message, 'amber', 'alert')).join('')}
    ${draft.parsedCount ? `<p class="import-meta" style="color:#176346">${icon('checkCircle')} ${draft.parsedCount} akun terbaca${source ? ' dari ' + esc(source) : ''}.</p>` : ''}
    ${draft.parsedCount ? `<p class="import-meta">${coverage.join(' · ')}</p>` : ''}
    ${draft.supplierAmount ? `<p class="import-meta">Nominal supplier <strong>${esc(draft.supplierAmount)}</strong></p>` : ''}
    ${
      draft.supplierDate
        ? `<div class="actions import-meta"><span>Tanggal supplier <strong>${formatDate(draft.supplierDate)}</strong></span>
      ${btn('Gunakan tanggal supplier', '', 'supplier-date', 'plain btn-sm')}</div>`
        : ''
    }`;
}

export function accountRows(draft) {
  return draft.accounts
    .map(
      (a, index) => `<div class="account-entry"><div class="account-entry-head">
    <span>Akun ${index + 1}</span>${iconButton('Hapus akun ' + (index + 1), 'trash', 'remove-account', String(index))}
  </div><div class="fields">
    ${field('Email', 'email', a.email, { attr: 'data-account', type: 'email', extra: `data-index="${index}" autocomplete="off" spellcheck="false"` })}
    ${field('Password', 'password', a.password, { attr: 'data-account', type: 'password', extra: `data-index="${index}" autocomplete="new-password"`, limit: 500 })}
    ${field('2FA Key', 'key', a.key, { attr: 'data-account', type: 'password', extra: `data-index="${index}" autocomplete="new-password"`, limit: 600 })}
    ${field('Tautan OTP email', 'verification', a.verification, { attr: 'data-account', type: 'url', extra: `data-index="${index}" autocomplete="off"`, limit: 3000 })}
  </div></div>`,
    )
    .join('');
}

function packagePicker(draft, state, isClaim) {
  return `<div class="pack-picker" role="group" aria-label="Paket garansi">${PACKAGES.map((id) => {
    const pack = state.settings.packages[id];
    const current = id === draft.packageId;
    return `<label class="pack-option"><input type="radio" name="package" data-draft="packageId" value="${id}"${is(current)}>
      <strong>${esc(current ? draft.packageLabel : pack.label)}</strong><span>${isClaim ? (pack.days ? `${pack.days} hari` : 'Sesuai masa aktif') : money(current ? draft.price : pack.price) + ' / akun'}</span>
    </label>`;
  }).join('')}</div>`;
}

function invoiceFields(draft, state) {
  return [
    formCard('Data order', 'Impor otomatis satu order per pesan.', 'upload', importContents(draft, false)),
    formCard(
      'Detail invoice',
      'Lengkapi informasi pelanggan dan nomor referensi.',
      'receipt',
      `<div class="fields">
      ${field('Nama pelanggan', 'customer', draft.customer, { placeholder: 'Nama atau username' })}
      ${field('Kontak pelanggan', 'contact', draft.contact, { placeholder: 'WhatsApp atau email', limit: 100 })}
      ${field('Produk', 'product', draft.product, { required: true, wide: true })}
      ${picker('Mode tanggal invoice', 'dateMode', { auto: 'Otomatis', manual: 'Manual' }, draft.dateMode)}
      ${field('Tanggal invoice (WIB)', 'date', draft.date, { type: 'date', required: true, extra: draft.dateMode === 'auto' ? 'readonly' : '' })}
      ${field('Referensi supplier', 'supplierRef', draft.supplierRef, { placeholder: 'Opsional', limit: 120 })}
      ${quantityField(draft.qty)}
    </div><div id="qty-hint"></div>`,
    ),
    formCard(
      'Paket dan pembayaran',
      'Harga jual dan modal bisa diubah untuk invoice ini.',
      'wallet',
      `${packagePicker(draft, state, false)}<div class="fields">
      ${amountField('Harga jual per akun', 'price', draft.price, { required: true })}
      ${amountField('Modal per akun', 'unitCost', draft.unitCost, { placeholder: 'Belum diisi' })}
      ${amountField('Diskon invoice', 'discount', draft.discount)}
      ${amountField('Biaya transaksi', 'fee', draft.fee)}
      ${picker('Status pembayaran', 'status', PAYMENT, draft.status)}
      ${field('Metode pembayaran', 'paymentMethod', draft.paymentMethod, { placeholder: 'Transfer, QRIS, dll.', limit: 80 })}
    </div>
    <div class="form-section fields" id="payment-fields"${hide(draft.status !== 'paid')}>
      ${field('Tanggal pembayaran', 'paymentDate', draft.paymentDate, { type: 'date', help: 'Tanggal untuk laporan penjualan dan awal masa garansi.' })}
      ${amountField('Nominal refund', 'refund', draft.refund, { placeholder: 'Opsional' })}
      <div id="refund-date-field"${hide(!draft.refund)}>${field('Tanggal refund', 'refundDate', draft.refundDate, { type: 'date' })}</div>
    </div>
    <details class="form-section"${draft.warrantyEnd ? ' open' : ''}><summary>Masa berlaku dan catatan</summary>
      <div class="fields">
        ${field('Tanggal akhir garansi', 'warrantyEnd', draft.warrantyEnd, { type: 'date', help: 'Kosongkan untuk mengikuti ketentuan paket.', wide: true })}
        ${area('Catatan internal', 'notes', draft.notes, { placeholder: 'Misalnya nama supplier atau info pembayaran', wide: true })}
        ${area('Catatan untuk pelanggan', 'messageNote', draft.messageNote, { placeholder: 'Tambahan untuk pesan ini', wide: true })}
      </div>
    </details>`,
    ),
  ].join('');
}

function claimFields(draft, state) {
  const options = [
    ['', 'Isi nomor invoice manual'],
    ...[...state.invoices].sort(sortRecords).map((i) => [i.id, `${i.number} · ${i.customer || i.product}`]),
  ];
  const linked = state.invoices.find((i) => i.id === draft.invoiceId);
  const warranty = warrantyFor(linked);
  return [
    formCard(
      'Invoice asal',
      'Pilih invoice tersimpan atau isi nomor order lama secara manual.',
      'link',
      `<div class="fields">
      ${picker('Hubungkan invoice', 'invoiceId', options, draft.invoiceId, { wide: true })}
      ${field('Nomor invoice asal', 'invoiceNumber', draft.invoiceNumber, { required: true, extra: linked ? 'readonly' : '', placeholder: 'JUU-261124-052' })}
      ${field('Tanggal klaim', 'date', draft.date, { type: 'date', required: true })}
      ${field('Nama pelanggan', 'customer', draft.customer, { placeholder: 'Nama atau username' })}
      ${field('Kontak pelanggan', 'contact', draft.contact, { placeholder: 'WhatsApp atau email' })}
    </div>
    ${
      linked
        ? `<div class="status-line"><span>${esc(linked.packageLabel)}${warranty.end ? ' · ' + formatDate(warranty.end) : ''}</span>${badge(warranty.label, warranty.tone)}</div>`
        : `<div style="margin-top:10px">${packagePicker(draft, state, true)}</div>`
    }
    `,
    ),
    formCard(
      'Akun pengganti',
      'Buat pesan klaim dari file atau teks akun baru.',
      'upload',
      importContents(draft, true),
    ),
    formCard(
      'Tindak lanjut',
      'Catat status, solusi, dan biaya penggantian.',
      'shield',
      `<div class="fields">
      ${picker('Status klaim', 'status', CLAIM, draft.status, { wide: true })}
      ${area('Keluhan pelanggan', 'issue', draft.issue, { placeholder: 'Contoh: akun tidak bisa login', wide: true })}
      ${area('Tindak lanjut atau alasan keputusan', 'resolution', draft.resolution, { placeholder: 'Contoh: akun pengganti sudah disiapkan', wide: true })}
      ${amountField('Biaya penggantian', 'cost', draft.cost)}
      ${field('Tanggal biaya', 'costDate', draft.costDate, { type: 'date' })}
      ${amountField('Kredit dari supplier', 'reimbursement', draft.reimbursement)}
      ${field('Tanggal kredit', 'reimbursementDate', draft.reimbursementDate, { type: 'date' })}
      ${area('Catatan untuk pelanggan', 'messageNote', draft.messageNote, { placeholder: 'Tambahan untuk pesan ini', wide: true })}
    </div>`,
    ),
  ].join('');
}

export function editor(type, draft, state) {
  const isClaim = type === 'claim';
  const heading = draft.id
    ? isClaim
      ? 'Edit klaim garansi'
      : 'Edit invoice'
    : isClaim
      ? 'Klaim garansi'
      : 'Buat invoice';
  const description = isClaim
    ? 'Kelola pengajuan dan siapkan pesan penggantian untuk pelanggan.'
    : 'Ubah data order menjadi invoice dengan harga dan pesan siap kirim.';
  const actions = draft.id
    ? btn(isClaim ? 'Klaim baru' : 'Invoice baru', 'plus', isClaim ? 'new-claim' : 'new-invoice')
    : btn('Lihat pratinjau', 'eye', 'scroll-preview', 'outline btn-sm');
  return `${pageHead(heading, description, actions)}
    <div class="composer-layout">
      <form class="stack" id="editor-form" data-type="${type}" autocomplete="off">
        ${isClaim ? claimFields(draft, state) : invoiceFields(draft, state)}
      </form>
      <div class="stack editor-side" id="editor-preview">
        <section class="card">
          <div class="card-head preview-head"><div class="preview-tab">${icon(isClaim ? 'shield' : 'clipboard')}Pratinjau pesan</div>
            ${btn(draft.editMessage ? 'Gunakan template' : 'Edit pesan ini', 'edit', 'edit-message', 'plain btn-sm')}</div>
          <div class="preview-window">
            ${
              draft.editMessage
                ? `<textarea id="message-editor" rows="12" aria-label="Edit pesan untuk pelanggan" spellcheck="false">${esc(draft.customMessage)}</textarea>`
                : '<pre id="message-preview" aria-label="Pesan untuk pelanggan"></pre>'
            }
          </div>
          <div class="preview-actions">
            ${btn('Salin pesan', 'copy', 'copy-message', 'primary')}
            ${btn('TXT', 'download', 'download-message', 'outline', 'aria-label="Unduh pesan TXT"')}
            ${btn('Cetak / PDF', 'printer', 'print-message')}
          </div>
          <div class="preview-note">${
            draft.editMessage
              ? 'Pesan ini menggunakan teks yang Anda ketik.'
              : `<label class="check-label"><input type="checkbox" data-draft="includeAccounts"${is(draft.includeAccounts)}> Sertakan data akun di pesan otomatis</label>`
          }</div>
          ${isClaim ? '' : '<div class="calc" id="invoice-calc"></div>'}
          <div class="save-area">
            ${draft.id ? btn('Hapus', 'trash', 'delete-record', 'outline', `data-id="${esc(draft.id)}"`) : ''}
            <button class="btn btn-primary" type="submit" form="editor-form">${icon('save')}${isClaim ? 'Simpan klaim' : 'Simpan invoice'}</button>
          </div>
        </section>
        <div class="banner compose-hint">${icon('lock')}<p>Riwayat menyimpan detail transaksi. Data dari kolom akun dan draf pesan hanya tersedia di sesi ini.</p></div>
      </div>
    </div>`;
}

export function invoiceCalc(draft) {
  const d = priceDetails(draft);
  const profit = (name, value) =>
    `<div class="calc-item"><span>${name}</span><strong class="${value < 0 ? 'negative' : ''}">${value === null ? 'Isi modal' : money(value)}</strong></div>`;
  return `${profit('Total tagihan', d.total)}${profit('Modal total', d.cost)}
    ${profit('Laba kotor', d.gross)}${profit('Laba bersih', d.net)}`;
}

function claimRows(rows) {
  return `<div class="table-scroll"><table class="table responsive-table table-flat">
    <thead><tr><th>Klaim</th><th>Tanggal</th><th>Invoice asal</th><th>Status</th><th class="num">Biaya bersih</th><th>Aksi</th></tr></thead>
    <tbody>${rows
      .map(
        (row) => `<tr>
      <td><div class="row-main">${tile('shield')}<div><span class="row-id">${esc(row.number)}</span><small>${esc(row.customer || row.packageLabel)}</small></div></div></td>
      <td data-label="Tanggal">${formatDate(row.date)}</td>
      <td data-label="Invoice asal">${esc(row.invoiceNumber || '—')}</td>
      <td data-label="Status">${claimBadge(row)}</td>
      <td class="num" data-label="Biaya bersih">${money(row.cost - row.reimbursement)}</td>
      <td class="row-actions"><div class="row-tools">${iconButton('Buka klaim ' + row.number, 'edit', 'edit-claim', row.id)}</div></td>
    </tr>`,
      )
      .join('')}</tbody></table></div>`;
}

const segments = (entries, current, action) =>
  `<div class="segments" role="group">${entries
    .map(
      ([id, name]) =>
        `<button type="button" data-action="${action}" data-id="${id}" aria-pressed="${current === id}">${esc(name)}</button>`,
    )
    .join('')}</div>`;

function pageControls(current, total, perPage, action) {
  if (total <= perPage) return '';
  return `<div class="table-foot"><span>${(current - 1) * perPage + 1}–${Math.min(current * perPage, total)} dari ${total}</span><div class="actions">
    ${btn('Sebelumnya', '', action, 'outline btn-sm', `data-id="${current - 1}" ${current === 1 ? 'disabled' : ''}`)}
    ${btn('Berikutnya', '', action, 'outline btn-sm', `data-id="${current + 1}" ${current * perPage >= total ? 'disabled' : ''}`)}
  </div></div>`;
}

export function historyRows(state, ui) {
  const claims = ui.historyType === 'claims';
  const query = ui.historyQuery.trim().toLowerCase();
  const rows = state[ui.historyType]
    .filter((row) => {
      const index = [row.number, row.customer, row.invoiceNumber, row.product, row.supplierRef, row.issue]
        .join(' ')
        .toLowerCase();
      const status = claims
        ? row.status
        : { 'Refund sebagian': 'partial', 'Refund penuh': 'refunded' }[paymentLabel(row)] || row.status;
      return (
        (!query || index.includes(query)) &&
        (!ui.historyStatus || status === ui.historyStatus) &&
        (!ui.historyPackage || row.packageId === ui.historyPackage)
      );
    })
    .sort(sortRecords);
  const perPage = 12;
  const page = Math.min(ui.historyPage, Math.max(1, Math.ceil(rows.length / perPage)));
  const sliced = rows.slice((page - 1) * perPage, page * perPage);
  return rows.length
    ? `${claims ? claimRows(sliced) : invoiceRows(sliced)}${pageControls(page, rows.length, perPage, 'history-page')}`
    : empty(
        'Belum ada hasil',
        'Cari dengan kata lain atau buat transaksi baru.',
        btn(
          claims ? 'Buat klaim' : 'Buat invoice',
          'plus',
          claims ? 'new-claim' : 'new-invoice',
          'outline btn-sm',
        ),
      );
}

export function historyView(state, ui) {
  const claims = ui.historyType === 'claims';
  const status = claims ? CLAIM : { ...PAYMENT, partial: 'Refund sebagian', refunded: 'Refund penuh' };
  return `${pageHead(
    'Riwayat transaksi',
    'Cari dan perbarui invoice atau klaim yang sudah disimpan.',
    btn(claims ? 'Buat klaim' : 'Buat invoice', 'plus', claims ? 'new-claim' : 'new-invoice', 'primary'),
  )}
    <div class="toolbar">${segments(
      [
        ['invoices', 'Invoice'],
        ['claims', 'Klaim garansi'],
      ],
      ui.historyType,
      'history-type',
    )}
      <div class="filters">
        <label class="input-icon">${icon('search')}<input type="search" data-control="historyQuery" value="${esc(ui.historyQuery)}" aria-label="Cari transaksi" placeholder="Cari nomor atau pelanggan"></label>
        <select data-control="historyStatus" aria-label="Filter status">${selectOption('', 'Semua status', ui.historyStatus)}
          ${Object.entries(status)
            .map(([id, label]) => selectOption(id, label, ui.historyStatus))
            .join('')}</select>
        <select data-control="historyPackage" aria-label="Filter paket">${selectOption('', 'Semua paket', ui.historyPackage)}
          ${PACKAGES.map((id) => selectOption(id, state.settings.packages[id].label, ui.historyPackage)).join('')}</select>
      </div>
    </div>
    <section class="card table-card" id="history-rows" aria-label="Hasil pencarian transaksi">${historyRows(state, ui)}</section>`;
}

export const LEDGER_LABELS = {
  '': 'Semua transaksi',
  sale: 'Penjualan',
  refund: 'Refund',
  expense: 'Pengeluaran',
  claim: 'Biaya garansi',
  credit: 'Kredit supplier',
};

export function ledgerRows(report, ui) {
  const rows = report.events.filter((event) => !ui.ledgerKind || event.kind === ui.ledgerKind);
  const perPage = 12;
  const page = Math.min(ui.ledgerPage, Math.max(1, Math.ceil(rows.length / perPage)));
  const body = rows.slice((page - 1) * perPage, page * perPage);
  if (!rows.length)
    return empty(
      'Belum ada transaksi di periode ini',
      'Invoice lunas, refund, biaya garansi, dan pengeluaran akan muncul di buku transaksi.',
      '',
      'wallet',
    );
  return `<div class="table-scroll"><table class="table responsive-table">
    <thead><tr><th>Transaksi</th><th>Tanggal</th><th class="num">Omzet bersih</th><th class="num">Modal dan biaya</th><th class="num">Dampak laba</th><th>Aksi</th></tr></thead>
    <tbody>${body
      .map((row) => {
        const net = row.revenue - (row.cost ?? 0) - row.fee;
        const action =
          row.kind === 'expense'
            ? 'edit-expense'
            : ['claim', 'credit'].includes(row.kind)
              ? 'edit-claim'
              : 'edit-invoice';
        return `<tr><td><strong>${esc(row.label)}</strong><small>${esc([row.reference, row.description].filter(Boolean).join(' · '))}</small></td>
        <td data-label="Tanggal">${formatDate(row.date)}</td>
        <td class="num ${row.revenue < 0 ? 'negative' : ''}" data-label="Omzet bersih">${row.revenue ? money(row.revenue) : '—'}</td>
        <td class="num" data-label="Modal dan biaya">${row.cost === null ? 'Modal belum diisi' : money(row.cost + row.fee)}</td>
        <td class="num ${net < 0 ? 'negative' : 'positive'}" data-label="Dampak laba"><strong>${money(net)}</strong>${row.cost === null ? '<small>Sementara</small>' : ''}</td>
        <td class="row-actions"><div class="row-tools">${iconButton('Edit ' + row.label, 'edit', action, row.id)}</div></td></tr>`;
      })
      .join('')}</tbody></table></div>${pageControls(page, rows.length, perPage, 'ledger-page')}`;
}

export function financeView(state, report, ui) {
  const { totals: t, receivable, pending } = report;
  const line = (key, value, extra = '') =>
    `<div class="summary-line ${extra}"><span>${key}</span><strong>${money(value)}</strong></div>`;
  return `${pageHead(
    'Keuangan',
    'Rekap omzet, modal, pengeluaran, dan laba per periode.',
    `<div class="actions">${btn('Ekspor CSV', 'download', 'export-csv')}${btn('Tambah biaya', 'plus', 'new-expense', 'primary')}</div>`,
  )}
    <div class="toolbar">${periodFields(ui)}</div>
    ${metrics(report)}
    ${t.missing ? banner(`Ada ${t.missing} invoice lunas tanpa modal. Angka laba masih sementara.`, 'amber') : ''}
    <div class="finance-overview">
      <div class="section-grid">
        <section class="card">${headCard('Rincian laba', 'Invoice masuk laporan pada tanggal pembayaran.')}
          <div class="card-body summary-lines">
            ${line('Penjualan setelah diskon', t.revenue + t.refund)}${line('Refund pelanggan', t.refund)}${line('Modal akun', t.cost)}
            ${line('Biaya transaksi', t.fee)}${line('Biaya klaim setelah kredit supplier', t.warranty)}
            ${line('Pengeluaran operasional', t.operating)}${line('Laba bersih', t.net, 'total')}
          </div>
        </section><div class="stack">
          ${packageCard(report, state, true)}
          <section class="card">${headCard('Piutang', `${pending} invoice menunggu pembayaran pada periode invoice ini.`)}
            <div class="card-body summary-lines">${line('Total belum dibayar', receivable, 'total')}</div>
          </section>
        </div>
      </div>
    </div>
    <section class="card table-card">
      <div class="card-head"><div><h2>Buku transaksi</h2><p>Filter jenis transaksi sebelum ekspor.</p></div>
        <select data-control="ledgerKind" aria-label="Jenis transaksi">${Object.entries(LEDGER_LABELS)
          .map(([k, v]) => selectOption(k, v, ui.ledgerKind))
          .join('')}</select>
      </div>
      <div id="ledger-rows">${ledgerRows(report, ui)}</div>
    </section>`;
}

export function expenseForm(item) {
  return `<form class="fields" id="expense-form">
    ${field('Nama pengeluaran', 'name', item.name, { attr: 'name', required: true, wide: true, placeholder: 'Contoh: biaya promosi' })}
    ${amountField('Nominal', 'amount', item.amount, { attr: 'name', required: true })}
    ${field('Tanggal', 'date', item.date, { attr: 'name', type: 'date', required: true })}
    ${picker(
      'Kategori',
      'category',
      EXPENSES.map((id) => [id, id]),
      item.category,
      { attr: 'name', wide: true },
    )}
    ${area('Catatan', 'notes', item.notes, { attr: 'name', wide: true, placeholder: 'Opsional' })}
  </form>`;
}

export function templateFields(draft, type) {
  const key = type === 'claim' ? 'claimTemplate' : 'invoiceTemplate';
  return `<div class="template-grid">
    ${area('Isi template pesan', key, draft[key], { attr: 'data-setting', limit: 10000, extra: 'id="template-input" spellcheck="false"', rows: 12 })}
    <div><div class="field">Variabel otomatis</div><p class="field-help">Klik variabel untuk menyisipkannya di posisi kursor.</p>
      <div class="token-grid">${Object.entries(VARIABLES[type])
        .map(
          ([token, label]) =>
            `<button class="token" type="button" data-action="add-token" data-id="${token}" title="{{${token}}}">${label}</button>`,
        )
        .join('')}
      </div>
      <div class="actions" style="margin-top:8px">${btn('Kembalikan template bawaan', '', 'reset-template', 'plain btn-sm')}</div>
    </div>
  </div><div class="field" style="margin-top:9px">Contoh hasil</div><pre id="template-preview" class="settings-preview"></pre>
  <p class="field-help" id="template-validation" aria-live="polite"></p>`;
}

export function settingsView(draft, type) {
  const cfg = { attr: 'data-setting' };
  const save =
    '<button type="submit" class="btn btn-primary" form="settings-form">' +
    icon('save') +
    'Simpan pengaturan</button>';
  return `${pageHead('Pengaturan', 'Sesuaikan toko, harga paket, dan format pesan pelanggan.', save)}
    <form class="settings-grid" id="settings-form" autocomplete="off">
      <section class="card wide">
        ${headCard(
          'Pembukuan dan sesi masuk',
          'Perubahan tersinkron setelah disimpan dan tersedia di perangkat lain yang sudah masuk.',
        )}
        <div class="card-body">
          <div class="actions">
            ${btn('Sinkronkan sekarang', 'history', 'sync-now')}
            ${btn('Keluar dari perangkat ini', 'lock', 'owner-logout', 'plain')}
          </div>
        </div>
      </section>
      ${formCard(
        'Identitas toko',
        'Tampil pada invoice dan pesan klaim.',
        'store',
        `<div class="fields">
        ${field('Nama toko', 'business', draft.business, { ...cfg, required: true, limit: 60 })}
        ${field('Awalan nomor invoice', 'prefix', draft.prefix, { ...cfg, required: true, limit: 14, extra: 'pattern="(?:[A-Za-z0-9]|-){1,14}"', help: 'Huruf, angka, atau tanda hubung.' })}
        ${field('Produk default', 'product', draft.product, { ...cfg, required: true })}
        ${field('Kontak admin', 'contact', draft.contact, { ...cfg, placeholder: 'WhatsApp atau email', limit: 120 })}
        ${area('Instruksi pembayaran', 'paymentInfo', draft.paymentInfo, { ...cfg, wide: true, limit: 700, placeholder: 'Tampil pada invoice menunggu pembayaran' })}
        ${area('Panduan akses akun', 'loginGuide', draft.loginGuide, { ...cfg, wide: true, limit: 1600 })}
        ${area('Aturan penggunaan akun', 'accountRules', draft.accountRules, { ...cfg, wide: true, limit: 1600 })}
        ${area('Ketentuan garansi', 'terms', draft.terms, { ...cfg, wide: true, limit: 2200, rows: 6 })}
      </div>`,
      )}
      ${formCard(
        'Harga dan modal paket',
        'Harga ini mengisi invoice baru. Modal boleh dikosongkan.',
        'wallet',
        PACKAGES.map((id) => {
          const p = draft.packages[id];
          return `<div class="package-setting fields">
          ${field('Nama paket', `${id}.label`, p.label, { ...cfg, wide: true, required: true, limit: 60 })}
          ${amountField('Harga jual per akun', `${id}.price`, p.price, { ...cfg, required: true })}
          ${amountField('Modal per akun', `${id}.cost`, p.cost, { ...cfg, placeholder: 'Belum diisi' })}
          <label class="field wide"><span>Durasi garansi (hari)</span>
            <input type="number" data-setting="${id}.days" min="1" max="3650" step="1" inputmode="numeric" value="${esc(p.days)}" placeholder="Selama masa aktif paket">
          </label>
        </div>`;
        }).join(''),
      )}
      <section class="card wide">${headCard('Template pesan', 'Ubah isi invoice atau klaim. Variabel akan diisi dari data transaksi.')}
        <div class="card-body">
          ${segments(
            [
              ['invoice', 'Invoice'],
              ['claim', 'Klaim garansi'],
            ],
            type,
            'template-type',
          )}
          <div id="template-fields">${templateFields(draft, type)}</div>
          <div class="actions settings-actions">${save}</div>
        </div>
      </section>
      <section class="card wide">${headCard('Cadangan data', 'Unduh atau impor salinan pembukuan.')}
        <div class="card-body">
          <p class="field-help">File cadangan berisi data keuangan, riwayat, dan pengaturan toko. Simpan di tempat yang hanya bisa Anda akses.</p>
          <div class="actions" style="margin-top:10px">
            ${btn('Unduh backup', 'download', 'export-backup')}${btn('Impor backup', 'upload', 'import-backup')}</div>
        </div>
      </section>
    </form>`;
}
