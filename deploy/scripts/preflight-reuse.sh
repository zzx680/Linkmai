#!/usr/bin/env bash
# Read-only inventory for reusing an existing ECS as the LinkMai host.
#
# Run this on the old server BEFORE stopping anything. It does not change
# services, containers, firewall rules, or files. Redact hostnames, upstream
# tokens, and database URLs before sharing its output.
set -euo pipefail

section() {
  printf '\n== %s ==\n' "$1"
}

section "host"
uname -a || true
cat /etc/os-release 2>/dev/null | grep -E '^(PRETTY_NAME|VERSION_ID)=' || true
printf 'public ip: '
curl -fsS --max-time 3 https://api.ipify.org 2>/dev/null || echo "(curl failed)"
printf 'private ip: '
hostname -I 2>/dev/null || true

section "cpu / memory / disk"
nproc 2>/dev/null || true
free -h 2>/dev/null || true
df -h / /var/lib/docker 2>/dev/null || df -h / || true

section "listening ports"
if command -v ss >/dev/null 2>&1; then
  ss -lntp 2>/dev/null | grep -E ':(80|443|3000|3001|3200|5432|6379|8000|9000|18080)\b' || true
else
  netstat -lntp 2>/dev/null | grep -E ':(80|443|3000|3001|3200|5432|6379|8000|9000|18080)\b' || true
fi

section "nginx"
if command -v nginx >/dev/null 2>&1; then
  nginx -v 2>&1 || true
  systemctl is-active nginx 2>/dev/null || true
  systemctl is-enabled nginx 2>/dev/null || true
  # Only routing and certificate paths; avoid dumping full configs that may
  # contain upstream credentials.
  nginx -T 2>/dev/null | grep -E '^[[:space:]]*(server_name|listen|ssl_certificate|ssl_certificate_key|proxy_pass|root)[[:space:]]' || true
else
  echo "nginx not installed on the host (it may run in Docker)"
fi

section "docker"
if command -v docker >/dev/null 2>&1; then
  docker version --format '{{.Server.Version}}' 2>/dev/null || true
  docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Ports}}\t{{.Status}}' 2>/dev/null || true
  docker ps -a --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}' 2>/dev/null | head -50 || true
else
  echo "docker not installed"
fi

section "pm2 / node processes"
if command -v pm2 >/dev/null 2>&1; then
  pm2 ls 2>/dev/null || true
else
  echo "pm2 not installed"
fi
ps -eo pid,comm,args 2>/dev/null | grep -E 'node|nginx|postgres|redis' | grep -v grep | head -50 || true

section "candidate old app directories"
for dir in /opt /srv /var/www /home; do
  [ -d "$dir" ] || continue
  find "$dir" -maxdepth 3 -type f \
    \( -name 'ecosystem*.js' -o -name 'docker-compose*.yml' -o -name 'package.json' \) \
    -not -path '*/node_modules/*' -print 2>/dev/null | head -30
done

section "systemd units (filtered)"
systemctl list-units --type=service --state=running 2>/dev/null \
  | grep -Ei 'nginx|node|pm2|docker|postgres|redis|linkmai' || true

cat <<'NOTE'

Next:
  1. Back up the mini-program database, uploads, .env files, nginx config,
     and PM2 dump to a machine outside this ECS.
  2. Share this output after redacting hostnames, tokens, and passwords.
  3. Do not stop nginx or the API until the backup is verified.
NOTE
