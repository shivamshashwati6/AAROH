import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { query } from '../db';
import { requireAuth, requireRole, optionalAuth } from '../middleware/auth';
import { rateLimiter } from '../middleware/rate-limit';

export const reportRouter = Router();

// Roles permitted to view sensitive citizen contact details
export const OPERATIONAL_ROLES = ['command_center', 'department', 'admin', 'officer', 'coordinator', 'team_lead'];

/**
 * Redacts citizen contact information for public, anonymous, or unauthenticated citizen callers.
 * Only authenticated operational responders (Health, Supply, Rescue, Command Center, Admin) receive plaintext contact numbers.
 */
export function redactContactNumber(
  contactNumber: string | null | undefined,
  user?: { role?: string } | null
): string | null {
  const isOperational = user?.role ? OPERATIONAL_ROLES.includes(user.role) : false;
  return isOperational ? (contactNumber || null) : null;
}

const listReportsQuerySchema = z.object({
  disaster_id: z.string().optional(),
  status: z.enum(['pending_ai', 'analyzed', 'verified']).optional(),
  severity: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  category: z.string().optional(),
  medical_need: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
  is_simulated: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const createReportBodySchema = z.object({
  description: z.string().trim().min(3).max(2000),
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  location_name: z.string().max(255).optional(),
  disaster_id: z.string().default('disaster-assam-2026'),
  severity: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  category: z.string().max(100).default('general_distress'),
  people_affected: z.coerce.number().int().min(0).optional(),
  medical_need: z.boolean().default(false),
  contact_number: z.string().max(50).optional(),
  is_simulated: z.boolean().default(true),
});

const bulkReportsBodySchema = z.object({
  reports: z.array(createReportBodySchema).min(1).max(500),
});

// -----------------------------------------------------------------------------
// GET /api/reports - List citizen reports with filtering & PostGIS coordinates
// -----------------------------------------------------------------------------
reportRouter.get('/', optionalAuth, async (req: Request, res: Response) => {
  const parsed = listReportsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Invalid query parameters',
      details: parsed.error.issues,
    });
  }

  const { disaster_id, status, severity, category, medical_need, is_simulated, limit, offset } = parsed.data;
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (disaster_id) {
    params.push(disaster_id);
    conditions.push(`disaster_id = $${params.length}`);
  }
  if (status) {
    params.push(status);
    conditions.push(`status = $${params.length}`);
  }
  if (severity) {
    params.push(severity);
    conditions.push(`severity = $${params.length}`);
  }
  if (category) {
    params.push(category);
    conditions.push(`category = $${params.length}`);
  }
  if (medical_need !== undefined) {
    params.push(medical_need);
    conditions.push(`medical_need = $${params.length}`);
  }
  if (is_simulated !== undefined) {
    params.push(is_simulated);
    conditions.push(`is_simulated = $${params.length}`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  try {
    const countRes = await query<{ count: string }>(
      `SELECT count(*) as count FROM reports ${whereClause}`,
      params
    );
    const total = parseInt(countRes.rows[0]?.count || '0', 10);

    params.push(limit);
    const limitIdx = params.length;
    params.push(offset);
    const offsetIdx = params.length;

    const dataRes = await query(
      `SELECT 
        id, 
        disaster_id, 
        user_id, 
        ST_Y(location::geometry) as lat, 
        ST_X(location::geometry) as lng, 
        location_name, 
        description, 
        disaster_type, 
        severity, 
        category, 
        people_affected, 
        medical_need, 
        confidence::float as confidence, 
        is_simulated, 
        status, 
        contact_number, 
        created_at 
      FROM reports 
      ${whereClause} 
      ORDER BY created_at DESC 
      LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      params
    );

    const items = dataRes.rows.map((r) => ({
      id: r.id,
      disaster_id: r.disaster_id,
      user_id: r.user_id,
      location_lat: parseFloat(r.lat),
      location_lng: parseFloat(r.lng),
      location_name: r.location_name,
      description: r.description,
      disaster_type: r.disaster_type,
      severity: r.severity,
      category: r.category,
      people_affected: r.people_affected,
      medical_need: r.medical_need,
      confidence: r.confidence,
      is_simulated: r.is_simulated,
      status: r.status,
      contact_number: redactContactNumber(r.contact_number, req.user),
      created_at: r.created_at,
    }));

    return res.status(200).json({
      items,
      total,
      limit,
      offset,
    });
  } catch (err: unknown) {
    console.error('[API Reports List Error]:', err instanceof Error ? err.message : err);
    return res.status(500).json({ error: 'Failed to retrieve reports from database' });
  }
});

// -----------------------------------------------------------------------------
// POST /api/reports - Ingest a new Citizen Distress Report (Publicly accessible)
// -----------------------------------------------------------------------------
reportRouter.post('/', rateLimiter(60000, 30), optionalAuth, async (req: Request, res: Response) => {
  const parsed = createReportBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Invalid report payload',
      details: parsed.error.issues,
    });
  }

  const {
    description,
    lat,
    lng,
    location_name,
    disaster_id,
    severity,
    category,
    people_affected,
    medical_need,
    contact_number,
    is_simulated,
  } = parsed.data;

  const id = `rep-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const userId = req.user?.id || null;

  try {
    const insertRes = await query(
      `INSERT INTO reports (
        id, 
        disaster_id, 
        user_id,
        location, 
        location_name, 
        description, 
        severity, 
        category, 
        people_affected, 
        medical_need, 
        confidence, 
        is_simulated, 
        status, 
        contact_number
      ) VALUES (
        $1, 
        $2, 
        $3,
        ST_SetSRID(ST_MakePoint($4, $5), 4326), 
        $6, 
        $7, 
        $8, 
        $9, 
        $10, 
        $11, 
        1.00, 
        $12, 
        'pending_ai', 
        $13
      ) 
      RETURNING 
        id, 
        disaster_id, 
        user_id,
        ST_Y(location::geometry) as lat, 
        ST_X(location::geometry) as lng, 
        location_name, 
        description, 
        severity, 
        category, 
        people_affected, 
        medical_need, 
        confidence::float as confidence, 
        is_simulated, 
        status, 
        contact_number, 
        created_at`,
      [
        id,
        disaster_id,
        userId,
        lng,
        lat,
        location_name || null,
        description,
        severity,
        category,
        people_affected || null,
        medical_need,
        is_simulated,
        contact_number || null,
      ]
    );

    const created = insertRes.rows[0];
    return res.status(201).json({
      id: created.id,
      disaster_id: created.disaster_id,
      user_id: created.user_id,
      location_lat: parseFloat(created.lat),
      location_lng: parseFloat(created.lng),
      location_name: created.location_name,
      description: created.description,
      severity: created.severity,
      category: created.category,
      people_affected: created.people_affected,
      medical_need: created.medical_need,
      confidence: created.confidence,
      is_simulated: created.is_simulated,
      status: created.status,
      contact_number: created.contact_number || null,
      created_at: created.created_at,
    });
  } catch (err: unknown) {
    console.error('[API Report Ingestion Error]:', err instanceof Error ? err.message : err);
    return res.status(500).json({ error: 'Failed to save citizen report to database' });
  }
});

// -----------------------------------------------------------------------------
// POST /api/reports/bulk - Bulk Ingest Simulated Citizen Reports (Protected)
// -----------------------------------------------------------------------------
reportRouter.post(
  '/bulk',
  requireAuth,
  requireRole(['command_center', 'officer', 'admin']),
  async (req: Request, res: Response) => {
    const parsed = bulkReportsBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid bulk report payload',
        details: parsed.error.issues,
      });
    }

    const { reports } = parsed.data;
    const insertedIds: string[] = [];

    try {
      for (const r of reports) {
        const id = `rep-bulk-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        await query(
          `INSERT INTO reports (
            id, disaster_id, user_id, location, location_name, description, severity, category, people_affected, medical_need, confidence, is_simulated, status, contact_number
          ) VALUES (
            $1, $2, $3, ST_SetSRID(ST_MakePoint($4, $5), 4326), $6, $7, $8, $9, $10, $11, 1.00, $12, 'pending_ai', $13
          )`,
          [
            id,
            r.disaster_id,
            req.user?.id || null,
            r.lng,
            r.lat,
            r.location_name || null,
            r.description,
            r.severity,
            r.category,
            r.people_affected || null,
            r.medical_need,
            r.is_simulated,
            r.contact_number || null,
          ]
        );
        insertedIds.push(id);
      }

      // Record in audit log without sensitive personal data
      try {
        await query(
          `INSERT INTO audit_log (user_id, action, details) VALUES ($1, $2, $3)`,
          [
            req.user?.id || null,
            'REPORTS_BULK_INGESTED',
            JSON.stringify({
              count: insertedIds.length,
              disaster_id: reports[0]?.disaster_id,
              actor_role: req.user?.role,
            }),
          ]
        );
      } catch (auditErr) {
        console.warn('[Audit Log Warning]: Could not record bulk reports ingestion:', auditErr);
      }

      return res.status(201).json({
        success: true,
        inserted_count: insertedIds.length,
        report_ids: insertedIds,
      });
    } catch (err: unknown) {
      console.error('[API Bulk Report Error]:', err instanceof Error ? err.message : err);
      return res.status(500).json({ error: 'Failed to bulk insert reports' });
    }
  }
);

// -----------------------------------------------------------------------------
// GET /api/reports/:id - Single Report Detail
// -----------------------------------------------------------------------------
reportRouter.get('/:id', optionalAuth, async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    const resDb = await query(
      `SELECT 
        id, 
        disaster_id, 
        user_id, 
        ST_Y(location::geometry) as lat, 
        ST_X(location::geometry) as lng, 
        location_name, 
        description, 
        disaster_type, 
        severity, 
        category, 
        people_affected, 
        medical_need, 
        confidence::float as confidence, 
        is_simulated, 
        status, 
        contact_number, 
        created_at 
      FROM reports 
      WHERE id = $1`,
      [id]
    );

    if (resDb.rows.length === 0) {
      return res.status(404).json({ error: `Report with ID '${id}' not found` });
    }

    const r = resDb.rows[0];

    return res.status(200).json({
      id: r.id,
      disaster_id: r.disaster_id,
      user_id: r.user_id,
      location_lat: parseFloat(r.lat),
      location_lng: parseFloat(r.lng),
      location_name: r.location_name,
      description: r.description,
      disaster_type: r.disaster_type,
      severity: r.severity,
      category: r.category,
      people_affected: r.people_affected,
      medical_need: r.medical_need,
      confidence: r.confidence,
      is_simulated: r.is_simulated,
      status: r.status,
      contact_number: redactContactNumber(r.contact_number, req.user),
      created_at: r.created_at,
    });
  } catch (err: unknown) {
    console.error(`[API Report Get Error ${id}]:`, err instanceof Error ? err.message : err);
    return res.status(500).json({ error: 'Failed to retrieve report from database' });
  }
});

