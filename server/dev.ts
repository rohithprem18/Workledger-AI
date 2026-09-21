import { createApp } from './app.js';

/**
 * Local development server.
 *
 * Vercel runs the app as a serverless function, so nothing in production calls
 * `listen`. This exists so `npm run dev` gives the Vite proxy something to
 * talk to on port 8080.
 */
const port = Number(process.env.PORT ?? 8080);

createApp().listen(port, () => {
  console.log(`WorkLedger AI API listening on http://localhost:${port}`);
  console.log(`  health: http://localhost:${port}/api/health`);
});
