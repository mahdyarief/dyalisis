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

Mode auth:

| Kondisi | Perilaku |
|---|---|
| Tanpa `DYALISIS_PUBLISH_TOKEN` | **terbuka** — siapa saja boleh publish; `POST /api/register` memberi token (owner = handle). |
| Dengan `DYALISIS_PUBLISH_TOKEN=<rahasia>` | **tertutup** — publish wajib sertakan token itu; owner diambil dari header `X-Dyalisis-Owner` (default `public`). Registrasi terbuka dimatikan. |

## Reverse proxy + HTTPS (Caddy)

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