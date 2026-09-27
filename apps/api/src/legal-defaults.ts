// محتوى افتراضي للصفحات القانونية — يُقرأ حتى لا يعيد المشغّل كتابته،
// ويُستبدل تلقائياً بمجرد حفظه من /ops (جدول LegalPage).
export interface LegalContent { title: string; body: string }

export const DEFAULT_LEGAL: Record<"privacy" | "terms", { ar: LegalContent; fr: LegalContent }> = {
  privacy: {
    ar: {
      title: "سياسة الخصوصية",
      body: [
        "آخر تحديث: سبتمبر 2026",
        "1. الجهة المسؤولة: «جيريني» (Jirini) مزوّد خدمة نقاط بيع وبرمجيات سحابية للتجار في الجزائر.",
        "2. البيانات التي نجمعها: بيانات حسابك (اسم النشاط، الهاتف، كلمة المرورة مشفّرة)، وبيانات تشغيلك (المنتجات، الطلبات، الموظفون، المصاريف) التي تُدخلها أنت داخل النظام، وبعض البيانات التقنية الأساسية (عنوان IP، نوع المتصفح) لأغراض الأمن ومنع سوء الاستخدام.",
        "3. كيف نستخدم البيانات: لتشغيل الخدمة وعرض تقاريرك، وإرسال إشعارات تشغيلية، وتحسين الأداء، والوفاء بالالتزامات القانونية. لا نستخدم بياناتك لأي غرض إعلاني.",
        "4. المشاركة: لا نبيع بياناتك ولا نشاركها مع أطراف ثالثة، إلا بحكم قانوني أو لتنفيذ الخدمة عبر مزوّدين تقنيين موثوقين (استضافة وقواعد بيانات) ملزمين بالسرية.",
        "5. الأمان: نعتمد تشفير النقل (HTTPS)، وتشفير كلمات المرور، وصلاحيات وصول دقيقة، ونسخاً احتياطياً دورياً.",
        "6. الاحتفاظ: تُحتفظ بياناتك ما دام اشتراكك فعالاً، ثم قد تُحذف بعد انتهاء المهلة القانونية للحفظ.",
        "7. حقوقك: لك الحق في الاطلاع على بياناتك أو تصحيحها أو طلب حذفها عبر التواصل معنا.",
        "8. التواصل: لأي استفسار حول الخصوصية تواصل مع فريق الدعم داخل النظام أو عبر قنواتنا الرسمية.",
      ].join("\n\n"),
    },
    fr: {
      title: "Politique de confidentialité",
      body: [
        "Dernière mise à jour : septembre 2026",
        "1. Responsable : « Jirini », fournisseur algérien de logiciels de caisse en ligne pour les commerçants.",
        "2. Données collectées : données de compte (nom de l'activité, téléphone, mot de passe chiffré), données d'exploitation saisies par vous (produits, commandes, employés, dépenses), et données techniques essentielles (adresse IP, type de navigateur) pour la sécurité.",
        "3. Utilisation : fourniture du service, affichage de vos rapports, notifications d'exploitation, amélioration des performances et conformité légale. Aucune utilisation publicitaire.",
        "4. Partage : aucune vente de données ; partage uniquement si la loi l'exige ou avec des prestataires techniques (hébergement, base de données) liés par la confidentialité.",
        "5. Sécurité : HTTPS, chiffrement des mots de passe, contrôle d'accès strict, sauvegardes régulières.",
        "6. Conservation : pendant la durée de votre abonnement, puis selon les délais légaux.",
        "7. Vos droits : accès, rectification, suppression — contactez notre support dans l'application.",
        "8. Contact : équipe support Jirini via les canaux officiels du service.",
      ].join("\n\n"),
    },
  },
  terms: {
    ar: {
      title: "شروط الاستخدام",
      body: [
        "آخر تحديث: سبتمبر 2026",
        "1. قبول الشروط: باستخدامك خدمة «جيريني» فإنك توافق على هذه الشروط. إن لم توافق توقف الاستخدام.",
        "2. الخدمة: منصة سحابية لإدارة المخزون والمبيعات والفواتير والتقارير، تُقدَّم باشتراك شهري/سنوي حسب الباقة المختارة.",
        "3. الحساب: أنت مسؤول عن سرية بيانات الدخول (كلمة المرور وأكواد PIN) وعن كل النشاطات التي تتم عبر حسابك. أبلغنا فوراً عن أي استعمال غير مauthorized.",
        "4. التجربة والدفع: تجربة مجانية 30 يوماً، ثم يستمر الاشتراك بعد الدفع اليدوي أو عبر CIB/EDAHABIA. الأسعار بالدينار الجزائري وشاملة ما ينص عليه القانون.",
        "5. الاستخدام المقبول: يُمنع رفع محتوى مخالف للقانون، أو محاولة اختراق الخدمة، أو استعمالها لنشاط تجاري غير مصرّح به.",
        "6. البيانات والمساءلة: أنت وحدك مسؤول عن بيانات نشاطك وعن قراراتك التجارية المبنية على تقارير النظام.",
        "7. التوقف: يجوز لنا تعليق الخدمة عند عدم السداد أو عند مخالفة الشروط، مع إشعار مسبق متى أمكن، وتبقى بياناتك محفوظة لفترة سماحية.",
        "8. حدود المسؤولية: تُقدَّم الخدمة «كما هي»؛ لا نضمن انقطاعاً صفرياً، ومسؤوليتنا محصورة في اشتراك مدفوع لم يُقدَّم.",
        "9. القانون الحاكم: تنظَّم هذه الشروط بقانون جزائري، وأي نزاع يُحسم أمام الجهات المختصة في الجزائر.",
      ].join("\n\n"),
    },
    fr: {
      title: "Conditions d'utilisation",
      body: [
        "Dernière mise à jour : septembre 2026",
        "1. Acceptation : en utilisant « Jirini », vous acceptez les présentes conditions.",
        "2. Service : plateforme cloud de gestion du stock, des ventes, des factures et des rapports, facturée à l'abonnement mensuel ou annuel selon la formule choisie.",
        "3. Compte : vous êtes responsable de la confidentialité de vos identifiants (mot de passe, codes PIN) et de toute activité passée par votre compte. Signalez tout usage non autorisé.",
        "4. Essai et paiement : essai gratuit de 30 jours, puis abonnement après paiement manuel ou par CIB/EDAHABIA. Prix en dinars algériens.",
        "5. Usage acceptable : contenu illicite, tentative d'intrusion et usage non autorisé sont interdits.",
        "6. Données : vous restez seul responsable de vos données et de vos décisions commerciales.",
        "7. Suspension : service suspendu en cas de non-paiement ou de violation des conditions, avec préavis quand c'est possible ; période de grâce conservatoire.",
        "8. Responsabilité : service fourni « en l'état » ; notre responsabilité est limitée à l'abonnement payé non rendu.",
        "9. Droit applicable : droit algérien ; tribunaux compétents d'Algérie.",
      ].join("\n\n"),
    },
  },
};
