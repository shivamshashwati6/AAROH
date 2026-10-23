import { Router, Request, Response } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { query } from '../db';
import { requireAuth, requireRole } from '../middleware/auth';
import { UserRole, DepartmentType } from '@relief-os/shared';

export const adminRouter = Router();

// Strict security: enforce authentication and require role 'admin' across all routes
adminRouter.use(requireAuth, requireRole(['admin']));

const updateUserRoleSchema = z.object({
  role: z.enum(['citizen', 'command_center', 'department', 'admin', 'officer', 'coordinator', 'team_lead']),
  department: z.enum(['health', 'supply', 'rescue']).nullable().optional(),
});

const createOperationalUserSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(255),
  email: z.string().trim().toLowerCase().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters in length').max(128),
  role: z.enum(['citizen', 'command_center', 'department', 'admin', 'officer', 'coordinator', 'team_lead']),
  department: z.enum(['health', 'supply', 'rescue']).nullable().optional(),
});

// -----------------------------------------------------------------------------
// GET /api/admin/overview - System overview, report metrics & department summary
// -----------------------------------------------------------------------------
adminRouter.get('/overview', async (_req: Request, res: Response) => {
  try {
    // 1. User metrics
    const usersCountRes = await query<{
      total_users: string;
      citizens: string;
      admins: string;
      command_staff: string;
      department_staff: string;
      health_staff: string;
      supply_staff: string;
      rescue_staff: string;
    }>(`
      SELECT
        count(*)::text as total_users,
        count(*) FILTER (WHERE role = 'citizen')::text as citizens,
        count(*) FILTER (WHERE role = 'admin')::text as admins,
        count(*) FILTER (WHERE role IN ('command_center', 'officer'))::text as command_staff,
        count(*) FILTER (WHERE role IN ('department', 'coordinator', 'team_lead'))::text as department_staff,
        count(*) FILTER (WHERE department = 'health')::text as health_staff,
        count(*) FILTER (WHERE department = 'supply')::text as supply_staff,
        count(*) FILTER (WHERE department = 'rescue')::text as rescue_staff
      FROM users
    `);

    // 2. Report metrics
    const reportsCountRes = await query<{
      total_reports: string;
      pending_ai: string;
      analyzed: string;
      verified: string;
      critical_severity: string;
      high_severity: string;
      medium_severity: string;
      low_severity: string;
      medical_urgency: string;
    }>(`
      SELECT
        count(*)::text as total_reports,
        count(*) FILTER (WHERE status = 'pending_ai')::text as pending_ai,
        count(*) FILTER (WHERE status = 'analyzed')::text as analyzed,
        count(*) FILTER (WHERE status = 'verified')::text as verified,
        count(*) FILTER (WHERE severity = 'critical')::text as critical_severity,
        count(*) FILTER (WHERE severity = 'high')::text as high_severity,
        count(*) FILTER (WHERE severity = 'medium')::text as medium_severity,
        count(*) FILTER (WHERE severity = 'low')::text as low_severity,
        count(*) FILTER (WHERE medical_need = true)::text as medical_urgency
      FROM reports
    `);

    // 3. Health Department Operational Metrics
    const healthMetricsRes = await query<{
      total_medical_teams: string;
      medical_distress_reports: string;
      resource_centers_count: string;
    }>(`
      SELECT
        coalesce(sum(medical_teams_available), 0)::text as total_medical_teams,
        (SELECT count(*)::text FROM reports WHERE medical_need = true OR category ILIKE '%medical%') as medical_distress_reports,
        count(*)::text as resource_centers_count
      FROM resource_centers
    `);

    // 4. Supply Department Operational Metrics
    const supplyMetricsRes = await query<{
      total_food_kits: string;
      total_water_units: string;
      warehouses_count: string;
    }>(`
      SELECT
        coalesce(sum(CASE WHEN resource_type = 'food_kits' THEN quantity ELSE 0 END), 0)::text as total_food_kits,
        coalesce(sum(CASE WHEN resource_type = 'water_units' THEN quantity ELSE 0 END), 0)::text as total_water_units,
        (SELECT count(DISTINCT center_id)::text FROM resources) as warehouses_count
      FROM resources
    `);

    // 5. Rescue Department Operational Metrics
    const rescueMetricsRes = await query<{
      total_fleet: string;
      vehicles_available: string;
      boats_available: string;
      blocked_roads: string;
      partial_roads: string;
      accessible_roads: string;
      rescue_reports: string;
    }>(`
      SELECT
        coalesce(sum(vehicles_available + boats_available), 0)::text as total_fleet,
        coalesce(sum(vehicles_available), 0)::text as vehicles_available,
        coalesce(sum(boats_available), 0)::text as boats_available,
        (SELECT count(*)::text FROM road_segments WHERE status = 'blocked') as blocked_roads,
        (SELECT count(*)::text FROM road_segments WHERE status = 'partial') as partial_roads,
        (SELECT count(*)::text FROM road_segments WHERE status = 'accessible') as accessible_roads,
        (SELECT count(*)::text FROM reports WHERE severity IN ('critical', 'high') OR category ILIKE '%rescue%' OR category ILIKE '%stranded%') as rescue_reports
      FROM resource_centers
    `);

    const u = usersCountRes.rows[0];
    const r = reportsCountRes.rows[0];
    const h = healthMetricsRes.rows[0];
    const s = supplyMetricsRes.rows[0];
    const resOps = rescueMetricsRes.rows[0];

    return res.status(200).json({
      system: {
        active_disaster_scenario: 'Assam Floods 2026',
        database_engine: 'PostgreSQL + PostGIS',
        human_in_the_loop_governance: true,
        autonomous_dispatch_allowed: false,
      },
      users_summary: {
        total: parseInt(u?.total_users || '0', 10),
        citizens: parseInt(u?.citizens || '0', 10),
        admins: parseInt(u?.admins || '0', 10),
        command_staff: parseInt(u?.command_staff || '0', 10),
        department_staff: parseInt(u?.department_staff || '0', 10),
        by_department: {
          health: parseInt(u?.health_staff || '0', 10),
          supply: parseInt(u?.supply_staff || '0', 10),
          rescue: parseInt(u?.rescue_staff || '0', 10),
        },
      },
      reports_summary: {
        total: parseInt(r?.total_reports || '0', 10),
        by_status: {
          pending_ai: parseInt(r?.pending_ai || '0', 10),
          analyzed: parseInt(r?.analyzed || '0', 10),
          verified: parseInt(r?.verified || '0', 10),
        },
        by_severity: {
          critical: parseInt(r?.critical_severity || '0', 10),
          high: parseInt(r?.high_severity || '0', 10),
          medium: parseInt(r?.medium_severity || '0', 10),
          low: parseInt(r?.low_severity || '0', 10),
        },
        medical_urgency_count: parseInt(r?.medical_urgency || '0', 10),
      },
      departments_overview: {
        health: {
          medical_teams_available: parseInt(h?.total_medical_teams || '0', 10),
          medical_distress_reports: parseInt(h?.medical_distress_reports || '0', 10),
          resource_centers_monitored: parseInt(h?.resource_centers_count || '0', 10),
        },
        supply: {
          food_kits_inventory: parseInt(s?.total_food_kits || '0', 10),
          water_units_inventory: parseInt(s?.total_water_units || '0', 10),
          active_warehouses: parseInt(s?.warehouses_count || '0', 10),
        },
        rescue: {
          total_fleet: parseInt(resOps?.total_fleet || '0', 10),
          vehicles_available: parseInt(resOps?.vehicles_available || '0', 10),
          boats_available: parseInt(resOps?.boats_available || '0', 10),
          blocked_roads: parseInt(resOps?.blocked_roads || '0', 10),
          partial_roads: parseInt(resOps?.partial_roads || '0', 10),
          accessible_roads: parseInt(resOps?.accessible_roads || '0', 10),
          rescue_priority_reports: parseInt(resOps?.rescue_reports || '0', 10),
        },
      },
    });
  } catch (err: unknown) {
    console.error('[Admin Overview Error]:', err instanceof Error ? err.message : err);
    return res.status(500).json({ error: 'Failed to generate admin system overview' });
  }
});

// -----------------------------------------------------------------------------
// GET /api/admin/users - User directory with roles & departments (sanitized)
// -----------------------------------------------------------------------------
adminRouter.get('/users', async (_req: Request, res: Response) => {
  try {
    // Strictly omit password_hash from the query
    const usersRes = await query<{
      id: string;
      name: string;
      email: string;
      role: string;
      department: string | null;
      created_at: string;
    }>(`
      SELECT id, name, email, role, department, created_at
      FROM users
      ORDER BY created_at DESC
    `);

    return res.status(200).json({
      items: usersRes.rows,
      total: usersRes.rows.length,
    });
  } catch (err: unknown) {
    console.error('[Admin Users List Error]:', err instanceof Error ? err.message : err);
    return res.status(500).json({ error: 'Failed to retrieve user directory' });
  }
});

// -----------------------------------------------------------------------------
// PATCH /api/admin/users/:id/role - Update user role & department assignment
// -----------------------------------------------------------------------------
adminRouter.patch('/users/:id/role', async (req: Request, res: Response) => {
  const { id } = req.params;
  const parsed = updateUserRoleSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      error: 'Invalid role update payload',
      details: parsed.error.issues,
    });
  }

  const { role, department } = parsed.data;

  // Enforce PostgreSQL schema check constraints:
  // role 'department' requires department in ('health', 'supply', 'rescue')
  // other roles require department = null
  if (role === 'department' && !department) {
    return res.status(400).json({
      error: "Department role requires a valid department assignment ('health', 'supply', or 'rescue').",
    });
  }

  if (role !== 'department' && department) {
    return res.status(400).json({
      error: `Department must be NULL for non-department role '${role}'.`,
    });
  }

  const normalizedDepartment = role === 'department' ? department : null;

  try {
    const existing = await query<{ id: string; email: string; role: string }>(
      'SELECT id, email, role FROM users WHERE id = $1',
      [id]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ error: `User with ID '${id}' not found.` });
    }

    const updateRes = await query<{
      id: string;
      name: string;
      email: string;
      role: string;
      department: string | null;
      created_at: string;
    }>(
      `UPDATE users
       SET role = $1, department = $2
       WHERE id = $3
       RETURNING id, name, email, role, department, created_at`,
      [role, normalizedDepartment, id]
    );

    const updatedUser = updateRes.rows[0];

    // Record action in audit_log
    try {
      await query(
        `INSERT INTO audit_log (user_id, action, details) VALUES ($1, $2, $3)`,
        [
          req.user?.id || null,
          'USER_ROLE_UPDATED',
          JSON.stringify({
            target_user_id: id,
            target_email: updatedUser.email,
            previous_role: existing.rows[0].role,
            new_role: role,
            new_department: normalizedDepartment,
          }),
        ]
      );
    } catch (auditErr) {
      console.warn('[Audit Log Warning]:', auditErr);
    }

    return res.status(200).json({
      message: `User '${updatedUser.email}' role updated to '${role}'.`,
      user: updatedUser,
    });
  } catch (err: unknown) {
    console.error('[Admin Role Update Error]:', err instanceof Error ? err.message : err);
    return res.status(500).json({ error: 'Failed to update user role' });
  }
});

// -----------------------------------------------------------------------------
// POST /api/admin/users - Provision new operational/administrative responder
// -----------------------------------------------------------------------------
adminRouter.post('/users', async (req: Request, res: Response) => {
  const parsed = createOperationalUserSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      error: 'Invalid user provisioning input',
      details: parsed.error.issues,
    });
  }

  const { name, email, password, role, department } = parsed.data;

  if (role === 'department' && !department) {
    return res.status(400).json({
      error: "Department role requires a valid department assignment ('health', 'supply', or 'rescue').",
    });
  }

  if (role !== 'department' && department) {
    return res.status(400).json({
      error: `Department must be NULL for non-department role '${role}'.`,
    });
  }

  const normalizedDepartment = role === 'department' ? department : null;

  try {
    const existing = await query<{ id: string }>('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'A user account with this email address already exists.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const userId = `usr-prov-${crypto.randomUUID()}`;

    const insertRes = await query<{
      id: string;
      name: string;
      email: string;
      role: string;
      department: string | null;
      created_at: string;
    }>(
      `INSERT INTO users (id, name, email, role, department, password_hash)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, name, email, role, department, created_at`,
      [userId, name, email, role, normalizedDepartment, passwordHash]
    );

    const created = insertRes.rows[0];

    // Record in audit_log
    try {
      await query(
        `INSERT INTO audit_log (user_id, action, details) VALUES ($1, $2, $3)`,
        [
          req.user?.id || null,
          'USER_PROVISIONED',
          JSON.stringify({
            created_user_id: created.id,
            email: created.email,
            role: created.role,
            department: created.department,
          }),
        ]
      );
    } catch (auditErr) {
      console.warn('[Audit Log Warning]:', auditErr);
    }

    return res.status(201).json({
      message: 'Operational user provisioned successfully.',
      user: created,
    });
  } catch (err: unknown) {
    console.error('[Admin Provision User Error]:', err instanceof Error ? err.message : err);
    return res.status(500).json({ error: 'Failed to provision user' });
  }
});
