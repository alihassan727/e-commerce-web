# Atlas Clothier

Seasonal clothing store built with Next.js (App Router), Supabase (DB + Auth + Storage), and an n8n order/stock automation workflow. Cash on delivery only.

## Stack
- Next.js 14 (App Router) + TypeScript + Tailwind CSS
- Supabase: Postgres, Auth, Storage
- n8n: order/stock webhook automation (hosted by you)
- Deploy: Vercel

## Getting started
1. Install dependencies: `npm install`
2. Copy `.env.local.example` to `.env.local` and fill in your Supabase URL, anon key, service-role key, the admin email (`ali.hassooo11@gmail.com`), and the n8n webhook URL.
3. Apply the database migration: `supabase/migrations/0001_init.sql` in the Supabase SQL editor.
4. Run the dev server: `npm run dev`

## Admin access
Only the email set in `ADMIN_EMAIL` can see the Admin link and reach `/admin`. Everyone else who hits `/admin` sees an unauthorized page. Protection is enforced in middleware and re-checked in every admin server action.

## n8n webhook contract
On checkout the site POSTs an order payload to `N8N_WEBHOOK_URL`. Point your existing n8n workflow at the tables in the migration. See `docs/n8n-contract.md` for the exact payload, the stock-check logic, and the columns n8n should read/write.

## Deploy to Vercel
1. Push the repository to GitHub and import it in Vercel.
2. Add the environment variables (same names as `.env.local.example`): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_EMAIL`, `N8N_WEBHOOK_URL`.
3. In Supabase Auth settings, add your Vercel domain to the allowed redirect URLs so the email-confirmation callback (`/auth/callback`) works.
4. Run the migration `supabase/migrations/0001_init.sql` in the Supabase SQL editor (once). This creates all tables, RLS policies, the `product-images` storage bucket, and seed data.
5. Upload product images from the admin panel, or place files in the `product-images` bucket at the seeded `seed/...` paths to replace the placeholders.
