/**
 * Entry point for Vercel. Vercel's Express preset loads the default-exported app from the first
 * of app.ts, index.ts, server.ts, src/app.ts, ... that exists, so this file must stay at the
 * project root. Docker and `npm run dev` use src/server.ts instead.
 */
import express from 'express';
import { loadApp } from './src/vercel.js';

const app = express();
app.disable('x-powered-by');

app.use((req, res, next) => {
  loadApp().then(
    (api) => {
      api(req, res, next);
    },
    (error: unknown) => {
      console.error('Failed to start the API:', error);
      res.status(503).json({
        success: false,
        error: { code: 'NOT_READY', message: 'The server is starting up. Please try again.' },
      });
    },
  );
});

export default app;
