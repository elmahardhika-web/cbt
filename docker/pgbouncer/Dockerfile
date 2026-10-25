# PgBouncer ringan: konfigurasi dibuat dari variabel lingkungan saat container menyala
FROM alpine:3.20
RUN apk add --no-cache pgbouncer postgresql16-client \
 && addgroup -S pgb && adduser -S -G pgb -h /home/pgb pgb
COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh
USER pgb
EXPOSE 6432
HEALTHCHECK --interval=15s --timeout=5s --retries=5 CMD pg_isready -h 127.0.0.1 -p 6432 -U "$DB_USER" -d "$DB_NAME" >/dev/null || exit 1
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
