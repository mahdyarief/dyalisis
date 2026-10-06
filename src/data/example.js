// Dyalisis — CONTOH content layer (demo generik). Ganti dengan data aplikasi Anda.
// Kontrak wajib: APP, DOMAINS, ROOT, MODULES, NODES, ACTIONS, EDGES, DATA_EDGES, LEVELS, LEVEL_NAMES, levelOf.
export const APP = { name: 'Acme Ops', subtitle: 'Contoh — Hierarki Aplikasi → Modul → Fitur → Aksi' };
export const DOMAINS = {
  sales: { label: 'Penjualan',   color: '#22d3ee' },
  ops:   { label: 'Operasional', color: '#4ade80' },
  admin: { label: 'Admin',       color: '#a78bfa' }
};
export const ROOT = { id: 'app', label: 'Acme Ops', domain: 'admin',
  desc: 'Aplikasi demo untuk framework Dyalisis.', fields: 'tenant_id', route: 'app.example.com' };
export const MODULES = [
  { id: 'mod-sales', label: 'Penjualan',   domain: 'sales', desc: 'Alur pesanan sampai pembayaran.', fields: 'order_id, customer_id', route: 'orders/*, invoices/*', perm: 'orders.view' },
  { id: 'mod-ops',   label: 'Operasional', domain: 'ops',   desc: 'Pemenuhan pesanan & pengiriman.', fields: 'order_id, shipment_id', route: 'shipments/*, inventory/*', perm: 'shipments.view' },
  { id: 'mod-admin', label: 'Admin',       domain: 'admin', desc: 'Pengguna, peran, master data.',   fields: 'user_id, role_id', route: 'users/*, roles/*', perm: 'users.view' }
];
export const NODES = [
  { id: 'orders',    label: 'Pesanan',    domain: 'sales', desc: 'Buat & kelola pesanan.', fields: 'order_id, items', route: 'orders', perm: 'orders.view' },
  { id: 'invoices',  label: 'Faktur',     domain: 'sales', desc: 'Terbitkan & tagih faktur.', fields: 'invoice_id, amount', route: 'invoices', perm: 'invoices.view' },
  { id: 'shipments', label: 'Pengiriman', domain: 'ops',   desc: 'Kelola pengiriman.', fields: 'shipment_id, carrier', route: 'shipments', perm: 'shipments.view' },
  { id: 'inventory', label: 'Inventaris', domain: 'ops',   desc: 'Lacak stok barang.', fields: 'sku, qty', route: 'inventory', perm: 'inventory.view' },
  { id: 'users',     label: 'Pengguna',   domain: 'admin', desc: 'Kelola akun & akses.', fields: 'user_id, role_id', route: 'users', perm: 'users.view' }
];
const ACTION_DEFS = {
  orders:    ['Buat Pesanan', 'Edit Pesanan', 'Batalkan Pesanan'],
  invoices:  ['Terbitkan Faktur', 'Catat Pembayaran'],
  shipments: ['Buat Pengiriman', 'Update Status', 'Cetak Label'],
  inventory: ['Tambah Stok', 'Koreksi Stok'],
  users:     ['Tambah Pengguna', 'Atur Peran', 'Nonaktifkan']
};
export const ACTIONS = [];
for (const [fid, labels] of Object.entries(ACTION_DEFS)) {
  const feature = NODES.find((n) => n.id === fid);
  labels.forEach((label, i) => ACTIONS.push({ id: `${fid}~${i}`, label, parent: fid, domain: feature.domain }));
}
export const EDGES = [
  ...MODULES.map((m) => ['app', m.id, 'modul']),
  ...NODES.map((n) => [`mod-${n.domain}`, n.id, 'fitur']),
  ...ACTIONS.map((a) => [a.parent, a.id, 'aksi'])
];
export const DATA_EDGES = [
  ['orders', 'invoices', 'order_id'],
  ['orders', 'shipments', 'order_id'],
  ['shipments', 'inventory', 'sku'],
  ['invoices', 'inventory', 'sku'],
  ['users', 'orders', 'user_id']
];
// Architecture Decision Records (opsional) — tampil di panel Dokumentasi.
// Bentuk: { title, status: proposed|accepted|rejected|deprecated, context, decision }
export const DECISIONS = [
  { title: 'Pisahkan Order menjadi Shipment & Invoice',
    status: 'accepted',
    context: 'Satu pesanan bisa dikirim bertahap dan ditagih terpisah.',
    decision: 'Order jadi entitas induk; Shipment dan Invoice merujuk order_id.' },
  { title: 'Inventory sebagai sumber tunggal stok',
    status: 'accepted',
    context: 'Shipment dan Invoice sama-sama mengurangi stok via sku.',
    decision: 'Semua mutasi stok lewat entitas Inventory (sku sebagai kunci).' }
];
// Glosarium istilah (opsional) — tampil di panel Dokumentasi (arc42 §12).
export const GLOSSARY = [
  { term: 'order_id', definition: 'Kunci pesanan yang mengikat Shipment & Invoice.' },
  { term: 'sku', definition: 'Kode stok barang — kunci entitas Inventory.' }
];
export const LEVELS = { 0: ['app'], 1: MODULES.map((m) => m.id), 2: NODES.map((n) => n.id), 3: ACTIONS.map((a) => a.id) };
export const LEVEL_NAMES = { 0: 'Aplikasi', 1: 'Modul', 2: 'Fitur', 3: 'Aksi' };
export const levelOf = (id) => { for (const k in LEVELS) if (LEVELS[k].includes(id)) return +k; return 0; };