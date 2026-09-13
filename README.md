# إدارة حمص الخام

نظام ويب لاستبدال ملف إكسل الموسم.

## المجلدات

| المسار | المحتوى |
|--------|---------|
| `docs/` | وثيقة الأعمال + الملاحم وقصص المستخدم (عربي) |
| `app/` | تطبيق Nuxt (SPA) + Nuxt UI + Supabase |
| `supabase/migrations/` | مخطط قاعدة البيانات |

## البدء السريع

1. أنشئ مشروع Supabase
2. نفّذ SQL من `supabase/migrations/001_init.sql`
3. أنشئ مستخدم من Authentication
4. انسخ المفاتيح إلى `app/.env` (انظر `app/.env.example`)
5. شغّل التطبيق:

```bash
cd app
npm install --legacy-peer-deps
npm run dev
```

التفاصيل في [`app/README.md`](app/README.md).
