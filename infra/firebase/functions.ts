// Cloud Functions (واجهة رقيقة فوق نفس منطق packages/shared).
// عند البيع: خصم الوصفة من المكونات + تنبيه نفاد + تحديث الفائدة اليومية.
// النسخة الكاملة تُنشر مع `firebase deploy --only functions,firestore`.
export const onOrderCreate = "(DocumentReference onCreate: tenants/{t}/collections/orders/{id}) → خصم مخزون + دفع لحظي للمطبخ";
export const onStockLow = "(scheduled daily 22:00 Africa/Algiers) → تنبيه مخزون منخفض + صلاحية قريبة";
export const closeDayProfit = "(scheduled daily 23:59 Africa/Algiers) → لقطة الفائدة اليومية للتقارير ومخطط النمو";
