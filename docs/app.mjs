import {
  STORAGE_KEY,
  createState,
  today,
  validDate,
  formatDate,
  dateRange,
  money,
  newId,
  financialReport,
  trendPoints,
  priceDetails,
  claimDetails,
  nextNumber,
  composeMessage,
  cleanDocument,
  cleanInvoice,
  cleanClaim,
  cleanExpense,
  cleanSettings,
  readBackup,
  mergeBackup,
  csvString,
  VARIABLES,
  MAX_MESSAGE_LENGTH,
} from './model.mjs?v=saved-documents';
import { parseOrder, readImportFile, SAMPLE_TEXT } from './import.mjs?v=owner-access';
import { icon } from './icons.mjs';
import {
  esc,
  btn,
  chrome,
  dashboard,
  editor,
  invoiceCalc,
  claimCalc,
  importFeedback,
  accountRows,
  historyView,
  historyRows,
  financeView,
  ledgerRows,
  expenseForm,
  settingsView,
  syncControl,
  templateFields,
  ownerGate,
} from './views.mjs?v=saved-documents';
import { mountChart } from './chart.mjs';
import { SyncError, createSyncedLedger } from './sync.mjs?v=saved-documents';
import { OWNER_API } from './owner-config.mjs?v=owner-access';
import {
  OWNER_SESSION_KEY,
  readOwnerSession,
  storeOwnerSession,
  forgetOwnerSession,
  ownerRequest,
  signInOwner,
} from './owner-access.mjs?v=owner-access';

const $ = (selector) => document.querySelector(selector);
const views = ['dashboard', 'invoice', 'claim', 'history', 'finance', 'settings'];
const locationView = () => (views.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'dashboard');
const viewContainer = $('#view');
const modal = $('#modal');
const ownerApi = new URL(OWNER_API, location.href);
let cloud = null;
const sync = { phase: 'idle' };
const initialDate = today();
const ui = {
  view: locationView(),
  period: 'month',
  periodStart: initialDate.slice(0, 7) + '-01',
  periodEnd: initialDate,
  historyType: 'invoices',
  historyQuery: '',
  historyStatus: '',
  historyPackage: '',
  historyPage: 1,
  ledgerKind: '',
  ledgerPage: 1,
  templateType: 'invoice',
};

let state = createState();
let ownerSession = null;
let loginMessage = '';

const drafts = {};
let settingsDraft = null;
let settingsVersion = '';
let settingsDirty = false;
let closeChart = null;
let confirmAction = null;
let expenseDraft = null;
let editorSaving = false;
let expenseSaving = false;
let settingsSaving = false;
let cloudRead;

function blankDraft(type, data = state) {
  const pack = data.settings.packages.short;
  const shared = {
    id: '',
    number: '',
    customer: '',
    contact: '',
    packageId: 'short',
    packageLabel: pack.label,
    product: data.settings.product,
    date: today(),
    accounts: [],
    raw: '',
    source: '',
    includeAccounts: true,
    accountsOpen: false,
    messageNote: '',
    editMessage: false,
    customMessage: '',
    importWarnings: [],
    importError: '',
    parsedCount: 0,
    touched: new Set(),
    dirty: false,
    importToken: 0,
  };
  if (type === 'claim')
    return {
      ...shared,
      invoiceId: '',
      invoiceNumber: '',
      issue: '',
      resolution: '',
      status: 'filed',
      replacementQty: 0,
      replacementPrice: null,
      replacementUnitCost: null,
      extraCost: 0,
      costDate: '',
      reimbursement: 0,
      reimbursementDate: '',
    };
  return {
    ...shared,
    dateMode: 'auto',
    supplierRef: '',
    supplierAmount: '',
    supplierDate: '',
    warrantyDays: pack.days,
    warrantyEnd: '',
    qty: 1,
    price: pack.price,
    unitCost: pack.cost,
    discount: 0,
    fee: 0,
    status: 'paid',
    paymentMethod: '',
    paymentDate: shared.date,
    refund: 0,
    refundDate: '',
    notes: '',
  };
}

const editType = () => (ui.view === 'invoice' || ui.view === 'claim' ? ui.view : '');
const currentDraft = () => (editType() ? drafts[editType()] : null);
const range = () => dateRange(ui.period, ui.periodStart, ui.periodEnd);
const report = () => financialReport(state, range());

function toast(message, error = false) {
  const target = $('#toast');
  const item = document.createElement('div');
  item.className = 'toast' + (error ? ' error' : '');
  item.innerHTML = icon(error ? 'alert' : 'checkCircle') + '<span>' + esc(message) + '</span>';
  target.replaceChildren(item);
  window.setTimeout(() => item.remove(), error ? 6400 : 4200);
}

async function persist(transform) {
  const ledger = cloud;
  if (!ledger?.current) throw new Error('Masuk untuk membuka pembukuan.');
  setSyncPhase('saving');
  try {
    const { snapshot, value } = await ledger.transact(transform);
    if (cloud !== ledger) throw new Error('Sesi pembukuan sudah ditutup.');
    state = snapshot.state;
    setSyncPhase('ready');
    return value;
  } catch (error) {
    if (cloud === ledger) {
      if (error.status === 401) lockOwner(error.message);
      else {
        state = ledger.current.state;
        setSyncPhase(error instanceof SyncError ? 'error' : 'ready');
      }
    }
    throw error;
  }
}

function renderChrome() {
  const shell = chrome(ui.view, state, sync);
  $('#sidebar').innerHTML = shell.sidebar;
  $('#topbar').innerHTML = shell.topbar;
  $('#bottom-nav').innerHTML = shell.bottom;
}

function setSyncPhase(phase) {
  if (phase === sync.phase) return;
  sync.phase = phase;
  if (!cloud?.current) return;
  const current = $('#sync-control');
  if (current) {
    const focused = current.contains(document.activeElement);
    current.innerHTML = syncControl(sync);
    if (focused) current.querySelector('button')?.focus({ preventScroll: true });
  } else renderChrome();
}

function openSettingsDraft() {
  settingsDraft = structuredClone(state.settings);
  settingsVersion = state.settingsAt;
  settingsDirty = false;
}

async function migrateLocalLedger(ledger, snapshot) {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return snapshot;
    const local = readBackup(JSON.parse(saved));
    const migrated = await ledger.transact((next) => Object.assign(next, mergeBackup(next, local)));
    if (cloud === ledger && localStorage.getItem(STORAGE_KEY) === saved) localStorage.removeItem(STORAGE_KEY);
    return migrated.snapshot;
  } catch (error) {
    if (error.status === 401) throw error;
    if (cloud === ledger)
      toast('Data lokal belum berhasil dipindahkan. Data itu masih tersimpan di browser.', true);
    return ledger.current ?? snapshot;
  }
}

async function refreshCloud(showToast = false) {
  const ledger = cloud;
  if (!ledger) return;
  if (cloudRead?.ledger === ledger) return cloudRead.task;
  const opening = !ledger.current;
  if (showToast || opening) setSyncPhase('loading');
  if (opening) render();
  const cycle = { ledger };
  cloudRead = cycle;
  cycle.task = (async () => {
    try {
      let snapshot = await ledger.refresh();
      if (cloud === ledger && opening) snapshot = await migrateLocalLedger(ledger, snapshot);
      if (cloud !== ledger) return;
      const changed = state !== snapshot.state;
      state = snapshot.state;
      if (sync.phase !== 'saving') setSyncPhase('ready');
      const refreshSettings = settingsDraft && !settingsDirty && settingsVersion !== state.settingsAt;
      if (refreshSettings) openSettingsDraft();
      if (changed && ($('#cloud-empty') || (ui.view === 'settings' ? refreshSettings : !currentDraft()?.dirty)))
        render();
      if (showToast) toast('Pembukuan tersinkron.');
    } catch (error) {
      if (cloud !== ledger) return;
      if (error.status === 401) return lockOwner(error.message);
      setSyncPhase('error');
      if (!cloud.current) render();
      if (showToast) toast(error.message, true);
    } finally {
      if (cloudRead === cycle) cloudRead = null;
    }
  })();
  return cycle.task;
}

function render() {
  closeChart?.();
  closeChart = null;
  const ready = Boolean(cloud?.current);
  document.body.classList.toggle('owner-locked', !ready);
  if (!ready) {
    viewContainer.innerHTML = ownerGate(Boolean(ownerSession), sync.phase, loginMessage);
    return;
  }
  renderChrome();
  const type = editType();
  if (type) {
    const draft = (drafts[type] ??= blankDraft(type));
    viewContainer.innerHTML = editor(type, draft, state);
    updateEditor(draft);
    return;
  }
  if (ui.view === 'history') {
    viewContainer.innerHTML = historyView(state, ui);
  } else if (ui.view === 'settings') {
    if (!settingsDraft) openSettingsDraft();
    viewContainer.innerHTML = settingsView(settingsDraft, ui.templateType);
    updateTemplatePreview();
  } else {
    const snapshot = report();
    if (ui.view === 'finance') viewContainer.innerHTML = financeView(state, snapshot, ui);
    else {
      viewContainer.innerHTML = dashboard(state, snapshot, ui);
      const chart = $('#trend-chart');
      if (chart) closeChart = mountChart(chart, $('#chart-tooltip'), trendPoints(snapshot.events, range()));
    }
  }
}

function go(view, replace = false) {
  if (!views.includes(view)) return;
  if (modal.open) modal.close();
  const changed = view !== ui.view;
  ui.view = view;
  if (changed || replace) {
    history[replace ? 'replaceState' : 'pushState'](null, '', '#' + view);
  }
  render();
  if (changed) {
    window.scrollTo(0, 0);
    viewContainer.focus({ preventScroll: true });
  }
}

window.addEventListener('popstate', () => {
  ui.view = locationView();
  if (modal.open) modal.close();
  render();
  window.scrollTo(0, 0);
});

window.addEventListener('storage', (event) => {
  if (event.key !== OWNER_SESSION_KEY || event.newValue || !ownerSession || !event.oldValue) return;
  try {
    if (JSON.parse(event.oldValue)?.token === ownerSession.token) lockOwner();
  } catch {
    // Changes to browser storage never authenticate a session.
  }
});

function dialog(title, body, actions) {
  if (modal.open) modal.close();
  modal.setAttribute('aria-labelledby', 'dialog-title');
  modal.innerHTML = `<div class="modal-head"><h2 id="dialog-title">${esc(title)}</h2>
    ${btn('', 'close', 'close-modal', 'plain btn-icon', 'aria-label="Tutup"')}</div>
    <div class="modal-body">${body}</div><div class="actions modal-actions">${actions}</div>`;
  modal.showModal();
}

function activateOwner(session) {
  ownerSession = session;
  loginMessage = '';
  cloud = createSyncedLedger(
    new URL('ledger', ownerApi),
    (url, options) => ownerRequest(url, options, session.token),
    { documents: true },
  );
  return refreshCloud();
}

function lockOwner(message = '') {
  if (ownerSession) forgetOwnerSession(ownerSession.token);
  ownerSession = null;
  cloud = null;
  cloudRead = null;
  sync.phase = 'idle';
  state = createState();
  for (const type of ['invoice', 'claim']) {
    clearTimeout(drafts[type]?.rawTimer);
    delete drafts[type];
  }
  settingsDraft = null;
  settingsDirty = false;
  settingsVersion = '';
  confirmAction = null;
  expenseDraft = null;
  ui.historyQuery = '';
  if (modal.open) modal.close();
  modal.replaceChildren();
  for (const selector of ['#sidebar', '#topbar', '#bottom-nav', '#print-page', '#toast']) {
    $(selector).replaceChildren();
  }
  $('#backup-input').value = '';
  loginMessage = message;
  render();
}

async function submitOwnerLogin(form) {
  const submit = form.querySelector('button[type="submit"]');
  if (submit.disabled) return;
  const status = $('#owner-status');
  const fields = new FormData(form);
  const username = String(fields.get('username') || '');
  const password = String(fields.get('password') || '');
  const remember = fields.has('remember');
  status.classList.remove('login-error');
  status.textContent = 'Memeriksa login…';
  submit.disabled = true;
  try {
    const session = await signInOwner(ownerApi, username, password, remember);
    form.reset();
    const stored = storeOwnerSession(session, remember);
    await activateOwner(session);
    if (!stored && ownerSession === session)
      toast('Penyimpanan browser tidak tersedia. Masuk kembali setelah halaman ditutup.', true);
  } catch (error) {
    status.classList.add('login-error');
    status.textContent =
      error.message === 'Failed to fetch' ? 'Koneksi terputus. Coba masuk lagi.' : error.message;
    form.elements.password.value = '';
    form.elements.password.focus();
  } finally {
    submit.disabled = false;
  }
}

async function logoutOwner() {
  const session = ownerSession;
  if (!session) return;
  lockOwner('Kamu sudah keluar.');
  try {
    const response = await ownerRequest(new URL('logout', ownerApi), { method: 'POST' }, session.token);
    if (!response.ok && response.status !== 401) throw new Error('Logout failed');
  } catch {
    toast('Sesi di browser ini sudah ditutup. Server belum menerima permintaan keluar.', true);
  }
}

function confirm(title, message, label, action, danger = false) {
  confirmAction = action;
  dialog(
    title,
    '<p>' + esc(message) + '</p>',
    btn('Kembali', '', 'close-modal') + btn(label, '', 'confirm-modal', danger ? 'danger' : 'primary'),
  );
}

function openNew(type, invoice = null) {
  const reset = () => {
    const draft = (drafts[type] = blankDraft(type));
    if (invoice) setLinked(draft, invoice);
    go(type);
    window.scrollTo(0, 0);
  };
  if (drafts[type]?.dirty) {
    confirm(
      type === 'claim' ? 'Buat klaim baru?' : 'Buat invoice baru?',
      'Draf yang sedang dibuka punya perubahan yang belum disimpan.',
      'Buat baru',
      reset,
    );
  } else reset();
}

function setLinked(draft, invoice) {
  if (!invoice) {
    draft.invoiceId = '';
    return;
  }
  Object.assign(draft, {
    invoiceId: invoice.id,
    invoiceNumber: invoice.number,
    product: invoice.product,
    customer: invoice.customer,
    contact: invoice.contact,
    packageId: invoice.packageId,
    packageLabel: invoice.packageLabel,
  });
}

function openRecord(type, id) {
  const kind = type === 'claim' ? 'claims' : 'invoices';
  const item = state[kind].find((record) => record.id === id);
  if (!item) return toast('Transaksi tidak ditemukan.', true);
  const open = () => {
    if (drafts[type]?.id !== id || !drafts[type]?.dirty) {
      const { document, ...details } = item;
      const draft = (drafts[type] = { ...blankDraft(type), ...details, ...structuredClone(document) });
      draft.accountsOpen = draft.accounts.length > 0;
      if (type === 'invoice') draft.dateMode = 'manual';
      else if (draft.replacementQty && draft.replacementQty !== draft.accounts.length) {
        draft.touched.add('replacementQty');
      }
    }
    go(type);
  };
  if (drafts[type]?.dirty && drafts[type].id !== id) {
    confirm(
      'Buka transaksi lain?',
      'Draf aktif memiliki perubahan yang belum disimpan.',
      'Buka transaksi',
      open,
    );
  } else open();
}

function choosePackage(type, draft, id) {
  const p = state.settings.packages[id];
  if (!p || draft.packageId === id) return;
  Object.assign(draft, { packageId: id, packageLabel: p.label });
  if (type === 'invoice') {
    draft.price = p.price;
    draft.warrantyDays = p.days;
    if (!draft.touched.has('unitCost')) draft.unitCost = p.cost;
  }
}

function output(type, draft) {
  if (draft.editMessage) return draft.customMessage;
  return composeMessage(type, draft.includeAccounts ? draft : { ...draft, accounts: [] }, state);
}

function syncEditorFields(draft) {
  document.querySelectorAll('[data-draft]').forEach((input) => {
    const value = draft[input.dataset.draft];
    if (input.type === 'radio') input.checked = input.value === value;
    else if (input.type === 'checkbox') input.checked = Boolean(value);
    else if (input.value !== String(value ?? '')) input.value = value ?? '';
  });
}

function syncInvoiceDate(draft) {
  const automatic = draft.dateMode === 'auto';
  if (automatic) draft.date = today();
  const field = $('[data-draft="date"]');
  field.readOnly = automatic;
  if (field.value !== draft.date) field.value = draft.date;
  if (!draft.id && draft.status === 'paid' && !draft.touched.has('paymentDate')) {
    draft.paymentDate = draft.date;
    const paymentDateField = $('[data-draft="paymentDate"]');
    if (paymentDateField.value !== draft.paymentDate) paymentDateField.value = draft.paymentDate;
  }
}

function refreshOpenInvoice() {
  if (ui.view !== 'invoice') return;
  const draft = drafts.invoice;
  if (draft?.dateMode === 'auto' && draft.date !== today()) updateEditor(draft);
}

window.setInterval(refreshOpenInvoice, 30000);
window.addEventListener('focus', refreshOpenInvoice);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) refreshOpenInvoice();
});

function updateEditor(draft, refreshImport = false) {
  if (currentDraft() !== draft) return;
  const type = editType();
  if (type === 'invoice') syncInvoiceDate(draft);
  const preview = $('#message-preview');
  if (preview) preview.textContent = output(type, draft);
  if (type === 'claim') {
    const cost = claimDetails(draft);
    const fallbackPrice =
      state.invoices.find((item) => item.id === draft.invoiceId)?.price ??
      state.settings.packages[draft.packageId].price;
    $('[data-draft="replacementPrice"]').placeholder = fallbackPrice.toLocaleString('id-ID');
    $('#document-calc').innerHTML = claimCalc(cost);
  } else {
    $('#document-calc').innerHTML = invoiceCalc(draft, state);
    $('#payment-fields').hidden = draft.status !== 'paid';
    $('#refund-date-field').hidden = !draft.refund;
    const priceTag = $('input[data-draft="packageId"]:checked')?.closest('.pack-option')?.querySelector('span');
    if (priceTag) priceTag.textContent = money(draft.price) + ' / akun';
    const listed = draft.accounts.filter((account) => account.email).length;
    $('#qty-hint').innerHTML =
      listed && listed !== draft.qty
        ? `<p class="account-hint">${listed} detail akun tersedia untuk ${esc(draft.qty || 0)} unit pada invoice.</p>`
        : '';
  }
  if (refreshImport) {
    $('#import-feedback').innerHTML = importFeedback(draft);
    $('#account-list').innerHTML = accountRows(draft);
    $('#accounts-summary').textContent = `Detail akun manual (${draft.accounts.length})`;
    $('#clear-raw').hidden = !draft.raw && !draft.accounts.length;
    $('#account-storage-note').textContent =
      draft.id && !draft.accounts.some((account) => account.email)
        ? 'Belum ada detail akun tersimpan. Tempel atau unggah ulang data akun, lalu simpan.'
        : 'Detail akun disimpan terenkripsi saat transaksi disimpan.';
  }
}

function importUnitCost(amount, quantity) {
  const idr = amount?.idr;
  return Number.isSafeInteger(idr) && quantity > 0 && idr % quantity === 0 && idr / quantity <= 1000000000
    ? idr / quantity
    : null;
}

function countReplacementAccounts(draft, reportedQty = 0) {
  if (draft.touched.has('replacementQty')) return;
  draft.replacementQty =
    reportedQty ||
    draft.accounts.filter((account) => account.email.trim()).length ||
    Number(draft.replacementUnitCost !== null);
  const field = $('[data-draft="replacementQty"]');
  if (currentDraft() === draft && field) field.value = draft.replacementQty || '';
}

function processRaw(type, draft) {
  clearTimeout(draft.rawTimer);
  if (!draft.rawDirty) return;
  draft.rawDirty = false;
  const result = parseOrder(draft.raw, draft.source);
  const keepAccounts = draft.id && draft.accounts.length && !result.accounts.length;
  Object.assign(draft, {
    accounts: keepAccounts ? draft.accounts : result.accounts,
    parsedCount: result.accounts.length,
    importWarnings:
      keepAccounts && draft.raw.trim()
        ? [...result.warnings, 'Detail akun yang sudah ada masih tersimpan. Periksa format data baru.']
        : result.warnings,
    rawConflict: result.conflict,
  });
  if (type === 'invoice' && !draft.id) {
    const { meta } = result;
    if (!draft.touched.has('packageId')) choosePackage(type, draft, meta.packageId || 'short');
    const candidates = {
      supplierRef: meta.reference || '',
      supplierAmount: meta.amount?.original || '',
      supplierDate: meta.date || '',
      product: meta.product || state.settings.product,
      customer: meta.customer || '',
      qty: meta.qty || result.accounts.length || 1,
      unitCost: state.settings.packages[draft.packageId].cost,
    };
    candidates.unitCost = importUnitCost(meta.amount, candidates.qty) ?? candidates.unitCost;
    for (const [name, value] of Object.entries(candidates)) {
      if (!draft.touched.has(name)) draft[name] = value;
    }
  }
  if (type === 'claim' && !keepAccounts) {
    const { meta } = result;
    countReplacementAccounts(draft, Math.max(meta.qty ?? 0, result.accounts.length));
    if (!draft.id && !draft.touched.has('replacementUnitCost')) {
      draft.supplierAmount = meta.amount?.original || '';
      draft.replacementUnitCost = importUnitCost(meta.amount, draft.replacementQty);
    }
  }
  if (currentDraft() === draft) {
    syncEditorFields(draft);
    updateEditor(draft, true);
  }
}

function setRaw(type, draft, raw, filename = '', defer = false) {
  Object.assign(draft, {
    raw,
    source: filename,
    dirty: true,
    rawDirty: true,
    importError: '',
    importBusy: false,
    importToken: draft.importToken + 1,
  });
  clearTimeout(draft.rawTimer);
  if (currentDraft() === draft && $('#raw-order').value !== raw) $('#raw-order').value = raw;
  if (defer) draft.rawTimer = window.setTimeout(() => processRaw(type, draft), 130);
  else processRaw(type, draft);
}

async function importOrder(file) {
  const type = editType();
  const draft = currentDraft();
  if (!draft || !file) return;
  processRaw(type, draft);
  const token = ++draft.importToken;
  Object.assign(draft, { importBusy: true, importError: '' });
  updateEditor(draft, true);
  try {
    const raw = await readImportFile(file);
    if (token !== draft.importToken || drafts[type] !== draft) return;
    setRaw(type, draft, raw, file.name);
  } catch (error) {
    if (token !== draft.importToken || drafts[type] !== draft) return;
    draft.importBusy = false;
    draft.importError = error instanceof Error ? error.message : 'File tidak dapat dibaca.';
    updateEditor(draft, true);
  }
}

function checkEditor(type, draft) {
  if (draft.importBusy) throw new Error('Tunggu sampai file selesai dibaca.');
  if (draft.rawConflict) throw new Error('Masukkan satu order untuk setiap invoice atau klaim.');
  if (!validDate(draft.date)) throw new Error('Isi tanggal transaksi.');
  if (
    draft.accounts.some(
      (account) => !account.email.trim() && (account.password || account.key || account.verification),
    )
  ) {
    throw new Error('Isi email untuk setiap detail akun yang memiliki password, 2FA key, atau tautan OTP.');
  }
  if (draft.editMessage && draft.customMessage.length > MAX_MESSAGE_LENGTH)
    throw new Error('Pesan terlalu panjang. Pendekkan pesan sebelum menyimpannya.');
  if (type === 'claim') {
    if (!draft.invoiceNumber.trim()) throw new Error('Isi nomor invoice asal.');
    const listed = draft.accounts.filter((account) => account.email.trim()).length;
    if ((draft.replacementUnitCost && !draft.replacementQty) || (listed && draft.replacementQty < listed))
      throw new Error('Isi jumlah akun pengganti sesuai detail akun dan modal.');
    return;
  }
  if (!draft.product.trim()) throw new Error('Isi nama produk.');
  const detail = priceDetails(draft);
  if (draft.discount > detail.running) throw new Error('Diskon tidak boleh melebihi subtotal.');
  if (draft.status === 'paid' && !validDate(draft.paymentDate)) throw new Error('Isi tanggal pembayaran.');
  if (draft.status === 'paid' && draft.refund) {
    if (draft.refund > detail.total) throw new Error('Refund tidak boleh melebihi total tagihan.');
    if (!validDate(draft.refundDate) || draft.refundDate < draft.paymentDate)
      throw new Error('Tanggal refund harus sama atau sesudah tanggal pembayaran.');
  }
}

const collection = (type) => ({ invoice: 'invoices', claim: 'claims', expense: 'expenses' })[type];

function checkRevision(existing, draft) {
  if (draft.id && (!existing || existing.updatedAt !== draft.updatedAt)) {
    throw new Error('Transaksi sudah diubah di sesi lain. Buka ulang dari riwayat.');
  }
}

async function saveEditor(type, draft, allowDuplicate = false) {
  if (editorSaving) return;
  processRaw(type, draft);
  if (type === 'invoice') syncInvoiceDate(draft);
  if (!$('#editor-form').reportValidity()) return;
  checkEditor(type, draft);
  if (
    type === 'invoice' &&
    draft.supplierRef.trim() &&
    !allowDuplicate &&
    state.invoices.some(
      (i) =>
        i.id !== draft.id &&
        i.status !== 'cancelled' &&
        i.supplierRef.toLowerCase() === draft.supplierRef.trim().toLowerCase(),
    )
  ) {
    confirm(
      'Referensi supplier sudah dipakai',
      'Referensi yang sama sudah tercatat pada invoice lain.',
      'Simpan invoice ini',
      () => saveEditor(type, draft, true),
    );
    return;
  }
  editorSaving = true;
  try {
    const record = await persist((next) => {
      const key = collection(type);
      const id = draft.id || (draft.pendingId ??= newId());
      const existing = next[key].find((record) => record.id === id);
      checkRevision(existing, draft);
      if (!draft.id && existing) return existing;
      const stamp = new Date().toISOString();
      const serial = draft.id ? null : nextNumber(next, type, draft.date);
      if (serial) next[type === 'claim' ? 'nextClaim' : 'nextInvoice'] = serial.next;
      const data = {
        ...draft,
        document: cleanDocument(draft),
        id,
        number: draft.number || serial.number,
        createdAt: existing?.createdAt || stamp,
        updatedAt: stamp,
      };
      if (type === 'claim') {
        const linked = data.invoiceId ? next.invoices.find((invoice) => invoice.id === data.invoiceId) : null;
        if (data.invoiceId && !linked)
          throw new Error('Invoice asal tidak ditemukan. Pilih invoice lain atau isi nomornya secara manual.');
        if (linked) data.invoiceNumber = linked.number;
        if (data.replacementQty && data.replacementPrice === null)
          data.replacementPrice = linked?.price ?? next.settings.packages[data.packageId].price;
      }
      const clean = (type === 'claim' ? cleanClaim : cleanInvoice)(data, { documents: true });
      next[key] = [...next[key].filter((record) => record.id !== data.id), clean];
      return clean;
    });
    const { document, ...details } = record;
    Object.assign(draft, details, structuredClone(document), { dirty: false });
    if (type === 'invoice') draft.dateMode = 'manual';
    render();
    toast(`${type === 'claim' ? 'Klaim' : 'Invoice'} ${record.number} tersimpan.`);
  } finally {
    editorSaving = false;
  }
}

async function removeRecord(type, draft) {
  await persist((next) => {
    const key = collection(type);
    const record = next[key].find((item) => item.id === draft.id);
    checkRevision(record, draft);
    if (type === 'invoice' && next.claims.some((claim) => claim.invoiceId === draft.id)) {
      throw new Error(
        'Invoice ini memiliki klaim terkait. Buka klaim untuk mengubah referensinya terlebih dahulu.',
      );
    }
    next[key] = next[key].filter((item) => item.id !== draft.id);
    next.deleted[draft.id] = new Date().toISOString();
  });
  delete drafts[type];
  if (type === 'expense') go('finance');
  else {
    ui.historyType = collection(type);
    ui.historyStatus = '';
    go('history');
  }
  toast('Transaksi dihapus.');
}

function download(filename, contents, contentType) {
  const url = URL.createObjectURL(new Blob([contents], { type: contentType }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2500);
}

async function copy(text) {
  try {
    if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
    await navigator.clipboard.writeText(text);
  } catch {
    const el = document.createElement('textarea');
    el.style.position = 'fixed';
    el.style.opacity = '0';
    el.value = text;
    document.body.append(el);
    el.select();
    const copied = document.execCommand('copy');
    el.remove();
    if (!copied) throw new Error('Browser menolak akses papan klip. Pilih dan salin teks dari pratinjau.');
  }
}

function documentOutput(action) {
  const type = editType();
  const draft = currentDraft();
  if (!draft) return;
  processRaw(type, draft);
  if (draft.importBusy || draft.rawConflict) {
    throw new Error(
      draft.rawConflict ? 'Tempel data satu order sebelum membuat pesan.' : 'Tunggu file selesai dibaca.',
    );
  }
  if (type === 'invoice') {
    updateEditor(draft);
    if (!validDate(draft.date)) throw new Error('Isi tanggal invoice sebelum membuat pesan.');
  }
  const message = output(type, draft);
  if (!message.trim()) throw new Error('Pesan masih kosong.');
  const number = draft.number || nextNumber(state, type, draft.date).number;
  if (action === 'copy-message') {
    return copy(message).then(() =>
      toast(draft.id ? 'Pesan disalin.' : 'Pesan disalin. Simpan transaksi untuk mencatat nomornya.'),
    );
  }
  if (action === 'download-message') download(number + '.txt', message, 'text/plain;charset=utf-8');
  if (action === 'print-message') {
    const title = type === 'claim' ? 'Klaim Garansi' : 'Invoice';
    const text = message
      .replace(/^\*([^*\n]+)\*$/gm, '$1')
      .replace(/^(Total|Status): \*([^*\n]+)\*$/gm, '$1: $2');
    $('#print-page').innerHTML = `<div class="print-head"><h1>${esc(state.settings.business)} · ${title}</h1>
      <p>${esc(number)} · ${formatDate(draft.date)}</p></div><pre>${esc(text)}</pre>`;
    window.print();
  }
}

window.addEventListener('afterprint', () => {
  $('#print-page').replaceChildren();
});

function openExpense(id = '') {
  expenseDraft = state.expenses.find((item) => item.id === id) ?? {
    id: '',
    name: '',
    amount: '',
    date: today(),
    category: 'Operasional',
    notes: '',
  };
  dialog(
    id ? 'Edit pengeluaran' : 'Tambah pengeluaran',
    expenseForm(expenseDraft),
    (id ? btn('Hapus', 'trash', 'delete-expense') : btn('Batal', '', 'close-modal')) +
      '<button form="expense-form" type="submit" class="btn btn-primary">' +
      icon('save') +
      'Simpan biaya</button>',
  );
}

async function saveExpense(form) {
  if (expenseSaving) return;
  const draft = { ...expenseDraft, ...Object.fromEntries(new FormData(form)) };
  if (Number(draft.amount) <= 0 || !draft.name.trim())
    throw new Error('Isi nama dan nominal pengeluaran lebih dari Rp0.');
  expenseSaving = true;
  const id = draft.id || (expenseDraft.pendingId ??= newId());
  try {
    await persist((next) => {
      const existing = next.expenses.find((item) => item.id === id);
      checkRevision(existing, draft);
      if (!draft.id && existing) return;
      const stamp = new Date().toISOString();
      const item = cleanExpense({
        ...draft,
        id,
        createdAt: existing?.createdAt || stamp,
        updatedAt: stamp,
      });
      next.expenses = [...next.expenses.filter((expense) => expense.id !== item.id), item];
    });
    modal.close();
    render();
    toast('Pengeluaran tersimpan.');
  } finally {
    expenseSaving = false;
  }
}

function updateTemplatePreview() {
  const type = ui.templateType;
  const key = type === 'claim' ? 'claimTemplate' : 'invoiceTemplate';
  const invalid = [
    ...new Set(
      [...settingsDraft[key].matchAll(/\{\{\s*([a-z_]+)\s*\}\}/g)]
        .map((match) => match[1])
        .filter((name) => !Object.hasOwn(VARIABLES[type], name)),
    ),
  ];
  $('#template-validation').textContent = invalid.length
    ? 'Variabel tidak dikenal · ' + invalid.join(', ')
    : '';
  const previewState = { ...state, settings: cleanSettings(settingsDraft) };
  const draft = blankDraft(type, previewState);
  draft.customer = 'Pelanggan Contoh';
  draft.accounts = parseOrder(SAMPLE_TEXT).accounts;
  if (type === 'claim')
    Object.assign(draft, {
      status: 'resolved',
      invoiceNumber: 'JUU-CONTOH',
      resolution: 'Akun pengganti sudah disiapkan.',
    });
  $('#template-preview').textContent = settingsDraft[key].trim()
    ? composeMessage(type, draft, previewState)
    : 'Isi template untuk melihat hasilnya.';
}

async function updateSettings() {
  if (settingsSaving) return;
  if (!settingsDraft.invoiceTemplate.trim() || !settingsDraft.claimTemplate.trim()) {
    throw new Error('Isi kedua template pesan sebelum menyimpan.');
  }
  const changes = cleanSettings(settingsDraft);
  const version = settingsVersion;
  settingsSaving = true;
  try {
    await persist((next) => {
      if (cloud && next.settingsAt !== version) {
        throw new Error('Pengaturan sudah diubah di perangkat lain. Muat ulang halaman dan coba lagi.');
      }
      next.settings = changes;
      next.settingsAt = new Date().toISOString();
    });
    openSettingsDraft();
    for (const type of ['invoice', 'claim']) {
      if (drafts[type] && !drafts[type].id && !drafts[type].dirty) drafts[type] = blankDraft(type);
    }
    render();
    toast('Pengaturan disimpan.');
  } finally {
    settingsSaving = false;
  }
}

function exportCsv() {
  const rows = report().events.filter((event) => !ui.ledgerKind || event.kind === ui.ledgerKind);
  const headers = [
    'Tanggal',
    'Jenis',
    'Referensi',
    'Keterangan',
    'Paket',
    'Omzet bersih (Rp)',
    'Modal akun (Rp)',
    'Biaya (Rp)',
    'Dampak laba (Rp)',
    'Modal lengkap',
  ];
  const records = rows.map((e) => [
    e.date,
    e.label,
    e.reference,
    e.description,
    state.settings.packages[e.packageId]?.label || '',
    e.revenue,
    e.cost ?? '',
    e.fee,
    e.revenue - (e.cost ?? 0) - e.fee,
    e.cost === null ? 'Belum' : 'Ya',
  ]);
  download(`keuangan-${today()}.csv`, csvString([headers, ...records]), 'text/csv;charset=utf-8');
  toast('Laporan CSV diunduh.');
}

async function importBackup(file) {
  if (!file) return;
  if (file.size > 10 * 1024 * 1024) throw new Error('Cadangan maksimal 10 MB.');
  let incoming;
  try {
    incoming = readBackup(JSON.parse(await file.text()));
  } catch {
    throw new Error('File ini bukan cadangan Nota Reseller yang valid.');
  }
  confirm(
    'Gabungkan cadangan?',
    `Cadangan memuat ${incoming.invoices.length} invoice, ${incoming.claims.length} klaim, dan ${incoming.expenses.length} pengeluaran. Versi terbaru dari setiap transaksi akan dipakai.`,
    'Gabungkan data',
    async () => {
      const duplicate = await persist((next) => {
        Object.assign(next, mergeBackup(next, incoming));
        return new Set(next.invoices.map((item) => item.number)).size < next.invoices.length;
      });
      openSettingsDraft();
      render();
      toast(
        duplicate
          ? 'Cadangan digabung. Ada nomor invoice yang sama dari perangkat berbeda.'
          : 'Cadangan berhasil digabung.',
      );
    },
  );
}

function readDraftField(el) {
  const type = editType();
  const draft = currentDraft();
  const fieldName = el.dataset.draft;
  const value =
    el.type === 'checkbox'
      ? el.checked
      : el.type === 'number'
        ? el.value === ''
          ? ['unitCost', 'replacementUnitCost', 'replacementPrice'].includes(fieldName)
            ? null
            : ''
          : el.valueAsNumber
        : el.value;
  draft.dirty = true;
  draft.touched.add(fieldName);
  if (fieldName === 'packageId') {
    choosePackage(type, draft, value);
    syncEditorFields(draft);
  } else if (fieldName === 'invoiceId') {
    setLinked(
      draft,
      state.invoices.find((invoice) => invoice.id === value),
    );
    render();
  } else {
    draft[fieldName] = value;
    if (fieldName === 'replacementUnitCost') countReplacementAccounts(draft, draft.replacementQty);
    if (fieldName === 'dateMode' && !validDate(draft.date)) draft.date = today();
    if (fieldName === 'status' && type === 'invoice') {
      if (value === 'paid') draft.paymentDate ||= draft.id ? today() : draft.date;
      else Object.assign(draft, { paymentDate: '', refund: 0, refundDate: '' });
      syncEditorFields(draft);
    }
    if (fieldName === 'refund' && value && !draft.refundDate) {
      draft.refundDate = today();
      $('[data-draft="refundDate"]').value = draft.refundDate;
    }
  }
  updateEditor(draft);
}

function updateControl(el) {
  const key = el.dataset.control;
  if (
    (key === 'periodStart' || key === 'periodEnd') &&
    (!validDate(el.value) || (key === 'periodStart' ? el.value > ui.periodEnd : el.value < ui.periodStart))
  ) {
    el.value = ui[key];
    toast('Pilih rentang tanggal yang valid.', true);
    return;
  }
  ui[key] = el.value;
  if (key.startsWith('history')) {
    ui.historyPage = 1;
    $('#history-rows').innerHTML = historyRows(state, ui);
  } else if (key === 'ledgerKind') {
    ui.ledgerPage = 1;
    $('#ledger-rows').innerHTML = ledgerRows(report(), ui);
  } else {
    ui.ledgerPage = 1;
    render();
    $(`[data-control="${key}"]`)?.focus({ preventScroll: true });
  }
}

document.addEventListener('input', (event) => {
  const el = event.target;
  const draft = currentDraft();
  if (draft && el.id === 'raw-order') setRaw(editType(), draft, el.value, '', true);
  else if (draft && el.id === 'message-editor') Object.assign(draft, { customMessage: el.value, dirty: true });
  else if (draft && el.dataset.account) {
    const row = draft.accounts[Number(el.dataset.index)];
    if (row) row[el.dataset.account] = el.value;
    draft.dirty = true;
    if (editType() === 'claim' && el.dataset.account === 'email') countReplacementAccounts(draft);
    updateEditor(draft);
  } else if (draft && el.dataset.draft && !['SELECT', 'FIELDSET'].includes(el.tagName) && el.type !== 'radio') {
    readDraftField(el);
  } else if (el.dataset.setting) {
    settingsDirty = true;
    const [key, part] = el.dataset.setting.split('.');
    if (part)
      settingsDraft.packages[key][part] =
        el.type === 'number' ? (el.value === '' ? null : el.valueAsNumber) : el.value;
    else settingsDraft[key] = el.value;
    updateTemplatePreview();
  } else if (el.dataset.control === 'historyQuery') updateControl(el);
});

document.addEventListener('change', (event) => {
  const el = event.target;
  if (el.id === 'order-input' || el.id === 'backup-input') {
    const file = el.files?.[0];
    el.value = '';
    const action = el.id === 'order-input' ? importOrder(file) : importBackup(file);
    action.catch((error) => toast(error.message, true));
  } else if (el.dataset.control && el.dataset.control !== 'historyQuery') updateControl(el);
  else if (currentDraft() && el.dataset.draft && (el.tagName === 'SELECT' || el.type === 'radio'))
    readDraftField(el);
});

document.addEventListener('dragover', (event) => {
  const zone = event.target.closest('#dropzone');
  if (!zone || !Array.from(event.dataTransfer.types).includes('Files')) return;
  event.preventDefault();
  zone.classList.add('dragging');
});

document.addEventListener('dragleave', (event) => {
  const zone = event.target.closest('#dropzone');
  if (zone && !zone.contains(event.relatedTarget)) zone.classList.remove('dragging');
});

document.addEventListener('drop', (event) => {
  const zone = event.target.closest('#dropzone');
  if (!zone) return;
  event.preventDefault();
  zone.classList.remove('dragging');
  if (event.dataTransfer.files.length > 1) return toast('Pilih satu file untuk setiap order.', true);
  importOrder(event.dataTransfer.files[0]);
});

document.addEventListener(
  'toggle',
  (event) => {
    if (event.target.id === 'accounts-panel' && currentDraft()) currentDraft().accountsOpen = event.target.open;
  },
  true,
);

document.addEventListener('submit', async (event) => {
  const form = event.target;
  event.preventDefault();
  try {
    if (form.id === 'editor-form') await saveEditor(editType(), currentDraft());
    if (form.id === 'expense-form') await saveExpense(form);
    if (form.id === 'settings-form') await updateSettings();
    if (form.id === 'owner-login') await submitOwnerLogin(form);
  } catch (error) {
    toast(error.message, true);
  }
});

const actions = {
  nav: (id) => go(id),
  'sync-now': () => refreshCloud(true),
  'owner-logout': logoutOwner,
  'mobile-menu': () =>
    dialog(
      'Lainnya',
      '<div class="modal-guide">' +
        btn('Riwayat transaksi', 'history', 'nav', 'outline', 'data-id="history"') +
        btn('Pengaturan toko', 'settings', 'nav', 'outline', 'data-id="settings"') +
        btn('Keluar', 'lock', 'owner-logout', 'plain') +
        '</div>',
      '',
    ),
  'close-modal': () => modal.close(),
  'confirm-modal': async () => {
    const action = confirmAction;
    confirmAction = null;
    modal.close();
    if (action) await action();
  },
  'new-invoice': () => openNew('invoice'),
  'new-claim': () => openNew('claim'),
  'edit-invoice': (id) => openRecord('invoice', id),
  'edit-claim': (id) => openRecord('claim', id),
  'claim-for': (id) => {
    openNew(
      'claim',
      state.invoices.find((invoice) => invoice.id === id),
    );
  },
  'scroll-preview': () => $('#editor-preview').scrollIntoView({ block: 'start', behavior: 'instant' }),
  'pick-file': () => $('#order-input').click(),
  'load-sample': () => {
    confirm('Contoh format data akun', SAMPLE_TEXT, 'Gunakan contoh', () =>
      setRaw(editType(), currentDraft(), SAMPLE_TEXT),
    );
  },
  'clear-raw': () => {
    const type = editType();
    const draft = currentDraft();
    const clear = () => {
      draft.accounts = [];
      setRaw(type, draft, '');
    };
    if (draft.id && draft.accounts.length)
      confirm(
        'Kosongkan semua detail akun?',
        'Perubahan berlaku setelah transaksi disimpan kembali.',
        'Kosongkan',
        clear,
        true,
      );
    else clear();
  },
  'supplier-date': () => {
    const draft = currentDraft();
    if (!draft.supplierDate) return;
    draft.dateMode = 'manual';
    draft.date = draft.supplierDate;
    draft.touched.add('date');
    draft.dirty = true;
    syncEditorFields(draft);
    updateEditor(draft);
  },
  'add-account': () => {
    const draft = currentDraft();
    processRaw(editType(), draft);
    if (draft.accounts.length >= 1000) throw new Error('Maksimal 1.000 akun per invoice.');
    draft.accounts.push({ email: '', password: '', key: '', verification: '' });
    draft.dirty = true;
    updateEditor(draft, true);
    $('#accounts-panel').open = true;
    $('[data-account="email"][data-index="' + (draft.accounts.length - 1) + '"]').focus();
  },
  'remove-account': (id) => {
    const draft = currentDraft();
    draft.accounts.splice(Number(id), 1);
    draft.dirty = true;
    if (editType() === 'claim') countReplacementAccounts(draft);
    updateEditor(draft, true);
  },
  'edit-message': () => {
    const draft = currentDraft();
    processRaw(editType(), draft);
    if (editType() === 'invoice') syncInvoiceDate(draft);
    if (!draft.editMessage) draft.customMessage = output(editType(), draft);
    draft.editMessage = !draft.editMessage;
    draft.dirty = true;
    render();
    $('#message-editor')?.focus();
  },
  'copy-message': () => documentOutput('copy-message'),
  'download-message': () => documentOutput('download-message'),
  'print-message': () => documentOutput('print-message'),
  'delete-record': () => {
    const type = editType();
    const draft = currentDraft();
    confirm(
      'Hapus ' + (type === 'claim' ? 'klaim' : 'invoice') + '?',
      `Transaksi ${draft.number} akan dihapus dari riwayat dan laporan.`,
      'Hapus transaksi',
      () => removeRecord(type, draft),
      true,
    );
  },
  'history-type': (id) => {
    Object.assign(ui, { historyType: id, historyStatus: '', historyPage: 1 });
    render();
  },
  'history-page': (id) => {
    ui.historyPage = Number(id);
    $('#history-rows').innerHTML = historyRows(state, ui);
  },
  'ledger-page': (id) => {
    ui.ledgerPage = Number(id);
    $('#ledger-rows').innerHTML = ledgerRows(report(), ui);
  },
  'new-expense': () => openExpense(),
  'edit-expense': (id) => openExpense(id),
  'delete-expense': () => {
    const draft = expenseDraft;
    confirm(
      'Hapus pengeluaran?',
      `${draft.name} akan dihapus dari laporan keuangan.`,
      'Hapus biaya',
      () => removeRecord('expense', draft),
      true,
    );
  },
  'export-csv': exportCsv,
  'template-type': (id) => {
    ui.templateType = id;
    for (const button of document.querySelectorAll('[data-action="template-type"]')) {
      button.setAttribute('aria-pressed', String(button.dataset.id === id));
    }
    $('#template-fields').innerHTML = templateFields(settingsDraft, id);
    updateTemplatePreview();
  },
  'add-token': (token) => {
    const area = $('#template-input');
    area.setRangeText('{{' + token + '}}', area.selectionStart, area.selectionEnd, 'end');
    settingsDraft[area.dataset.setting] = area.value;
    settingsDirty = true;
    area.focus();
    updateTemplatePreview();
  },
  'reset-template': () => {
    const area = $('#template-input');
    settingsDraft[area.dataset.setting] = area.value = createState().settings[area.dataset.setting];
    settingsDirty = true;
    updateTemplatePreview();
    toast('Template bawaan dipasang. Simpan untuk menerapkannya.');
  },
  'reset-login-guide': () => {
    const field = $('[data-setting="loginGuide"]');
    field.value = settingsDraft.loginGuide = createState().settings.loginGuide;
    settingsDirty = true;
    updateTemplatePreview();
    toast('Panduan login bawaan dipasang. Simpan untuk menerapkannya.');
  },
  'export-backup': () => {
    download(
      'nota-reseller-backup-' + today() + '.json',
      JSON.stringify(readBackup(state), null, 2),
      'application/json;charset=utf-8',
    );
    toast('Cadangan diunduh.');
  },
  'import-backup': () => $('#backup-input').click(),
};

document.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-action]');
  const handler = button && actions[button.dataset.action];
  if (!handler) return;
  try {
    await handler(button.dataset.id);
  } catch (error) {
    toast(error.message, true);
  }
});

const savedSession = readOwnerSession();
if (savedSession) void activateOwner(savedSession);
else render();

function checkOwnerSession() {
  if (ownerSession?.expiresAt <= Date.now()) return lockOwner('Sesi berakhir. Masuk kembali.');
  if (!document.hidden && navigator.onLine) void refreshCloud();
}
window.addEventListener('online', checkOwnerSession);
window.addEventListener('focus', checkOwnerSession);
document.addEventListener('visibilitychange', checkOwnerSession);
window.setInterval(checkOwnerSession, 15000);
