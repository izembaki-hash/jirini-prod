#!/bin/sh
# jirini watchdog — API health + db=postgres + container health + backup freshness + disk
# Telegram alerts sent only when TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID exist in /opt/jirini/.env
LOG=/var/log/jirini-watchdog.log
ENV=/opt/jirini/.env
COOLDOWN_MIN=360

say() { echo "$(date -Is) $*" >> "$LOG"; }

last_alert() { # $1=kind -> return0 if last alert older than cooldown
  f="/tmp/jirini-alert-$1"
  [ -f "$f" ] || return 0
  [ -z "$(find "$f" -mmin "-$COOLDOWN_MIN" 2>/dev/null)" ]
}
mark_alert() { date +%s > "/tmp/jirini-alert-$1"; }

TG_TOKEN=""; TG_CHAT=""
if [ -f "$ENV" ]; then
  v=$(grep -E '^TELEGRAM_BOT_TOKEN=' "$ENV" | head -1 | cut -d= -f2- | tr -d '\r\n'); [ -n "$v" ] && TG_TOKEN="$v"
  v=$(grep -E '^TELEGRAM_CHAT_ID=' "$ENV" | head -1 | cut -d= -f2- | tr -d '\r\n'); [ -n "$v" ] && TG_CHAT="$v"
fi

alert() { # $1=kind $2=message
  say "ALERT[$1] $2"
  if [ -n "$TG_TOKEN" ] && [ -n "$TG_CHAT" ] && last_alert "$1"; then
    curl -fsS -m 10 -X POST "https://api.telegram.org/bot$TG_TOKEN/sendMessage" \
      -d chat_id="$TG_CHAT" --data-urlencode "text=jirini: $2" >/dev/null 2>&1 \
      && mark_alert "$1" || say "ALERT[$1] telegram send failed"
  fi
}

#1) صحة الـAPI وقاعدة البيانات
HEALTH=$(curl -fsS -m 5 http://127.0.0.1/health 2>/dev/null || true)
if [ -z "$HEALTH" ]; then
  alert api "الـ API لا يستجيب — أُعيد تشغيله الآن"
  docker compose -f /opt/jirini/docker-compose.yml restart api >> "$LOG" 2>&1 || true
elif ! echo "$HEALTH" | grep -q '"db":"postgres"'; then
  alert db "قاعدة البيانات لا تستجيب ($HEALTH) — أُعيد تشغيل الـ API"
  docker compose -f /opt/jirini/docker-compose.yml restart api >> "$LOG" 2>&1 || true
fi

#2) حالة حاوية الـAPI
ST=$(docker inspect -f '{{.State.Health.Status}}' jirini-api-1 2>/dev/null || echo missing)
if [ "$ST" != "healthy" ]; then
  alert container "حاوية الـ API حالتها: $ST"
fi

#3) نسخة احتياطية خلال36 ساعة
LATEST=$(ls -t /opt/jirini/backups/db_*.dump 2>/dev/null | head -1 || true)
if [ -z "$LATEST" ] || [ -z "$(find "$LATEST" -mmin -2160 2>/dev/null)" ]; then
  alert backup "لا توجد نسخة احتياطية خلال آخر 36 ساعة"
fi

#4) القرص
USE=$(df -P / | awk 'NR==2{gsub("%","",$5); print $5}')
if [ -n "$USE" ] && [ "$USE" -ge 85 ]; then
  alert disk "مساحة القرص بلغت ${USE}%"
fi
