import express, { Express } from 'express';
import apiRouter from '../server/routes/api';

export function createTestApp(): Express {
  const app = express();
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));
  app.use('/api', apiRouter);
  return app;
}
