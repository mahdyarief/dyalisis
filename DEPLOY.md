# Deploy Dyalisis publish server

Backend `npx dyalisis publish` adalah **satu proses Node zero-dependency**. Tak
butuh database untuk v1: setiap publikasi disimpan sebagai file kecil di
filesystem (`DATA/<slug>/index.html` + `meta.json`), listing = scan folder.

## Menjalankan

```bash
# di VPS (butuh Node >= 18)
npx dyalisis serve --port 8787 --data /var/lib/dyalisis/data
# atau via env:
PORT=8787 DYALISIS_DATA_DIR=/var/lib/dyalisis/data \
  DYALISIS_PUBLIC_URL=https://dyalisis.nimb.us.ci \
  npx dyalisis serve
```

Mode auth (dipilih lewat `DYALISIS_PUBLISH_TOKEN`):

| Kondisi | Perilaku |
|---|---|
| Tanpa `DYALISIS_PUBLISH_TOKEN` | **terbuka** (multi-tenant) — siapa saja boleh publish; `POST /api/register` memberi token (owner = handle). Handle bebas tapi unik. |
| Dengan `DYALISIS_PUBLISH_TOKEN=<rahasia>` | **tertutup** — publish wajib sertakan token itu; owner diambil dari header `X-Dyalisis-Owner` (default `public`). Registrasi terbuka **dimatikan**. |

Implikasi penting mode tertutup:

- `POST /api/register` → `403 registrasi dimatikan`, sehingga **`dyalisis login`
  tidak berguna** (endpoint daftar handle tertutup).
- Publish tanpa token yang benar → `401 token salah`.
- Klien `dyalisis publish` **tidak** mengirim header owner, jadi owner tercatat
  `public`. Untuk owner kustom, publish manual dengan header
  `X-Dyalisis-Owner: <nama>`.

## Status deploy rujukan (dyalisis.nimb.us.ci)

Deploy nyata yang berjalan memakai pola di dokumen ini:

- **Container** `dyalisis:0.2.0` (image dari `Dockerfile` di repo, meng-install
  paket `dyalisis` dari npm) di direktori `/opt/dyalisis`, port `127.0.0.1:8787`.
- **Tunnel** `cloudflared-dyalisis.service` (config `/etc/cloudflared/dyalisis.yml`,
  ingress → `http://localhost:8787`).
- **Mode auth saat ini:** terbuka (multi-tenant publik) — `DYALISIS_PUBLISH_TOKEN`
  tidak di-set, siapa pun boleh daftar handle & publish. Untuk mengunci, uncomment
  baris token di `docker-compose.yml` lalu `docker compose up -d`.
- **Publikasi contoh:** `https://dyalisis.nimb.us.ci/softmedis-app`.

Perintah operasional umum di VPS:

```bash
cd /opt/dyalisis
docker compose up -d --build          # deploy / rebuild
docker compose logs -f                # log
docker compose up -d                  # terapkan perubahan env, lalu
docker ps --filter name=dyalisis      # cek status
```

> Jangan commit nilai `DYALISIS_PUBLISH_TOKEN` (atau kredensial apa pun) ke repo
> atau ke dokumen yang di-ship ke npm. Simpan hanya di `docker-compose.yml` di
> VPS (atau secret manager). Ganti token = ubah env lalu `docker compose up -d`.

## Deploy di VPS — Docker (disarankan)

Repo menyertakan `Dockerfile` + `docker-compose.yml` yang meng-install paket
`dyalisis` dari npm lalu menjalankan `dyalisis serve`. Port di-map ke
`127.0.0.1` saja (bukan publik) — tunnel yang mengeksposnya.

```bash
docker compose up -d --build
docker compose logs -f          # lihat log
curl -s localhost:8787/health   # { "ok": true }
```

Isi `docker-compose.yml` penting:

```yaml
ports:
  - "127.0.0.1:8787:8787"       # localhost saja
environment:
  - DYALISIS_DATA_DIR=/data
  - DYALISIS_PUBLIC_URL=https://dyalisis.nimb.us.ci
volumes:
  - dyalisis-data:/data         # publikasi persist di named volume
```

Biarkan bind `0.0.0.0` **di dalam** container (perlu agar port mapping
menjangkau proses); yang melindungi adalah mapping host ke `127.0.0.1`.

## Reverse proxy + HTTPS — Cloudflare Tunnel (dipakai di dyalisis.nimb.us.ci)

Cloudflare Tunnel (`cloudflared`) memberi HTTPS tanpa membuka port apa pun.
Deploy yang dipakai: container `dyalisis` di `127.0.0.1:8787`, lalu tunnel
mengarahkan hostname publik ke port lokal itu.

```bash
# sekali saja
cloudflared tunnel create dyalisis
cloudflared tunnel route dns dyalisis dyalisis.nimb.us.ci
```

`/etc/cloudflared/dyalisis.yml`:

```yaml
tunnel: <TUNNEL_ID>
credentials-file: /root/.cloudflared/<TUNNEL_ID>.json
ingress:
  - hostname: dyalisis.nimb.us.ci
    service: http://localhost:8787
  - service: http_status:404
```

Unit systemd `cloudflared-dyalisis.service` (mengikuti pola `cloudflared-idrouter.service`):

```ini
[Unit]
Description=Cloudflare Tunnel for Dyalisis
After=network.target
[Service]
Type=simple
ExecStart=/usr/local/bin/cloudflared --config /etc/cloudflared/dyalisis.yml tunnel run
Restart=always
RestartSec=5
[Install]
WantedBy=multi-user.target
```

`systemctl enable --now cloudflared-dyalisis`.

> Catatan: `cloudflared tunnel route dns` memakai `zoneID` dari `cert.pem`. Kalau
> cert dibuat untuk zona lain, record bisa salah zona (mis. muncul
> `<host>.zona-lain`). Buat record CNAME-nya langsung via Cloudflare API
> (`type=CNAME, name=<sub>, content=<TUNNEL_ID>.cfargotunnel.com, proxied=true`)
> di zona yang benar.

## Alternatif non-Docker — Caddy

Caddy menangani TLS otomatis. `Caddyfile`:

```
dyalisis.nimb.us.ci {
    reverse_proxy 127.0.0.1:8787
}
```

Nginx setara (dengan certbot untuk TLS):

```nginx
server {
    server_name dyalisis.nimb.us.ci;
    location / {
        proxy_pass http://127.0.0.1:8787;
        proxy_set_header Host $host;
        client_max_body_size 30m;   # HTML single-file bisa besar
    }
}
```

## Menjalankan sebagai service (systemd)

`/etc/systemd/system/dyalisis.service`:

```ini
[Unit]
Description=Dyalisis publish server
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/dyalisis
Environment=PORT=8787
Environment=DYALISIS_DATA_DIR=/var/lib/dyalisis/data
Environment=DYALISIS_PUBLIC_URL=https://dyalisis.nimb.us.ci
ExecStart=/usr/bin/npx dyalisis serve
Restart=always

[Install]
WantedBy=multi-user.target
```

`systemctl enable --now dyalisis`.

## Kapan butuh database

Ketika salah satu muncul: pencarian teks penuh, analitik akses, puluhan ribu
user, atau penulisan sangat konkuren. Jalur upgrade alami: **SQLite** (satu file,
tanpa server) menggantikan `meta.json` + scan folder. Layer storage dipisah di
[`server/store.mjs`](../server/store.mjs), jadi migrasi cukup mengganti `createStore`.

## Keamanan & kuota (belum diimplementasi — roadmap)

- Rate limit per token/IP, kuota ukuran & jumlah per user.
- Moderasi / takedown endpoint untuk admin.
- TTL opsional untuk publikasi sementara.