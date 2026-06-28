# نشر منصة تمكين

## نشر على Coolify + Hetzner (موصى به)

### المتطلبات

- Ubuntu 22.04 LTS (مثل Hetzner CX23 — 4 GB RAM)
- Coolify مثبت على السيرفر (Docker + BuildKit)
- نطاق مربوط بـ A record → IP السيرفر (مثل `tmkeen.alzaad.org.sa`)
- مستودع GitHub مربوط بـ Coolify

### 1. Build Pack

في Coolify → تطبيق tmkeen → **Build Pack**: اختر **Dockerfile** (وليس Nixpacks).

المشروع يتضمن [`Dockerfile`](../Dockerfile) مع Node **22.12** (مطلوب لـ Prisma 7.8).

> إذا بقيت على Nixpacks: عيّن Build Env `NIXPACKS_NODE_VERSION=22.12` و `DATABASE_URL=postgresql://build:build@localhost:5432/build?schema=public`

### 2. PostgreSQL

1. Coolify → **+ New Resource** → PostgreSQL
2. اسم: `tmkeen-db` على نفس السيرفر
3. انسخ `DATABASE_URL` الداخلية واربطها بالتطبيق

### 3. متغيرات البيئة (Runtime)

| المتغير | القيمة |
|---------|--------|
| `DATABASE_URL` | من خدمة PostgreSQL |
| `SESSION_SECRET` | `openssl rand -base64 32` |
| `NEXT_PUBLIC_APP_URL` | `http://91.98.234.130.nip.io` (HTTP) أو `https://...` لاحقاً |
| `UPLOAD_DIR` | `/app/uploads` |

> **HTTP (nip.io):** اضبط `NEXT_PUBLIC_APP_URL` بـ `http://` — الكوكيز تُفعّل `Secure` تلقائياً فقط مع `https://`.
| `SMTP_HOST` | `smtp.hostinger.com` |
| `SMTP_PORT` | `465` |
| `SMTP_SECURE` | `true` |
| `SMTP_USER` / `SMTP_PASS` | بيانات البريد |
| `CRON_SECRET` | سر لـ `/api/cron/follow-up-reminders` (مثلاً `openssl rand -hex 32`) |

### 3.1 تذكير متابعة ما بعد التوظيف (Cron)

جدّول طلب HTTP يومي:

```http
GET https://YOUR_DOMAIN/api/cron/follow-up-reminders
Authorization: Bearer YOUR_CRON_SECRET
```

في Coolify: **Scheduled Tasks** → cron `0 8 * * *` (08:00 UTC يومياً).

> يُشغَّل أيضاً عند تحميل لوحة المدير/المستفيد كـ fallback.

### 4. Migrations (تلقائي)

عند كل تشغيل للحاوية يُنفَّذ `npx prisma migrate deploy` تلقائياً عبر [`docker-entrypoint.sh`](../docker-entrypoint.sh) — **لا حاجة لـ Pre-deployment في Coolify**.

(أول مرة فقط — seed يدوي عبر Terminal في Coolify: `npm run db:seed`)

### 5. Persistent Storage

- Mount: `/app/uploads` → volume دائم (مرفقات/CV)

### 6. الشبكة

- **Port Exposes:** `3000`
- النطاق + HTTPS: من إعدادات Coolify (SSL تلقائي)

### 7. ذاكرة محدودة (4 GB)

إذا فشل `next build` بـ OOM:

```bash
# swap على السيرفر
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
```

أو Build Env: `NODE_OPTIONS=--max-old-space-size=3072`

### 8. التحقق بعد النشر

1. `https://tmkeen.alzaad.org.sa` — الصفحة الرئيسية
2. `/login` — بعد seed (حساب admin من `prisma/seed.ts`)
3. رفع CV — يتحقق من volume `/app/uploads`
4. Logs — لا أخطاء `DATABASE_URL is not set`

---

## نشر على Hostinger VPS (يدوي — بدون Coolify)

## المتطلبات على السيرفر

- Ubuntu 22.04+ (Hostinger KVM VPS — 2 vCPU / 4 GB RAM موصى به)
- نطاق مربوط بـ A record → IP السيرفر
- صندوق بريد على نفس النطاق (Hostinger Email)

## 1. تثبيت الاعتماديات

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y nginx postgresql postgresql-contrib certbot python3-certbot-nginx git

curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
source ~/.bashrc
nvm install 22
npm install -g pm2
```

## 2. PostgreSQL

```bash
sudo -u postgres psql <<EOF
CREATE DATABASE tmkeen;
CREATE USER tmkeen WITH ENCRYPTED PASSWORD 'STRONG_PASSWORD';
GRANT ALL PRIVILEGES ON DATABASE tmkeen TO tmkeen;
\c tmkeen
GRANT ALL ON SCHEMA public TO tmkeen;
EOF
```

## 3. استنساخ المشروع

```bash
sudo mkdir -p /var/www/tmkeen
sudo chown $USER:$USER /var/www/tmkeen
git clone https://github.com/YOUR_ORG/tmkeen.git /var/www/tmkeen
cd /var/www/tmkeen
cp .env.example .env
# عدّل .env: DATABASE_URL, SESSION_SECRET, SMTP_*, UPLOAD_DIR=/var/www/tmkeen/uploads
mkdir -p uploads
npm ci
npx prisma migrate deploy
npm run db:seed
npm run build
pm2 start npm --name tmkeen -- start
pm2 save
pm2 startup
```

## 4. Nginx

```nginx
# /etc/nginx/sites-available/tmkeen
server {
    listen 80;
    server_name tmkeen.example.com;

    client_max_body_size 10M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/tmkeen /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d tmkeen.example.com
```

## 5. SMTP (Hostinger)

في `.env`:

```
SMTP_HOST=smtp.hostinger.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=noreply@yourdomain.com
SMTP_PASS=mailbox-password
```

## 6. النسخ الاحتياطي (cron)

```bash
crontab -e
# يومياً 2:00 ص
0 2 * * * pg_dump -U tmkeen tmkeen | gzip > /var/backups/tmkeen-$(date +\%F).sql.gz
0 2 * * * tar -czf /var/backups/tmkeen-uploads-$(date +\%F).tar.gz /var/www/tmkeen/uploads
```

## 7. GitHub Actions (اختياري)

أضف secrets في GitHub: `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY` — workflow `deploy.yml` ينشر تلقائياً عند push لـ `main`.

## التطوير المحلي

```bash
docker compose up -d
cp .env.example .env
npm ci
npx prisma migrate dev
npm run db:seed
npm run dev
```
