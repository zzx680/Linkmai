# TLS 证书目录

`deploy/edge/nginx.conf` 读取下面六个文件，文件名必须完全一致：

```
certs/linkmai.com.pem    # 证书 + 中间证书链（fullchain）
certs/linkmai.com.key    # 私钥
certs/www.linkmai.com.pem
certs/www.linkmai.com.key
certs/word.linkmai.com.pem
certs/word.linkmai.com.key
```

## 申请

在阿里云「数字证书管理服务」为 `linkmai.com`、`www.linkmai.com`、`word.linkmai.com`
各申请一张免费 DV 证书（单域名）；如果申请的是包含多个 SAN 的证书，就把同一份文件
复制或软链接成上面的三个文件名。

`www` 也要有证书，因为浏览器先完成 `https://www.linkmai.com` 的 TLS 握手，服务器才能
返回 301 到 `https://linkmai.com`。

下载 Nginx 格式，得到 `.pem`（服务器证书 + 中间链）和 `.key`。不要使用只有服务器证书、
缺少中间链的版本，否则部分客户端会报证书链不完整。

## 放置与权限

在 ECS 上：

```bash
cd /opt/linkmai/deploy/certs
install -m 600 /path/to/linkmai.com.pem .
install -m 600 /path/to/linkmai.com.key .
install -m 600 /path/to/www.linkmai.com.pem .
install -m 600 /path/to/www.linkmai.com.key .
install -m 600 /path/to/word.linkmai.com.pem .
install -m 600 /path/to/word.linkmai.com.key .
```

容器内 nginx 以 root 启动后降权，`600` 权限可以读取；不要改成 `644`（私钥不应全局可读）。

## 生效与续期

```bash
./deploy/scripts/compose.sh exec edge nginx -t
./deploy/scripts/compose.sh exec edge nginx -s reload
```

免费证书有效期 90 天。到期前重新下载并覆盖文件，再执行上面的 `nginx -t` 和
`nginx -s reload`；不需要重启其它容器。证书文件不会进入 git（`deploy/.gitignore`）。
