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
ssh "${ssh_options[@]}" "$remote" "sudo -n test -r /etc/linkmai/$DEPLOY_TARGET.env && sudo -n test -S /root/.pm2/rpc.sock && sudo -n install -d -m 750 -o '$DEPLOY_SSH_USER' /var/www/linkmai-$DEPLOY_TARGET/source && sudo -n rm -rf -- '$remote_source' && sudo -n mkdir '$remote_source' && sudo -n chown '$DEPLOY_SSH_USER' '$remote_source'"
printf -v rsync_ssh '%q ' ssh "${ssh_options[@]}"
rsync -az --delete \
  --exclude '.git/' --exclude '.claude/' --exclude '.codex/' --exclude '.agents/' \
  --exclude '.env' --exclude '.env.*' --exclude '*.pem' --exclude '*.key' \
  --exclude 'api_v3_key' --exclude 'wechat_api_v3_key' --exclude '*-secrets' \
  --exclude 'node_modules/' --exclude 'dist/' --exclude 'dist-staging/' --exclude 'dist-h5/' \
  -e "$rsync_ssh" "$source_dir/" "$remote:$remote_source/"
ssh "${ssh_options[@]}" "$remote" \
  "sudo -n env PM2_HOME=/root/.pm2 RELEASE_ID='$RELEASE_ID' RELEASE_SHA='$RELEASE_SHA' STAGING_RELEASE_ID='${STAGING_RELEASE_ID:-}' SOURCE_ROOT='$remote_source' LINKMAI_ENV_FILE=/etc/linkmai/$DEPLOY_TARGET.env LINKMAI_HEALTH_URL=https://$([ "$DEPLOY_TARGET" = staging ] && printf staging-api || printf api).linkmai.com/api/health bash '$remote_source/server/scripts/deploy-$DEPLOY_TARGET.sh'"
# Remove only successful source attempts; failures preserve diagnostics.
ssh "${ssh_options[@]}" "$remote" "rm -rf -- '$remote_source'"
