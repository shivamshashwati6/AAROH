import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:5173';

app.use(cors({ origin: CORS_ORIGIN, credentials: true }));
app.use(express.json());

import { checkDbStatus } from './db';

// -----------------------------------------------------------------------------
// Health Check Endpoint
// -----------------------------------------------------------------------------
app.get('/api/health', async (_req: Request, res: Response) => {
  const db = await checkDbStatus();
  res.status(200).json({
    status: 'healthy',
    service: 'RELIEF-OS Decision Engine API',
    version: '0.1.0',
    phase: 'Phase 1 - Monorepo Foundation',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    database: db,
  });
});

// -----------------------------------------------------------------------------
// Simulated Demo KPIs (Assam Flood canonical scenario)
// -----------------------------------------------------------------------------
app.get('/api/disasters/demo-kpis', (_req: Request, res: Response) => {
  res.status(200).json({
    disaster_id: 'assam-flood-2026',
    disaster_name: 'Assam Flood Response (Simulated)',
    status: 'LIVE',
    is_simulated: true,
    kpis: {
      active_disaster_count: 1,
      affected_population: 18420,
      critical_zones_count: 7,
      resource_shortages_count: 4,
      active_teams_count: 23,
      shelter_occupancy_pct: 71,
      total_shelters: 18,
      relief_centers: 5,
      vehicles_deployed: 21,
      total_reports_ingested: 1247,
    },
    hero_zone: {
      name: 'Zone A',
      priority_score: 94,
      priority_band: 'Critical',
      affected_population: 3842,
      food_shortage_pct: 72,
      water_shortage_pct: 61,
      medical_risk: 'High',
      nearest_shelter_km: 5.4,
      recommended_action: {
        boats: 4,
        food_kits: 1200,
        water_units: 800,
        medical_teams: 1,
        source_center: 'Relief Center #3',
        selected_route: 'Route C (Route A flooded)',
      },
    },
  });
});

// Start listening
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`[RELIEF-OS API] Decision Engine Server listening on port ${PORT}`);
    console.log(`[RELIEF-OS API] Health endpoint available at http://localhost:${PORT}/api/health`);
  });
}

export default app;
