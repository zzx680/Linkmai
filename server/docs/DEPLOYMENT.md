# 灵迈后端部署指南

## 服务器要求

**最低配置（测试阶段）**
- CPU: 2核
- 内存: 2GB
- 存储: 20GB
- 带宽: 1Mbps

**推荐配置（生产环境）**
- CPU: 2核
- 内存: 4GB
- 存储: 40GB
- 带宽: 3Mbps

## 部署步骤

### 1. 服务器准备

```bash
# SSH 登录服务器
ssh root@114.55.96.52

# 更新系统
apt update && apt upgrade -y

# 安装 Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# 安装 PostgreSQL 14
apt install -y postgresql postgresql-contrib

# 安装 Redis
apt install -y redis-server

# 安装 Nginx
apt install -y nginx

# 安装 PM2 (进程管理)
npm install -g pm2
```

### 2. 数据库配置

```bash
# 切换到 postgres 用户
sudo -u postgres psql

# 创建数据库和用户
CREATE DATABASE linkmai;
CREATE USER linkmai WITH PASSWORD 'linkmai';
GRANT ALL PRIVILEGES ON DATABASE linkmai TO linkmai;
\q

# 优化 PostgreSQL 内存配置（2GB 服务器）
sudo nano /etc/postgresql/14/main/postgresql.conf

# 修改以下参数：
shared_buffers = 128MB          # 默认是 128MB
effective_cache_size = 512MB    # 降低到 512MB
work_mem = 4MB                  # 降低到 4MB
maintenance_work_mem = 64MB     # 降低到 64MB

# 重启 PostgreSQL
sudo systemctl restart postgresql
```

### 3. Redis 配置

```bash
# 编辑 Redis 配置
sudo nano /etc/redis/redis.conf

# 限制内存使用
maxmemory 50mb
maxmemory-policy allkeys-lru

# 重启 Redis
sudo systemctl restart redis
```

### 4. 部署代码

```bash
# 创建应用目录
mkdir -p /var/www/linkmai
cd /var/www/linkmai

# 克隆代码 (或从本地上传)
# git clone <your-repo-url> .
# 或使用 rsync/scp 上传

# 安装依赖
cd server
npm install --production

# 复制环境变量
cp .env.production .env

# 运行数据库迁移
npm run migrate

# 创建上传目录
mkdir -p /var/linkmai/uploads
chown -R www-data:www-data /var/linkmai/uploads
```

### 5. PM2 启动

```bash
# 使用 PM2 启动应用（限制内存）
pm2 start npm --name "linkmai-api" -- start \
  --node-args="--max-old-space-size=512"

# 设置开机自启
pm2 startup
pm2 save

# 查看状态
pm2 status
pm2 logs linkmai-api
```

### 6. Nginx 配置

```bash
# 创建 Nginx 配置
sudo nano /etc/nginx/sites-available/linkmai
```

```nginx
# 上游服务器
upstream linkmai_backend {
    server 127.0.0.1:8000;
    keepalive 32;
}

# HTTPS 服务器
server {
    listen 443 ssl http2;
    server_name api.linkmai.com;

    # SSL 证书 (需要申请)
    ssl_certificate /etc/nginx/ssl/linkmai.crt;
    ssl_certificate_key /etc/nginx/ssl/linkmai.key;

    # SSL 优化
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # 客户端上传大小限制
    client_max_body_size 20M;

    # API 路由
    location /api/ {
        proxy_pass http://linkmai_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # 超时设置
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # 静态文件（上传的图片）
    location /uploads/ {
        alias /var/linkmai/uploads/;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    # Gzip 压缩
    gzip on;
    gzip_types application/json text/css text/javascript;
    gzip_min_length 1000;
}

# HTTP 重定向到 HTTPS
server {
    listen 80;
    server_name api.linkmai.com;
    return 301 https://$server_name$request_uri;
}
```

```bash
# 启用配置
sudo ln -s /etc/nginx/sites-available/linkmai /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 7. SSL 证书申请

```bash
# 安装 certbot
apt install -y certbot python3-certbot-nginx

# 申请免费证书
certbot --nginx -d api.linkmai.com

# 自动续期（证书 90 天过期）
certbot renew --dry-run
```

## 监控和维护

### PM2 监控

```bash
# 查看实时日志
pm2 logs linkmai-api --lines 100

# 查看内存使用
pm2 monit

# 重启服务
pm2 restart linkmai-api

# 查看启动时间
pm2 show linkmai-api
```

### 系统监控

```bash
# 内存使用情况
free -h

# 磁盘使用
df -h

# 进程监控
htop

# 数据库连接数
sudo -u postgres psql -c "SELECT count(*) FROM pg_stat_activity;"
```

### 日志管理

```bash
# PM2 日志轮转
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7

# Nginx 日志
tail -f /var/log/nginx/access.log
tail -f /var/log/nginx/error.log
```

## 性能优化

### Node.js 优化

```bash
# 限制 Node.js 内存（已在 PM2 启动参数中配置）
# --max-old-space-size=512

# 启用生产模式
export NODE_ENV=production
```

### 数据库优化

```bash
# 定期 VACUUM（清理碎片）
sudo -u postgres psql linkmai -c "VACUUM ANALYZE;"

# 创建索引（在应用代码中已定义）
# 案件表：user_id, status, created_at
# 对话表：case_id, created_at
```

### 缓存策略

- 用户会话：Redis（30分钟过期）
- API 响应：Nginx 缓存（静态资源）
- 数据库查询：应用层缓存（热点数据）

## 故障排查

### 服务无法启动

```bash
# 检查端口占用
netstat -tulpn | grep 8000

# 检查日志
pm2 logs linkmai-api --err

# 检查环境变量
pm2 show linkmai-api
```

### 内存不足

```bash
# 查看内存占用
pm2 monit

# 临时释放缓存
echo 3 > /proc/sys/vm/drop_caches

# 重启服务
pm2 restart linkmai-api
```

### 数据库连接失败

```bash
# 检查 PostgreSQL 状态
sudo systemctl status postgresql

# 查看连接数
sudo -u postgres psql -c "SELECT * FROM pg_stat_activity;"

# 重启数据库
sudo systemctl restart postgresql
```

## 升级指南

```bash
# 拉取最新代码
cd /var/www/linkmai/server
git pull

# 安装依赖
npm install --production

# 运行迁移
npm run migrate

# 重启服务
pm2 restart linkmai-api

# 验证
curl https://api.linkmai.com/api/v1/health
```

## 备份策略

### 数据库备份

```bash
# 每日自动备份
sudo crontab -e

# 添加定时任务（每天凌晨 3 点）
0 3 * * * pg_dump -U linkmai linkmai > /var/backups/linkmai_$(date +\%Y\%m\%d).sql

# 保留最近 7 天
0 4 * * * find /var/backups -name "linkmai_*.sql" -mtime +7 -delete
```

### 文件备份

```bash
# 上传文件备份到 OSS（配置 OSS 后）
# 或定期打包
tar -czf /var/backups/uploads_$(date +%Y%m%d).tar.gz /var/linkmai/uploads
```

## 安全建议

1. **防火墙配置**
```bash
ufw allow 22/tcp   # SSH
ufw allow 80/tcp   # HTTP
ufw allow 443/tcp  # HTTPS
ufw enable
```

2. **修改默认密码**
- PostgreSQL: `linkmai` 用户密码
- 服务器 root 密码

3. **禁用 root SSH 登录**
```bash
sudo nano /etc/ssh/sshd_config
# PermitRootLogin no
```

4. **启用 fail2ban**
```bash
apt install fail2ban
systemctl enable fail2ban
```

## 联系方式

遇到问题请查看日志：
- 应用日志: `pm2 logs linkmai-api`
- Nginx 日志: `/var/log/nginx/error.log`
- 系统日志: `journalctl -xe`
