# Sudan Gold Exchange — منصة أسعار الذهب في السودان لحظة بلحظة

منصة ويب متكاملة مبنية بـ **Next.js (App Router)** و **TypeScript** و **Tailwind CSS** و **Supabase** لمتابعة أسعار الذهب في السودان بجميع العيارات (24، 22، 21، 18، والجنيه الذهب) لحظة بلحظة، مع حاسبة الذهب والمصنعية ونصاب الزكاة، ورسم بياني تفاعلي لآخر 7 و30 يوماً، ولوحة إدارة ميدانية، وأتمتة نشر 3 مرات يومياً على تيليجرام عبر GitHub Actions.

## المميزات الرئيسية

- **لوحة أسعار فورية (RTL عربي بالكامل):** تعرض سعر الأونصة العالمي `XAU/USD`، سعر الدولار الموازي والرسمي، وأسعار جميع العيارات بالجنيه السوداني مع نسبة التغير اليومي.
- **حاسبة الذهب والمصنعية والزكاة:** حساب فوري بالجرام أو التولة (`11.6638 جم`) أو الأونصة (`31.1035 جم`) أو الجنيه الذهب (`8 جم عيار 21`) مع حساب قيمة **نصاب زكاة الذهب (85 جم عيار 24)** ومقدار الزكاة تلقائياً.
- **رسم بياني تفاعلي (7 / 30 يوماً):** مع بيانات مرجعية افتتاحية لآخر 30 يوماً (شاملة 14+ يوماً واقعياً) حتى لا يظهر الرسم فارغاً عند التشغيل الأول.
- **لوحة الإدارة الميدانية (`/admin/update`):** محمية بكلمة مرور `ADMIN_PASSWORD` لتحديث الدولار الموازي/الرسمي أو الأونصة أو المصنعية وإعادة الحساب والنشر الفوري على تيليجرام.
- **أتمتة GitHub Actions (`scripts/gold_sync.py`):** جلب سعر الأونصة من مصادر احتياطية متعددة (`gold-api`، `metals.live`، `Yahoo Finance GC=F` و`XAUUSD=X`) وحساب العيارات وحفظها في Supabase وإرسال نشرة تيليجرام 3 مرات يومياً (10 صباحاً، 2 ظهراً، 6 مساءً بتوقيت السودان).
- **تهيئة SEO كاملة:** `sitemap.ts`، `robots.ts`، صورة Open Graph ديناميكية، بيانات JSON-LD المنظمة (`WebSite`, `Dataset`, `FAQPage`)، ومتغير `GOOGLE_SITE_VERIFICATION`.

## خطوات الإعداد والنشر

### 1. قاعدة البيانات (Supabase)
نفّذ محتوى الملف [`supabase/schema.sql`](supabase/schema.sql) داخل **Supabase SQL Editor** لإنشاء جدولي `exchange_rates` و `gold_prices` وسياسات الأمان (RLS) والبيانات الافتتاحية.

### 2. متغيرات البيئة (`.env.local` / Vercel)
انسخ `.env.example` إلى `.env.local` واضبط المتغيرات:
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ADMIN_PASSWORD`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHANNEL_ID`
- `NEXT_PUBLIC_TELEGRAM_CHANNEL_URL`
- `NEXT_PUBLIC_SITE_URL`
- `GOOGLE_SITE_VERIFICATION`

### 3. التشغيل المحلي
```bash
npm install
npm run dev
```

### 4. أسرار GitHub Actions
أضف الأسرار التالية في **Settings → Secrets and variables → Actions**:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHANNEL_ID`
