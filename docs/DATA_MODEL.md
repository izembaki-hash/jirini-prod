# خريطة البيانات (Multi-tenant)

كل سجل يحمل `tenant_id`. العزل: `WHERE tenant_id = $1` في Postgres (فهرس مركّب)، و`request.auth.token.tenant_id == resource.data.tenant_id` في Firestore.

## المجموعات/الجداول

- `tenants` — النشاط: النوع (restaurant|shop)، الخطة، اللغة، crmEnabled، overtimeEnabled
- `branches` — (tenant_id, name, address)
- `products` — buy/sell/qty/min/barcode/shelf/expiry/wholesale/active/**saleable** + (tenant_id, branch_id). `saleable=false` = مكوّن خام: يُستبعد من POS والمنيو ويُرفض في البيع (409)
- `recipeItems` — (فقط مطاعم في الواجهة) `dishId → ingredientId + qty` للوحدة، فريد (dish, ingredient)
- `suppliers` — اسم/هاتف (فريد لكل مستأجر)/عنوان/ملاحظات/نشط/**openingDebt** (دين قديم يُجمع مع فواتير الشراء في `balance`)
- `purchases` — num/المورّد/بنود Json (productId/name/qty/unitCost)/total/paid/status(unpaid|partial|paid)/date. الشراء يُدخل المخزون ويحدّث `buyPrice` بآخر سعر
- `supplierPayments` — دفعة مرتبطة بفاتورة (amount/method/ref/date)
- `alerts` — kind(recipe_short|low_stock|wastage)/refId/message/read
- `drivers` — اسم/هاتف (فريد)/مركبة/kind(internal|external)/نشط — بلا دخول أبداً
- `subscriptions` — plan/status(trialing|pending|active|past_due|suspended)/startedAt/expiresAt/amountDzd/lastRef/confirmedBy
- `payments` — سجل كل محاولة دفع SofizPay: ref فريد/plan/months/amountDzd/email/status(initiated|paid|failed|cancelled|expired)/sofizTransactionId/cibTransactionId(لا يغادر الخادم)/confirmedAt
- `orders` — lines/discount/tax/total/pay(cash|card|**credit**)/kind/table/status/customer/**consumed** (المكونات المخصومة فعلياً لعكسها عند الإلغاء)/**driverId** — فهرس (tenant, branch, status, createdAt DESC) للمطبخ اللحظي. `credit` يتطلب هاتفاً: يُنشأ العميل تلقائياً ويُرفع `customers.balance`، والإلغاء يُسقط الدين

## مسارات المشغّل (`/ops/*` بمفتاح `x-operator-key` — حدود معدل صارمة)

- `GET /ops/overview` — عدّادات (أنشطة/مستخدمون/طلبات وإيراد اليوم) + توزيع الاشتراكات + أحدث المدفوعات (20)
- `GET /ops/tenants` — كل مستأجر: الخطة/المستخدمون/الفروع/الاشتراك/طلبات وإيراد 30 يوماً
- `GET /ops/tenants/:id` — التفاصيل الكاملة (بدون `passwordHash` أبداً) + `PATCH` (الخطة/الأعلام) + `POST .../suspend|unsuspend|extend`
- `GET /ops/payments[?status]` — كل المدفوعات مع slug النشاط
- `GET /ops/health` — القاعدة/uptime/الوقت + **وجود** الإعدادات (قيم منطقية فقط — لا أسرار تُسرَّب أبداً)

## قواعد المخزون

```
البيع = خصم المنتج النهائي (صارم: 409 عند النفاد)
       + خصم مكونات الوصفة حتى الصفر (تحذير مع المتابعة: warnings[] + تنبيه)
الإلغاء = استرجاع النهائي + استرجاع consumed
الشراء = زيادة الكمية + buyPrice = آخر سعر شراء + دين (total − paid)
الهدر = خصم بسبب موثّق + تنبيه wastage (+ تنبيه low_stock عند عبور الحد نزولاً)
```
- `shifts` — opening/closing/expected/diff/note — تُربط كل فاتورة بالوردية المفتوحة
- `employees` + `attendance` (in/out/overtimeMin) — الراتب = الساعات الفعلية × الأجر (+×1.5 للأوفر تايم عند التفعيل)
- `customers` — اسم/هاتف/عنوان + **balance** (دين آجل) + تاريخ مشتريات (تُخفى كلياً عند تعطيل CRM). `POST /customers/:id/pay` يُنقص الدين (منع التجاوز 400) ويسجل في **`customerPayments`** (amount/method/ref/date)
- `goals` — title/target/saved/monthly — التقدم % وتنبيهات 25/50/75/100

## حساب الفائدة اليومية

```
ربح الفاتورة = Σ(سعر البيع − سعر الشراء) × الكمية − الخصم
الفائدة اليومية = Σ أرباح فواتير اليوم (غير الملغاة)
```

تُحسب في `profitOf()` (الواجهة) ونفس الصيغة في Cloud Function المجدولة `closeDayProfit` (لقطة 23:59 بتوقيت الجزائر) — مخطط النمو يبني عليها متوسط الربح الشهري.
