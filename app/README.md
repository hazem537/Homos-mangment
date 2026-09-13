# إدارة حمص الخام — تطبيق الويب

Nuxt 3/4 (SPA) + Nuxt UI + Supabase  
الواجهة بالكامل بالعربية (RTL).

## التشغيل

```bash
cd app
cp .env.example .env
# ضع مفاتيح Supabase في .env
npm install --legacy-peer-deps
npm run dev
```

افتح: http://localhost:3000

## إعداد Supabase

1. أنشئ مشروعاً على [supabase.com](https://supabase.com)
2. من SQL Editor نفّذ الملف: [`../supabase/migrations/001_init.sql`](../supabase/migrations/001_init.sql)
3. من Authentication → Users أنشئ مستخدم دخول (بريد + كلمة مرور)
4. انسخ Project URL و anon key إلى `app/.env`:

```
NUXT_PUBLIC_SUPABASE_URL=...
NUXT_PUBLIC_SUPABASE_KEY=...
```

## ما تم في MVP-1

- تسجيل دخول (اسم مستخدم)
- لوحة تحكم
- الموردون (CRUD)
- المشتريات (تسجيل شراء + أردب + متوسط سعر + إلغاء)
- التحويلات النقدية (دفعات / تسوية + الباقي)
- الشون
- المواسم + معامل الأردب (170)
- هيكل features/

## اختبارات E2E (Playwright)

1. أنشئ مستخدم اختبار في Supabase Auth:
   - Email: `e2e@homos.local`
   - Password: نفس قيمة `E2E_PASSWORD`
   - Auto Confirm: On
2. انسخ `app/.env.e2e.example` → `app/.env.e2e` وعدّل القيم
3. شغّل:

```bash
npm run test:e2e
```

يغطي: تسجيل الدخول، الموردون، المشتريات، الشون، المواسم.
بعد كل اختبار إنشاء يُحذف الصف من Supabase؛ وفي نهاية الـ suite تُنظَّف بقايا e2e إذا وُجد `E2E_SERVICE_ROLE_KEY`.

أو الواجهة التفاعلية: `npm run test:e2e:ui`

## التالي

- كشف حساب المورد (شراء + تحويل)
- الأرباع وحركات المخزون
