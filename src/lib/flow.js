// Dyalisis engine — jalur Alur aktif dari relasi data (DATA_EDGES).
// Dipisah dari index.jsx agar bisa diuji headless (test/run.mjs) tanpa ikut
// memuat komponen React.

/** Peta successor per node: { id: [{ to, field }, ...] }. */
function successorMap(dataEdges) {
  const out = {};
  (dataEdges || []).forEach(([s, t, f]) => {
    (out[s] = out[s] || []).push({ to: t, field: f });
  });
  return out;
}

/** Susun SATU jalur Alur aktif dari `startId` menuju hilir — selektif, bukan
 *  sub-grafik penuh. Menampilkan seluruh graph membuat highlight tak bermakna
 *  (di graph kecil hampir semua node ikut menyala), jadi alur dibatasi ke satu
 *  jalur: di tiap percabangan successor dipilih dari `branchChoice`
 *  (peta { nodeId: successorId }); bila tak ada, ambil successor pertama.
 *  Node yang sudah dikunjungi tak diulang (hindari siklus).
 *  @param {string} startId fitur awal
 *  @param {Array<[string,string,string]>} dataEdges relasi [dari, ke, field]
 *  @param {Record<string,string>} [branchChoice] pilihan cabang per node
 *  @returns {{ path: string[], edges: Array<[string,string,string]>,
 *              branches: Record<string, string[]> }}
 *  `branches` = peta nodeId → daftar semua successor id, HANYA untuk node di
 *  jalur yang punya >1 cabang (dipakai sidebar sebagai pemilih cabang).
 */
export function buildActivePath(startId, dataEdges, branchChoice = {}) {
  const out = successorMap(dataEdges);
  const path = [startId];
  const edges = [];
  const branches = {};
  const seen = new Set([startId]);
  let cur = startId;
  while (true) {
    const outs = out[cur] || [];
    if (!outs.length) break;
    if (outs.length > 1) branches[cur] = outs.map((o) => o.to);
    const chosen = branchChoice[cur];
    const pick = (chosen && outs.find((o) => o.to === chosen)) || outs[0];
    if (seen.has(pick.to)) break;
    path.push(pick.to);
    edges.push([cur, pick.to, pick.field]);
    seen.add(pick.to);
    cur = pick.to;
  }
  return { path, edges, branches };
}