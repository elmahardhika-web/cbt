#!/bin/sh
# Bangun pgbouncer.ini + userlist.txt dari variabel lingkungan lalu jalankan PgBouncer.
set -e
: "${DB_HOST:=postgres}" "${DB_PORT:=5432}" "${DB_NAME:=tka}" "${DB_USER:=tka}" "${DB_PASSWORD:?DB_PASSWORD wajib diisi}"
: "${POOL_MODE:=transaction}" "${MAX_CLIENT_CONN:=2000}" "${DEFAULT_POOL_SIZE:=40}" "${MIN_POOL_SIZE:=5}" "${RESERVE_POOL_SIZE:=10}"
DIR=/home/pgb
esc() { printf '%s' "$1" | sed 's/"/""/g'; }
printf '"%s" "%s"\n' "$(esc "$DB_USER")" "$(esc "$DB_PASSWORD")" > "$DIR/userlist.txt"
chmod 600 "$DIR/userlist.txt"
cat > "$DIR/pgbouncer.ini" <<INI
[databases]
${DB_NAME} = host=${DB_HOST} port=${DB_PORT} dbname=${DB_NAME}

[pgbouncer]
listen_addr = 0.0.0.0
listen_port = 6432
unix_socket_dir =
auth_type = scram-sha-256
auth_file = ${DIR}/userlist.txt
pool_mode = ${POOL_MODE}
max_client_conn = ${MAX_CLIENT_CONN}
default_pool_size = ${DEFAULT_POOL_SIZE}
min_pool_size = ${MIN_POOL_SIZE}
reserve_pool_size = ${RESERVE_POOL_SIZE}
reserve_pool_timeout = 3
server_reset_query = DISCARD ALL
server_idle_timeout = 300
query_wait_timeout = 60
ignore_startup_parameters = extra_float_digits,options
log_connections = 0
log_disconnections = 0
stats_period = 300
admin_users = ${DB_USER}
INI
exec pgbouncer "$DIR/pgbouncer.ini"
