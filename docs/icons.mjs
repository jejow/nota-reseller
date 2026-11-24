const paths = {
  dashboard:
    '<rect x="3" y="3" width="7" height="7" rx="1.35"/><rect x="14" y="3" width="7" height="7" rx="1.35"/><rect x="3" y="14" width="7" height="7" rx="1.35"/><rect x="14" y="14" width="7" height="7" rx="1.35"/>',
  receipt: '<path d="M5 3.5h14v17l-2.3-1.5-2.4 1.5-2.3-1.5-2.3 1.5-2.4-1.5L5 20.5zM9 9h6M9 13h6"/>',
  shield:
    '<path d="M12 22s7.5-3.3 7.5-10V5l-7.5-3-7.5 3v7c0 6.7 7.5 10 7.5 10z"/><path d="m9 11.8 2 2.1 4-4.2"/>',
  history: '<path d="M3.1 12a9 9 0 1 1 2.4 6.1M3.1 12V6.7M3.1 12h5.2M12.1 7.6v4.6l3 1.9"/>',
  wallet:
    '<path d="M4 7.7V6a2 2 0 0 1 1.5-1.9L17 2v5.7M3.5 7.7h15a1.8 1.8 0 0 1 1.8 1.8v9a1.8 1.8 0 0 1-1.8 1.8h-15a1.8 1.8 0 0 1-1.8-1.8v-9a1.8 1.8 0 0 1 1.8-1.8z"/><path d="M20.3 12h-5a2 2 0 1 0 0 4h5M15.4 14h.1"/>',
  settings:
    '<path d="M10 3h4l.5 2.3a7.2 7.2 0 0 1 1.5.9l2.2-.7 2 3.5-1.7 1.6a7 7 0 0 1 0 1.8l1.7 1.6-2 3.5-2.2-.7a7.2 7.2 0 0 1-1.5.9L14 20h-4l-.5-2.3a7.2 7.2 0 0 1-1.5-.9l-2.2.7-2-3.5 1.7-1.6a7 7 0 0 1 0-1.8L3.8 9l2-3.5 2.2.7a7.2 7.2 0 0 1 1.5-.9z"/><circle cx="12" cy="11.5" r="2.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  upload: '<path d="M12 16V4m-4 4 4-4 4 4M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4"/>',
  download: '<path d="M12 4v12m-4-4 4 4 4-4M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>',
  calendar:
    '<rect x="3.5" y="5.2" width="17" height="15" rx="2"/><path d="M7.8 3.2v4m8.4-4v4M3.5 10h17m-12 4h2m3 0h2m-7 3h2"/>',
  chevron: '<path d="m6 9 6 6 6-6"/>',
  chevronRight: '<path d="m9 6 6 6-6 6"/>',
  coins:
    '<ellipse cx="8.5" cy="6.8" rx="5.5" ry="3"/><path d="M3 6.8v4.6c0 1.7 2.5 3 5.5 3 0 .9.2 1.6.7 2.3M14 6.8v3.3M3 11.3v4.2c0 1.7 2.5 3 5.5 3"/><ellipse cx="15.5" cy="13.6" rx="5.5" ry="3"/><path d="M10 13.6V18c0 1.7 2.5 3 5.5 3s5.5-1.3 5.5-3v-4.4"/>',
  box: '<path d="m12 3 8.5 4.5v9L12 21l-8.5-4.5v-9zm0 9 8.5-4.5M12 12 3.5 7.5M12 12v9M8 5.2l8.5 4.6"/>',
  trend: '<path d="m3.5 17.5 5.4-5.4 3.8 3.8 7-8M15 7.9h4.8v4.8"/>',
  bars: '<path d="M4 4v16h16M8 15v2m4-6v6m4-10v10m4-14v14"/>',
  spark:
    '<path d="M12 2.8c.9 5.7 3.5 8.3 9.2 9.2-5.7.9-8.3 3.5-9.2 9.2-.9-5.7-3.5-8.3-9.2-9.2 5.7-.9 8.3-3.5 9.2-9.2Z"/>',
  clock: '<circle cx="12" cy="12" r="8.8"/><path d="M12 7.4v5l3.2 2"/>',
  lock: '<rect x="5.4" y="10.2" width="13.2" height="10" rx="2"/><path d="M8 10.2V7a4 4 0 1 1 8 0v3.2M12 14.3v2.1"/>',
  filter:
    '<path d="M4 7h16M7 12h10m-7 5h4"/><circle cx="8" cy="7" r="1.4" fill="currentColor"/><circle cx="16" cy="12" r="1.4" fill="currentColor"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.4"/><path d="m15.1 15.1 4.4 4.4"/>',
  check: '<path d="m5 12 4.3 4.3L19 6.8"/>',
  checkCircle: '<circle cx="12" cy="12" r="8.8"/><path d="m8.2 12 2.6 2.6 5-5.1"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5m0-8h.01"/>',
  alert:
    '<path d="M10.4 4.7a1.8 1.8 0 0 1 3.2 0l7.1 12.6a1.8 1.8 0 0 1-1.6 2.7H4.9a1.8 1.8 0 0 1-1.6-2.7zM12 9.3v4.2m0 3.2h.01"/>',
  clipboard:
    '<path d="M9 5H6a1.5 1.5 0 0 0-1.5 1.5v13A1.5 1.5 0 0 0 6 21h12a1.5 1.5 0 0 0 1.5-1.5v-13A1.5 1.5 0 0 0 18 5h-3"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="M8.5 12h7m-7 4h7"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
  printer:
    '<path d="M7 8V4h10v4M7 17H4v-7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v7h-3"/><path d="M7 14h10v7H7zm9.5-3h.01"/>',
  save: '<path d="M18 20H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h10l4 4v10a2 2 0 0 1-2 2z"/><path d="M8 4v5h7V4M8 20v-7h8v7"/>',
  edit: '<path d="m14.4 6.4 3.2 3.2M4.4 19.6l4.2-.8L20 7.4l-3.4-3.4L5.2 15.4z"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  more: '<circle cx="5" cy="12" r="1" fill="currentColor"/><circle cx="12" cy="12" r="1" fill="currentColor"/><circle cx="19" cy="12" r="1" fill="currentColor"/>',
  file: '<path d="M6 3.5h7.5L19 9v11.5H6zM13.5 3.5V9H19M9 13h7m-7 3.5h7"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3m3 0-.8 13H6.8L6 7m4 3v7m4-7v7"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01"/>',
  inbox: '<path d="M4 12 7 5h10l3 7v7H4zM4 12h5l1.5 3h3l1.5-3h5"/>',
  store: '<path d="M4 10h16l-2-5H6l-2 5zm1 0v9h14v-9m-9 9v-5h4v5"/>',
  brackets: '<path d="m9 6-6 6 6 6m6-12 6 6-6 6"/>',
  eye: '<path d="M2.6 12s3.2-6 9.4-6 9.4 6 9.4 6-3.2 6-9.4 6-9.4-6-9.4-6Z"/><circle cx="12" cy="12" r="2.4"/>',
  eyeOff:
    '<path d="M3 3l18 18M10.6 6.1A9.5 9.5 0 0 1 12 6c6.2 0 9.4 6 9.4 6a13 13 0 0 1-2.2 2.7M6.6 7.2C4 9 2.6 12 2.6 12s3.2 6 9.4 6a10 10 0 0 0 4.1-.8"/>',
  link: '<path d="M10.4 13.6a3.8 3.8 0 0 0 5.4 0l3.6-3.6a3.8 3.8 0 0 0-5.4-5.4l-2 2m1.6 3.8a3.8 3.8 0 0 0-5.4 0l-3.6 3.6a3.8 3.8 0 1 0 5.4 5.4l2-2"/>',
};

export function icon(name, className = '') {
  return (
    '<svg class="icon ' +
    className +
    '" width="20" height="20" viewBox="0 0 24 24" fill="none" ' +
    'stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    (paths[name] || paths.info) +
    '</svg>'
  );
}
