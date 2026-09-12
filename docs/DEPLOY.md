# النشر للإنتاج (VPS أو Firebase)

## الخيار 1: سيرفر شهري VPS (موصى به للتحكم الكامل)

### 1. تجهيز السيرفر (Ubuntu 22.04)

```bash
apt update && apt install -y docker.io docker-compose-plugin
mkdir -p /opt/dzsaas && cd /opt/dzsaas
# انسخ المشروع إلى هنا
cp .env.example .env
nano .env   # ← غيّر POSTGRES_PASSWORD وJWT_SECRET (openssl rand -hex 32) والنطاقات
```

### 2. الإطلاق

```bash
docker compose up -d --build
docker compose exec api npx prisma migrate deploy   # (الـentrypoint يفعلها تلقائياً أيضاً)
# بذرة المالك التجريبي (مرة واحدة فقط):
docker compose exec -e SEED_DEMO=true api node dist/seed.js
```

البذرة تنشئ: `slug=demo-resto` / هاتف `0550000000` / كلمة سر `demo1234` — **غيّرها فور دخولك** (أنشئ مالكاً جديداً من `/auth/users` ثم عطّل الأول).

### 3. النطاقات وHTTPS

- وجّه `app.example.dz` و`api.example.dz` إلى IP السيرفر (سجلا A).
- عدّل `infra/caddy/Caddyfile` بنطاقاتك ثم `docker compose up -d caddy` — الشهادات تلقائية.
- ابنِ الواجهة بعنوان الخلفية: `VITE_API_URL=https://api.example.dz` في `.env` قبل `up --build`.

### 4. النسخ الاحتياطي

```bash
cp scripts/backup.sh /opt/dzsaas/scripts/   # موجود مسبقاً
crontab -e
# 0 3 * * * /opt/dzsaas/scripts/backup.sh
```

### 5. التحديث

```bash
cd /opt/dzsaas && git pull && docker compose up -d --build
# الترحيلات تُطبَّق تلقائياً عند إقلاع api
```

## الخيار 2: Firebase (بدون سيرفر)

```bash
npm i -g firebase-tools && firebase login
firebase use --add
# ابنِ الواجهة أولاً (تُستضاف من dist):
cd apps/web && npm run build && cd ../..
firebase deploy --only firestore:rules,firestore:indexes,storage,functions,hosting
# Functions: ثبّت اعتمادياتها مرة واحدة:
cd infra/firebase/functions && npm install && cd ../../..
```

- المصادقة: Firebase Auth (هاتف/بريد) + الدالة `setUserRole` تزرع `tenant_id` و`role` في claims.
- اللحظية: `onSnapshot` على `orders` (الواجهة: بدّل `kitchenStream` بـ listener عند الحاجة).
- البيانات الأولية: أنشئ مستند `tenants/{id}/collections/...` من لوحة Firestore أو سكربت admin لمرة واحدة.

## الدفع أونلاين (SofizPay — CIB/EDAHABIA، بدون عقد بنكي)

1. أنشئ حساب تاجر في **sofizpay.com** وانسخ `account` (المفتاح العام) — ضعه في `SOFIZPAY_ACCOUNT`.
2. فعّل **Testing Mode** من إعدادات تطبيقهم، واضبط `SOFIZPAY_BASE=https://sofizpay.com/sandbox` للتجربة.
3. جرّب دورة كاملة: الإعدادات ← ادفع الآن ← صفحة الدفع ← العودة ← يجب أن تتفعّل الخطة تلقائياً (تحقق عبر `cib-transaction-check` من الخادم فقط — لا نثق بالعميل أبداً).
4. للإطلاق: أطفئ Testing Mode + `SOFIZPAY_BASE=https://sofizpay.com` + نفّذ دفعة حقيقية صغيرة (100 دج) + تأكد من إعداد **السحب (Payout)** في لوحتهم.
5. `return_url` يجب أن يكون HTTPS (Caddy يوفّره) — بدونه يرفض المزوّد العودة.
6. **احتياطي دائم**: الدفع اليدوي CCP/تحويل + إرسال المرجع + تأكيد المشغّل (`OPERATOR_KEY` + `POST /billing/admin/confirm`) يبقى يعمل.

## قائمة ما قبل الإطلاق

- [ ] `JWT_SECRET` عشوائي طويل + `POSTGRES_PASSWORD` قوية + `OPERATOR_KEY` سري
- [ ] `CORS_ORIGIN` = نطاق الواجهة فقط (لا `*`) + `FRONTEND_URL` صحيح (لعودة الدفع)
- [ ] `SOFIZPAY_ACCOUNT` = حسابك + Testing Mode مطفأ + دفعة تجريبية ناجحة
- [ ] تغيير كلمة سر المالك من الإعدادات (الأمان والأجهزة) — لا تبقِ `demo1234`
- [ ] فحص `/health` خارجياً + تجربة دورة كاملة (بيع → مطبخ → وردية → تقرير)
- [ ] تفعيل النسخ الاحتياطي اليومي + تجربة استعادة
- [ ] حدود الفروع والخطط مطبَّقة في الخادم (starter بلا أونلاين/نمو) — مفعّلة افتراضياً
