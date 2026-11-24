/**
 * Vercel serverless entry. vercel.json rewrites /api/* here; Vercel serves the
 * static pages itself. DATABASE_URL is set in the Vercel project settings.
 */
import { createApp } from '../server/app.js';
import { createDbFromEnv } from '../server/db.js';

// One small pool per function instance; use Supabase's transaction pooler URL.
const db = createDbFromEnv(process.env, { max: 1 });

// Vercel sits in front of the function, so the client IP comes from X-Forwarded-For.
export default createApp({ db, trustProxy: 1 });
