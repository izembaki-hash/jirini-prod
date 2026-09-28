#!/bin/sh
# jirini daily backup — postgres (pg_dump -Fc) + uploads volume,14 day retention
set -eu
ENV=/opt/jirini/.env
DIR=/opt/jirini/backups
mkdir -p "$DIR"

PG_USER=dz
PG_DB=jirini
if [ -f "$ENV" ]; then
  v=$(grep -E '^POSTGRES_USER=' "$ENV" | head -1 | cut -d= -f2- | tr -d '\r\n'); [ -n "$v" ] && PG_USER="$v"
  v=$(grep -E '^POSTGRES_DB=' "$ENV" | head -1 | cut -d= -f2- | tr -d '\r\n'); [ -n "$v" ] && PG_DB="$v"
fi

TS=$(date +%Y-%m-%d_%H%M)
OUT="$DIR/db_$TS.dump"
docker exec jirini-postgres-1 pg_dump -U "$PG_USER" -d "$PG_DB" -Fc > "$OUT"
echo "$(date -Is) OK db $OUT $(du -h "$OUT" | cut -f1)"

# صور/ملفات مرفوعة (volume jirini_uploads) — فشلها لا يُلغي نسخة القاعدة
if docker run --rm -v jirini_uploads:/data:ro -v "$DIR":/out postgres:16-alpine \
    sh -c "tar czf /out/uploads_$TS.tar.gz -C /data ." 2>>/var/log/jirini-backup.log; then
  echo "$(date -Is) OK uploads uploads_$TS.tar.gz"
else
  echo "$(date -Is) WARN uploads archive failed"
fi

# احتفاظ14 يوماً
find "$DIR" -name 'db_*.dump' -mtime +14 -delete
find "$DIR" -name 'uploads_*.tar.gz' -mtime +14 -delete
