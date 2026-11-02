import express from 'express';
import { query } from './db.js';
import { municipalitiesRouter } from './routes/municipalities.js';
import { stationsRouter } from './routes/stations.js';

export function createApp() {
  const app = express();

  // Used by the docker compose healthcheck and to show data freshness in the UI.
  app.get('/api/health', async (req, res) => {
    const [lastRun] = await query(`
      SELECT source, data_until, finished_at FROM ingest_runs ORDER BY id DESC LIMIT 1
    `);
    res.json({ status: 'ok', last_ingest: lastRun ?? null });
  });

  app.use('/api/stations', stationsRouter);
  app.use('/api/municipalities', municipalitiesRouter);

  app.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  // Express 5 forwards errors thrown in async handlers to this middleware.
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err.status && err.status < 500) {
      return res.status(err.status).json({ error: err.message });
    }
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}
