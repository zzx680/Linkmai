#!/usr/bin/env bash
# Runner transport. Deploy only this run's archived source.
set -euo pipefail
case "${DEPLOY_TARGET:-}" in staging|production) ;; *) echo "非法 DEPLOY_TARGET" >&2; exit 1 ;; esac
[[ "${RELEASE_SHA:-}" =~ ^[0-9a-f]{40}$ ]] || { echo "非法 RELEASE_SHA" >&2; exit 1; }
[[ "${RELEASE_ID:-}" =~ ^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$ ]] || { echo "非法 RELEASE_ID" >&2; exit 1; }
for name in DEPLOY_SSH_HOST DEPLOY_SSH_PORT DEPLOY_SSH_USER DEPLOY_SSH_PRIVATE_KEY DEPLOY_SSH_KNOWN_HOSTS; do
  [ -n "${!name:-}" ] || { echo "缺少环境 Secret: $name" >&2; exit 1; }
done
[[ "$DEPLOY_SSH_HOST" =~ ^[a-zA-Z0-9][a-zA-Z0-9.-]*$ ]] || exit 1
[[ "$DEPLOY_SSH_USER" =~ ^[a-zA-Z_][a-zA-Z0-9_-]*$ ]] || exit 1
[[ "$DEPLOY_SSH_PORT" =~ ^[0-9]+$ ]] && [ "$DEPLOY_SSH_PORT" -ge 1 ] && [ "$DEPLOY_SSH_PORT" -le 65535 ] || exit 1
if [ "$DEPLOY_TARGET" = production ]; then
  [[ "${STAGING_RELEASE_ID:-}" =~ ^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$ ]] || exit 1
fi
artifact_dir=${LINKMAI_ARTIFACT_DIR:-release-artifact}
(cd "$artifact_dir" && sha256sum --check release-source.tar.sha256)
node -e '
  const value = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
  if (value.sha !== process.env.RELEASE_SHA || value.releaseId !== process.env.RELEASE_ID) process.exit(1);
' "$artifact_dir/release.json"
ssh_dir=$(mktemp -d)
source_dir=$(mktemp -d)
trap 'rm -rf "$ssh_dir" "$source_dir"' EXIT
chmod 700 "$ssh_dir"
printf '%s\n' "$DEPLOY_SSH_PRIVATE_KEY" > "$ssh_dir/id_ed25519"
printf '%s\n' "$DEPLOY_SSH_KNOWN_HOSTS" > "$ssh_dir/known_hosts"
chmod 600 "$ssh_dir/id_ed25519" "$ssh_dir/known_hosts"
unset DEPLOY_SSH_PRIVATE_KEY DEPLOY_SSH_KNOWN_HOSTS
tar -xf "$artifact_dir/release-source.tar" -C "$source_dir"
printf '%s\n' "$RELEASE_SHA" > "$source_dir/.release-source-sha"
ssh_options=(-i "$ssh_dir/id_ed25519" -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes -o "UserKnownHostsFile=$ssh_dir/known_hosts" -o BatchMode=yes -o ConnectTimeout=15 -p "$DEPLOY_SSH_PORT")
remote="$DEPLOY_SSH_USER@$DEPLOY_SSH_HOST"
remote_source="/var/www/linkmai-$DEPLOY_TARGET/source/$RELEASE_ID"
remote_nginx="/etc/nginx/sites-available/$([ "$DEPLOY_TARGET" = staging ] && printf staging-api || printf api).linkmai.com.conf"
remote_port=$([ "$DEPLOY_TARGET" = staging ] && printf 8100 || printf 8200)
ssh "${ssh_options[@]}" "$remote" "sudo -n test -r /etc/linkmai/$DEPLOY_TARGET.env && sudo -n test -S /root/.pm2/rpc.sock && sudo -n install -d -m 750 -o '$DEPLOY_SSH_USER' /var/www/linkmai-$DEPLOY_TARGET/source && sudo -n rm -rf -- '$remote_source' && sudo -n mkdir '$remote_source' && sudo -n chown '$DEPLOY_SSH_USER' '$remote_source'"
printf -v rsync_ssh '%q ' ssh "${ssh_options[@]}"
rsync -az --delete \
  --exclude '.git/' --exclude '.claude/' --exclude '.codex/' --exclude '.agents/' \
  --exclude '.env' --exclude '.env.*' --exclude '*.pem' --exclude '*.key' \
  --exclude 'api_v3_key' --exclude 'wechat_api_v3_key' --exclude '*-secrets' \
  --exclude 'node_modules/' --exclude 'dist/' --exclude 'dist-staging/' --exclude 'dist-h5/' \
  -e "$rsync_ssh" "$source_dir/" "$remote:$remote_source/"
ssh "${ssh_options[@]}" "$remote" "sudo -n env ENV_FILE='/etc/linkmai/$DEPLOY_TARGET.env' NGINX_FILE='$remote_nginx' bash -s" <<'REMOTE_PREPARE'
set -euo pipefail
review_secret=$(sudo -n awk -F= '$1 == "REVIEW_JWT_SECRET" { value = substr($0, index($0, "=") + 1) } END { print value }' "$ENV_FILE")
jwt_secret=$(sudo -n awk -F= '$1 == "JWT_SECRET" { value = substr($0, index($0, "=") + 1) } END { print value }' "$ENV_FILE")
if [ -n "$review_secret" ]; then
  [ ${#review_secret} -ge 32 ] && [ "$review_secret" != "$jwt_secret" ] || { echo '审核密钥无效' >&2; exit 1; }
fi
sudo -n nginx -t
REMOTE_PREPARE
ssh "${ssh_options[@]}" "$remote" \
  "sudo -n env PM2_HOME=/root/.pm2 RELEASE_ID='$RELEASE_ID' RELEASE_SHA='$RELEASE_SHA' STAGING_RELEASE_ID='${STAGING_RELEASE_ID:-}' SOURCE_ROOT='$remote_source' LINKMAI_ENV_FILE=/etc/linkmai/$DEPLOY_TARGET.env LINKMAI_HEALTH_URL=https://$([ "$DEPLOY_TARGET" = staging ] && printf staging-api || printf api).linkmai.com/api/health bash '$remote_source/server/scripts/deploy-$DEPLOY_TARGET.sh'"
ssh "${ssh_options[@]}" "$remote" "sudo -n env DEPLOY_TARGET='$DEPLOY_TARGET' RELEASE_SHA='$RELEASE_SHA' RELEASE_ID='$RELEASE_ID' ENV_FILE='/etc/linkmai/$DEPLOY_TARGET.env' NGINX_FILE='$remote_nginx' APP_PORT='$remote_port' bash -s" <<'REMOTE_ENABLE_REVIEW'
set -euo pipefail
backup_env="$ENV_FILE.bak-review-$(date -u +%Y%m%dT%H%M%SZ)"
sudo -n cp -a "$ENV_FILE" "$backup_env"
backup_nginx=''
restore_review_state() {
  status=$?
  if [ "$status" -ne 0 ]; then
    sudo -n cp -a "$backup_env" "$ENV_FILE" || true
    if [ -n "$backup_nginx" ]; then sudo -n cp -a "$backup_nginx" "$NGINX_FILE" || true; fi
    sudo -n nginx -t >/dev/null 2>&1 && sudo -n systemctl reload nginx || true
    sudo -n env PM2_HOME=/root/.pm2 LINKMAI_CURRENT="/var/www/linkmai-$DEPLOY_TARGET/current/server" LINKMAI_ENV_FILE="$ENV_FILE" pm2 startOrReload "/var/www/linkmai-$DEPLOY_TARGET/current/server/ecosystem.$DEPLOY_TARGET.config.js" --update-env 9>&- || true
  fi
  sudo -n rm -f "$backup_env"
  exit "$status"
}
trap restore_review_state EXIT
review_secret=$(sudo -n awk -F= '$1 == "REVIEW_JWT_SECRET" { value = substr($0, index($0, "=") + 1) } END { print value }' "$ENV_FILE")
jwt_secret=$(sudo -n awk -F= '$1 == "JWT_SECRET" { value = substr($0, index($0, "=") + 1) } END { print value }' "$ENV_FILE")
if [ -z "$review_secret" ]; then
  review_secret=$(openssl rand -hex 48)
  printf 'REVIEW_JWT_SECRET=%s\n' "$review_secret" | sudo -n tee -a "$ENV_FILE" >/dev/null
fi
[ ${#review_secret} -ge 32 ] && [ "$review_secret" != "$jwt_secret" ] || { echo '审核密钥无效' >&2; exit 1; }
sudo -n sed -i '/^HARNESS_ENABLED=/d' "$ENV_FILE"
printf 'HARNESS_ENABLED=true\n' | sudo -n tee -a "$ENV_FILE" >/dev/null
sudo -n chown root:linkmai "$ENV_FILE"
sudo -n chmod 640 "$ENV_FILE"
if ! sudo -n grep -q 'location = /review' "$NGINX_FILE"; then
  backup_nginx="$NGINX_FILE.bak-$(date -u +%Y%m%dT%H%M%SZ)-review"
  sudo -n cp -a "$NGINX_FILE" "$backup_nginx"
  if ! sudo -n sed -i "/^[[:space:]]*location \/api\//i\\    location = /review {\\n        return 301 /review/;\\n    }\\n\\n    location /review/ {\\n        proxy_pass http://127.0.0.1:$APP_PORT;\\n        proxy_set_header Host \\$host;\\n        proxy_set_header X-Forwarded-Proto \\$scheme;\\n    }\\n" "$NGINX_FILE"; then
    exit 1
  fi
  if ! sudo -n nginx -t; then
    exit 1
  fi
fi
sudo -n systemctl reload nginx
sudo -n env PM2_HOME=/root/.pm2 LINKMAI_CURRENT="/var/www/linkmai-$DEPLOY_TARGET/current/server" LINKMAI_ENV_FILE="$ENV_FILE" pm2 startOrReload "/var/www/linkmai-$DEPLOY_TARGET/current/server/ecosystem.$DEPLOY_TARGET.config.js" --update-env 9>&-
for attempt in $(seq 1 15); do
  if curl --fail --silent --show-error --max-time 5 "https://$([ "$DEPLOY_TARGET" = staging ] && printf staging-api || printf api).linkmai.com/api/health" >/dev/null; then
    break
  fi
  if [ "$attempt" -eq 15 ]; then
    echo '审核配置重载后健康检查超时' >&2
    exit 1
  fi
  sleep 2
done
LINKMAI_EXPECT_REVIEW=true LINKMAI_EXPECTED_SHA="$RELEASE_SHA" LINKMAI_EXPECTED_RELEASE_ID="$RELEASE_ID" \
  bash "/var/www/linkmai-$DEPLOY_TARGET/current/server/scripts/smoke-$DEPLOY_TARGET.sh" "https://$([ "$DEPLOY_TARGET" = staging ] && printf staging-api || printf api).linkmai.com"
REMOTE_ENABLE_REVIEW
# Remove only successful source attempts; failures preserve diagnostics.
ssh "${ssh_options[@]}" "$remote" "rm -rf -- '$remote_source'"
