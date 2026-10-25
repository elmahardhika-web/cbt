#!/bin/sh
# Menyalakan / memperbarui TKA 2026 (dijalankan sebagai root lewat Task Scheduler)
cd /volume2/docker/tka2026 || exit 1
D=/usr/local/bin/docker
{
  echo "=== $(date) ==="
  echo "--- status container sebelumnya ---"
  $D ps -a --filter name=tka2026
  echo "--- log container sebelumnya ---"
  $D logs --tail 80 tka2026 2>&1
  echo "--- membangun & menjalankan ---"
  if $D compose version >/dev/null 2>&1; then $D compose up -d --build --force-recreate; else /usr/local/bin/docker-compose up -d --build --force-recreate; fi
  sleep 20
  echo "--- status sesudah ---"
  $D ps -a --filter name=tka2026
  $D logs --tail 40 tka2026 2>&1
} > /volume2/docker/tka2026/jalankan.log 2>&1
chmod 644 /volume2/docker/tka2026/jalankan.log
