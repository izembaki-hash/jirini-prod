# دكّان برو — منصة SaaS لإدارة المطاعم والمحلات (السوق الجزائري)

**اعرف ربحك الحقيقي بضغطة واحدة.** POS لمسي + مخزون + ورديات + مطبخ لحظي + طلب QR + عمال ورواتب + تقارير + فروع + مخطط نمو مالي. عربي/فرنسي، دينار دج، توقيت الجزائر.

## التشغيل على جهازك (محلياً — دقيقتان)

المتطلب الوحيد: **Node.js 20+** من `https://nodejs.org` (اختر LTS).

```powershell
# 1) مرة واحدة فقط: تثبيت المكتبات (2-3 دقائق)
npm install

# 2) تشغيل المشروع كاملاً (واجهة + خادم) بأمر واحد
npm run dev
```

ثم افتح: `http://localhost:5173`

- **الوضع التجريبي** (بدون دخول): من الصفحة الرئيسية اختر مطعم/محل وجرّب كل شيء.
- **الوضع المتصل** (بالخادم): سجّل الدخول من زر «دخول المشتركين»:
  - المعرف: `demo-resto` — الهاتف: `0550000000` — السر: `demo1234`
- **بوابة الزبون**: `http://localhost:5173/o/demo-resto/menu?t=2`

> خطأ «تعذّر الاتصال بالخادم» يعني أن الخادم (المنفذ 4000) لا يعمل — تأكد أن نافذة `npm run dev` مفتوحة وتعمل. للإيقاف: `Ctrl+C` في نفس النافذة.

## البنية: إطلاق مفتوح دائماً (Firebase أو VPS)

```
packages/shared   → العقد والأنواع والحسابات الخالصة (ربح/رواتب/ادخار/خطط)
apps/web          → React + TS + Tailwind v4 + shadcn-style (PWA)
apps/api          → Node + Express + DbPort (نفس الواجهة للقاعدتين)
  ├─ MemoryAdapter  (الحالي: يعمل بدون قاعدة)
  ├─ PrismaAdapter   (VPS: PostgreSQL — الجداول في prisma/schema.prisma)
  └─ FirestoreAdapter (Firebase — القواعد في infra/firebase)
infra/firebase    → firestore.rules (عزل tenant_id) + indexes + functions
docker-compose.yml → postgres + api + web (إطلاق VPS بأمر واحد)
```

**التبديل سطر واحد** في `apps/api/src/app.ts` (`new MemoryAdapter()` → المحوّل المطلوب) — المنطق والعقد لا يتغيران. اللحظية: Firebase `onSnapshot`، وVPS `GET /stream/kitchen` (SSE) — نفس الأحداث.

## إطلاق VPS الشهري

```powershell
cp .env.example .env
docker compose up -d --build
# web :8080 · api :4000 · postgres :5432
cd apps/api; npm install; npm run db:migrate
```

## إطلاق Firebase

```powershell
firebase use <project>
firebase deploy --only firestore:rules,firestore:indexes,functions,hosting
```

## الخطط والصلاحيات

| | ستارتر 2500 | برو 3000 | ميغا 4500 |
|---|---|---|---|
| الفروع | 1 | 2 | 5+ |
| POS/ورديات/مخزون/عمال/تقارير/فائدة يومية | ✓ | ✓ | ✓ |
| طلب أونلاين + QR + توصيل | ✗ | ✓ | ✓ |
| مخطط النمو المالي | ✗ | ✓ | ✓ |

الأدوار: مالك (كل شيء) · مدير فرع (فرعه) · كاشير (POS فقط) · طباخ (المطبخ فقط) · زبون (البوابة العامة). يعمل بسلاسة لمستخدم واحد بدون تعقيد.

## لوحة المشغّل (`/ops`)

إدارة المنصة بمفتاح `OPERATOR_KEY` (ترويسة `x-operator-key` — لا JWT ولا دخول مستأجر):
نظرة شاملة (الأنشطة/المستخدمون/طلبات وإيراد اليوم/توزيع الاشتراكات/أحدث المدفوعات)، كل المستأجرين مع التفاصيل (بدون كلمات سر أبداً)، تغيير الخطة، تمديد، تعليق/فك، تأكيد الدفع اليدوي، كل المدفوعات، وصحة النظام. محلياً: `OPERATOR_KEY=dev-operator-key` ثم افتح `http://localhost:5173/ops`.

## التصميم

المرجع الوحيد: `DESIGN.md`. لون مميز واحد (Growth Emerald)، IBM Plex Sans Arabic، RTL/عربي وLTR/فرنسي، أهداف لمس 44px، حركة مقيدة (POS بلا حركة)، `prefers-reduced-motion` مدعوم، تباين AA.
