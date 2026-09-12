// بذرة الإنتاج المستقلة: npm run db:seed
// (نفس منطق بذرة أول إقلاع — غيّر كلمة السر فوراً بعد الدخول).
import { maybeSeed } from "./bootstrap.js";

maybeSeed().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
