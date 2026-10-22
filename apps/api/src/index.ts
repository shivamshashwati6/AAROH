import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// Defensive environment variable loading
const rootEnvPath = path.resolve(__dirname, '../../../.env');
if (fs.existsSync(rootEnvPath)) {
  dotenv.config({ path: rootEnvPath });
} else {
  dotenv.config();
}

import { checkDbStatus } from './db';
import { disasterRouter } from './routes/disasters';
import { zoneRouter } from './routes/zones';
import { shelterRouter } from './routes/shelters';
import { resourceCenterRouter } from './routes/resource-centers';
import { reportRouter } from './routes/reports';
import { roadSegmentRouter } from './routes/road-segments';
import { authRouter } from './routes/auth';
import { recommendationRouter } from './routes/recommendations';

const app = express();
const PORT = process.env.PORT || 4000;
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:5173';

app.use(cors({ origin: CORS_ORIGIN, credentials: true }));
app.use(express.json({ limit: '2mb' }));

// -----------------------------------------------------------------------------
// Health Check Endpoint
// -----------------------------------------------------------------------------
app.get('/api/health', async (_req: Request, res: Response) => {
  const db = await checkDbStatus();
  res.status(200).json({
    status: 'healthy',
    service: 'RELIEF-OS Decision Engine API',
    version: '0.2.0',
    phase: 'Phase 2 - Backend API & Database Integration',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    database: db,
  });
});

// -----------------------------------------------------------------------------
// API Route Registry
// -----------------------------------------------------------------------------
app.use('/api/auth', authRouter);
app.use('/api/disasters', disasterRouter);
app.use('/api/zones', zoneRouter);
app.use('/api/shelters', shelterRouter);
app.use('/api/resource-centers', resourceCenterRouter);
app.use('/api/resource_centers', resourceCenterRouter); // API compatibility alias
app.use('/api/reports', reportRouter);
app.use('/api/road-segments', roadSegmentRouter);
app.use('/api/road_segments', roadSegmentRouter); // API compatibility alias
app.use('/api/recommendations', recommendationRouter);
app.use('/api/plans', recommendationRouter); // PRD API alias (POST /api/plans/:id/approve, etc.)


// -----------------------------------------------------------------------------
// 404 Route Handler
// -----------------------------------------------------------------------------
app.use((req: Request, res: Response) => {
  res.status(404).json({
    error: 'Endpoint not found',
    method: req.method,
    path: req.originalUrl,
  });
});

// -----------------------------------------------------------------------------
// Global Error Handler (Sanitizes internal server details)
// -----------------------------------------------------------------------------
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const message = err instanceof Error ? err.message : 'Internal Server Error';
  console.error('[RELIEF-OS API Unhandled Error]:', message);
  res.status(500).json({
    error: 'An internal server error occurred while processing the request',
  });
});

// Start listening when not in a test runner
const isTest =
  process.env.NODE_ENV === 'test' ||
  process.env.npm_lifecycle_event === 'test' ||
  process.argv.some((arg) => arg.includes('test'));

if (!isTest) {
  app.listen(PORT, () => {
    console.log(`[RELIEF-OS API] Decision Engine Server listening on port ${PORT}`);
    console.log(`[RELIEF-OS API] Health endpoint available at http://localhost:${PORT}/api/health`);
  });
}

export default app;
