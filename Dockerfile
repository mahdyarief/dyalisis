# Dyalisis publish server — image minimal (zero-dep Node).
# Build : docker build -t dyalisis:0.2.0 .
# Run   : docker run -d --name dyalisis -p 127.0.0.1:8787:8787 \
#           -v dyalisis-data:/data dyalisis:0.2.0
# Catatan: port di-publish ke 127.0.0.1 saja; cloudflared (host) yang
# mengekspos publik via dyalisis.nimb.us.ci -> localhost:8787.
FROM node:22-alpine

# Paket dyalisis dari registry npm (jalur distribusi yang dipilih).
ARG DYALISIS_VERSION=0.2.0
RUN npm i -g "dyalisis@${DYALISIS_VERSION}" && npm cache clean --force

ENV DYALISIS_DATA_DIR=/data \
    PORT=8787 \
    NODE_ENV=production
RUN mkdir -p /data

EXPOSE 8787
VOLUME ["/data"]

CMD ["dyalisis", "serve", "--port", "8787", "--data", "/data"]