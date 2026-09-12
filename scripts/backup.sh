#!/bin/sh
# نسخ احتياطي يومي: قاعدة Postgres + الصور المرفوعة.
# الإعداد: COMPOSE_DIR (افتراضي /opt/dzsaas)، BACKUP_DIR، UPLOADS_VOLUME (اسم مجلد الرفوعات كما يراه docker).
# مثال الاختبار الجاف: DRY_RUN=1 ./scripts/backup.sh
# crontab: 0 3 * * * /opt/dzsaas/scripts/backup.sh
set -e
COMPOSE_DIR="${COMPOSE_DIR:-/opt/dzsaas}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/dzsaas}"
UPLOADS_VOLUME="${UPLOADS_VOLUME:-dzsaas_uploads}"
KEEP_DAYS="${KEEP_DAYS:-14}"
DATE=$(date +%F)
mkdir -p "$BACKUP_DIR"
if [ "${DRY_RUN:-0}" = "1" ]; then
  echo "[backup:dry] compose=$COMPOSE_DIR backup=$BACKUP_DIR volume=$UPLOADS_VOLUME keep=$KEEP_DAYS"
  echo "[backup:dry] would dump postgres + archive uploads, then prune older than $KEEP_DAYS days"
  exit 0
fi
echo "[backup] dumping postgres..."
docker compose -f "$COMPOSE_DIR/docker-compose.yml" exec -T postgres \
  pg_dump -U "${POSTGRES_USER:-dz}" "${POSTGRES_DB:-dzsaas}" | gzip > "$BACKUP_DIR/db-$DATE.sql.gz"
echo "[backup] archiving uploads..."
docker run --rm -v "$UPLOADS_VOLUME:/data" -v "$BACKUP_DIR:/out" alpine \
  tar czf "/out/uploads-$DATE.tar.gz" -C /data .
find "$BACKUP_DIR" -mtime +"$KEEP_DAYS" -delete
echo "[backup] done: $BACKUP_DIR (kept $KEEP_DAYS days)"
# الاستعادة (تجربة دورية موصى بها):
#   gunzip -c $BACKUP_DIR/db-<DATE>.sql.gz | docker compose -f $COMPOSE_DIR/docker-compose.yml exec -T postgres psql -U $POSTGRES_USER $POSTGRES_DB
