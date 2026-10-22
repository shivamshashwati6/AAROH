import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateZoneDemand,
  validateZoneDemandInput,
  DemandValidationError,
  DEFAULT_DEMAND_CONFIG,
  ZoneDemandInput,
} from '../src/services/demand';

describe('RELIEF-OS Deterministic Demand Estimation Service', () => {
  // Canonical Zone A input based on Assam flood demo seed data
  const canonicalZoneAInput: ZoneDemandInput = {
    zone_id: 'zone-a',
    zone_name: 'Zone A (Barpeta Central / Jania)',
    affected_population: 3842,
    total_population: 12500,
    severity: 'critical',
    medical_risk: 'high',
    accessibility: 0.25, // Route A blocked, severely cut off
    vulnerability: 0.88,
    priority_score: 94,
    band: 'Critical',
    food_shortage_pct: 72,
    water_shortage_pct: 61,
    is_simulated: true,
  };

  // ---------------------------------------------------------------------------
  // 1. Determinism
  // ---------------------------------------------------------------------------
  describe('Determinism', () => {
    it('should produce strictly identical outputs for identical inputs and assumptions', () => {
      const run1 = calculateZoneDemand(canonicalZoneAInput);
      const run2 = calculateZoneDemand(canonicalZoneAInput);

      // Compare all calculated fields except timestamp
      assert.equal(run1.zone_id, run2.zone_id);
      assert.equal(run1.affected_population, run2.affected_population);
      assert.deepEqual(run1.demands.food_kits, run2.demands.food_kits);
      assert.deepEqual(run1.demands.water_units, run2.demands.water_units);
      assert.deepEqual(run1.demands.boats, run2.demands.boats);
      assert.deepEqual(run1.demands.medical_teams, run2.demands.medical_teams);
      assert.equal(run1.summary_explanation, run2.summary_explanation);
      assert.equal(run1.is_simulated, run2.is_simulated);
    });

    it('should produce identical outputs when called repeatedly with custom configurations', () => {
      const customConfig = {
        planning_days: 5,
        food_kits_per_person_ratio: 0.5,
        water_units_per_person_ratio: 0.4,
        stranded_people_per_boat: 500,
        people_per_medical_team: 2000,
      };

      const resultA = calculateZoneDemand(canonicalZoneAInput, customConfig);
      const resultB = calculateZoneDemand(canonicalZoneAInput, customConfig);

      assert.deepEqual(resultA.demands, resultB.demands);
      assert.equal(resultA.planning_horizon_days, 5);
      assert.equal(resultB.planning_horizon_days, 5);
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Zone A Canonical Target Quantities
  // ---------------------------------------------------------------------------
  describe('Zone A Canonical Calculation', () => {
    it('should produce exact canonical quantities for Zone A', () => {
      const result = calculateZoneDemand(canonicalZoneAInput);

      // Food Kits: round(3842 * 0.72 * 0.4338) = round(1200.007) = 1200
      assert.equal(result.demands.food_kits.quantity, 1200);
      assert.equal(result.demands.food_kits.unit, 'kits');
      assert.equal(result.demands.food_kits.is_assumed_param, true);
      assert.match(result.demands.food_kits.explanation, /1,200 kits/);

      // Water Units: round(3842 * 0.61 * 0.3414) = round(800.09) = 800
      assert.equal(result.demands.water_units.quantity, 800);
      assert.equal(result.demands.water_units.unit, 'units');
      assert.equal(result.demands.water_units.is_assumed_param, true);
      assert.match(result.demands.water_units.explanation, /800 units/);

      // Rescue Boats: Stranded = 3842 * (1 - 0.25) = 2881.5; round(2881.5 / 720) = round(4.002) = 4
      assert.equal(result.demands.boats.quantity, 4);
      assert.equal(result.demands.boats.unit, 'boats');
      assert.equal(result.demands.boats.is_assumed_param, true);
      assert.match(result.demands.boats.explanation, /4 deployable rescue boats/);

      // Medical Teams: round(3842 / 3500) = round(1.097) = 1 team
      assert.equal(result.demands.medical_teams.quantity, 1);
      assert.equal(result.demands.medical_teams.unit, 'teams');
      assert.equal(result.demands.medical_teams.is_assumed_param, true);
      assert.match(result.demands.medical_teams.explanation, /1 certified medical response unit/);

      // Simulation indicator preserved
      assert.equal(result.is_simulated, true);
      assert.equal(result.planning_horizon_days, 3);
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Rounding and Boundary Cases
  // ---------------------------------------------------------------------------
  describe('Rounding and Boundary Cases', () => {
    it('should return 0 demand across all categories when affected population is 0', () => {
      const zeroInput: ZoneDemandInput = {
        ...canonicalZoneAInput,
        affected_population: 0,
      };

      const result = calculateZoneDemand(zeroInput);

      assert.equal(result.demands.food_kits.quantity, 0);
      assert.equal(result.demands.water_units.quantity, 0);
      assert.equal(result.demands.boats.quantity, 0);
      assert.equal(result.demands.medical_teams.quantity, 0);
      assert.match(result.summary_explanation, /zero affected population/i);
    });

    it('should round half-up deterministically for fractional demands', () => {
      // 100 people * 0.5 food shortage * 0.4338 = 21.69 -> rounds to 22
      const inputA: ZoneDemandInput = {
        zone_id: 'zone-test-round',
        zone_name: 'Test Rounding Up',
        affected_population: 100,
        severity: 'high',
        medical_risk: 'low',
        accessibility: 0.9,
        vulnerability: 0.5,
        food_shortage_pct: 50,
      };
      const resultA = calculateZoneDemand(inputA);
      assert.equal(resultA.demands.food_kits.quantity, 22);

      // 10 people * 0.1 food shortage * 0.4338 = 0.4338 -> rounds to 0
      const inputB: ZoneDemandInput = {
        ...inputA,
        affected_population: 10,
        food_shortage_pct: 10,
      };
      const resultB = calculateZoneDemand(inputB);
      assert.equal(resultB.demands.food_kits.quantity, 0);
    });

    it('should require 0 rescue boats when accessibility is high (>= 0.85)', () => {
      const accessibleInput: ZoneDemandInput = {
        ...canonicalZoneAInput,
        accessibility: 0.95, // Fully connected roads
      };

      const result = calculateZoneDemand(accessibleInput);
      assert.equal(result.demands.boats.quantity, 0);
      assert.match(result.demands.boats.explanation, /sufficient for land-based transport/i);
    });

    it('should require 0 rescue boats when severity is low or medium even if accessibility is low', () => {
      const mediumSeverityInput: ZoneDemandInput = {
        ...canonicalZoneAInput,
        severity: 'medium',
        accessibility: 0.3,
      };

      const result = calculateZoneDemand(mediumSeverityInput);
      assert.equal(result.demands.boats.quantity, 0);
    });

    it('should require 0 emergency medical teams for low medical risk', () => {
      const lowMedicalInput: ZoneDemandInput = {
        ...canonicalZoneAInput,
        medical_risk: 'low',
      };

      const result = calculateZoneDemand(lowMedicalInput);
      assert.equal(result.demands.medical_teams.quantity, 0);
      assert.match(result.demands.medical_teams.explanation, /No specialized emergency medical team required/i);
    });

    it('should scale medical teams appropriately for large affected populations under critical risk', () => {
      const largePopInput: ZoneDemandInput = {
        ...canonicalZoneAInput,
        affected_population: 10500, // 10,500 / 3,500 = 3 teams
        medical_risk: 'critical',
      };

      const result = calculateZoneDemand(largePopInput);
      assert.equal(result.demands.medical_teams.quantity, 3);
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Input Validation & Error Handling
  // ---------------------------------------------------------------------------
  describe('Input Validation', () => {
    it('should throw DemandValidationError for negative affected population', () => {
      assert.throws(
        () => {
          validateZoneDemandInput({
            ...canonicalZoneAInput,
            affected_population: -100,
          });
        },
        (err: unknown) => {
          assert.ok(err instanceof DemandValidationError);
          assert.equal(err.field, 'affected_population');
          return true;
        }
      );
    });

    it('should throw DemandValidationError for non-integer affected population', () => {
      assert.throws(
        () => {
          validateZoneDemandInput({
            ...canonicalZoneAInput,
            affected_population: 100.5,
          });
        },
        (err: unknown) => {
          assert.ok(err instanceof DemandValidationError);
          assert.equal(err.field, 'affected_population');
          return true;
        }
      );
    });

    it('should throw DemandValidationError if total_population is less than affected_population', () => {
      assert.throws(
        () => {
          validateZoneDemandInput({
            ...canonicalZoneAInput,
            affected_population: 5000,
            total_population: 2000,
          });
        },
        (err: unknown) => {
          assert.ok(err instanceof DemandValidationError);
          assert.equal(err.field, 'total_population');
          return true;
        }
      );
    });

    it('should throw DemandValidationError for invalid severity enum', () => {
      assert.throws(
        () => {
          validateZoneDemandInput({
            ...canonicalZoneAInput,
            severity: 'catastrophic' as any,
          });
        },
        (err: unknown) => {
          assert.ok(err instanceof DemandValidationError);
          assert.equal(err.field, 'severity');
          return true;
        }
      );
    });

    it('should throw DemandValidationError for out-of-bounds accessibility', () => {
      assert.throws(
        () => {
          validateZoneDemandInput({
            ...canonicalZoneAInput,
            accessibility: 1.5,
          });
        },
        (err: unknown) => {
          assert.ok(err instanceof DemandValidationError);
          assert.equal(err.field, 'accessibility');
          return true;
        }
      );

      assert.throws(
        () => {
          validateZoneDemandInput({
            ...canonicalZoneAInput,
            accessibility: -0.1,
          });
        },
        (err: unknown) => {
          assert.ok(err instanceof DemandValidationError);
          assert.equal(err.field, 'accessibility');
          return true;
        }
      );
    });

    it('should throw DemandValidationError for out-of-bounds food_shortage_pct', () => {
      assert.throws(
        () => {
          validateZoneDemandInput({
            ...canonicalZoneAInput,
            food_shortage_pct: 120,
          });
        },
        (err: unknown) => {
          assert.ok(err instanceof DemandValidationError);
          assert.equal(err.field, 'food_shortage_pct');
          return true;
        }
      );
    });

    it('should throw DemandValidationError when planning horizon is less than 1 day', () => {
      assert.throws(
        () => {
          calculateZoneDemand(canonicalZoneAInput, { planning_days: 0 });
        },
        (err: unknown) => {
          assert.ok(err instanceof DemandValidationError);
          assert.equal(err.field, 'planning_days');
          return true;
        }
      );
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Monotonicity & Population Sensitivity
  // ---------------------------------------------------------------------------
  describe('Population & Shortage Sensitivity', () => {
    it('should produce strictly higher food demand when population increases with fixed shortage', () => {
      const lowerPop = calculateZoneDemand({
        ...canonicalZoneAInput,
        affected_population: 2000,
      });

      const higherPop = calculateZoneDemand({
        ...canonicalZoneAInput,
        affected_population: 5000,
      });

      assert.ok(higherPop.demands.food_kits.quantity > lowerPop.demands.food_kits.quantity);
      assert.ok(higherPop.demands.water_units.quantity > lowerPop.demands.water_units.quantity);
    });

    it('should produce higher water demand when water deficit percentage increases with fixed population', () => {
      const lowerDeficit = calculateZoneDemand({
        ...canonicalZoneAInput,
        water_shortage_pct: 20,
      });

      const higherDeficit = calculateZoneDemand({
        ...canonicalZoneAInput,
        water_shortage_pct: 80,
      });

      assert.ok(higherDeficit.demands.water_units.quantity > lowerDeficit.demands.water_units.quantity);
    });
  });

  // ---------------------------------------------------------------------------
  // 6. Planning Horizon Duration Scaling (1, 3, 7 days)
  // ---------------------------------------------------------------------------
  describe('Planning Horizon Duration Scaling', () => {
    it('should scale consumable supplies logically across 1, 3, and 7 planning days', () => {
      const demand1Day = calculateZoneDemand(canonicalZoneAInput, { planning_days: 1 });
      const demand3Day = calculateZoneDemand(canonicalZoneAInput, { planning_days: 3 });
      const demand7Day = calculateZoneDemand(canonicalZoneAInput, { planning_days: 7 });

      // Default 3-day scenario preserves canonical Zone A values
      assert.equal(demand3Day.demands.food_kits.quantity, 1200);
      assert.equal(demand3Day.demands.water_units.quantity, 800);

      // 1-day scenario scales to 1/3
      // Food: round(1200 * 1/3) = 400 kits
      // Water: round(800 * 1/3) = 267 units
      assert.equal(demand1Day.demands.food_kits.quantity, 400);
      assert.equal(demand1Day.demands.water_units.quantity, 267);

      // 7-day scenario scales to 7/3
      // Food: round(1200 * 7/3) = 2800 kits
      // Water: round(800 * 7/3) = 1867 units
      assert.equal(demand7Day.demands.food_kits.quantity, 2800);
      assert.equal(demand7Day.demands.water_units.quantity, 1867);

      // Monotonic scaling
      assert.ok(demand7Day.demands.food_kits.quantity > demand3Day.demands.food_kits.quantity);
      assert.ok(demand3Day.demands.food_kits.quantity > demand1Day.demands.food_kits.quantity);

      // Capital assets (boats) and response units (medical teams) represent standing deployment capacity
      // and remain invariant across planning horizon days
      assert.equal(demand1Day.demands.boats.quantity, 4);
      assert.equal(demand3Day.demands.boats.quantity, 4);
      assert.equal(demand7Day.demands.boats.quantity, 4);

      assert.equal(demand1Day.demands.medical_teams.quantity, 1);
      assert.equal(demand3Day.demands.medical_teams.quantity, 1);
      assert.equal(demand7Day.demands.medical_teams.quantity, 1);
    });
  });

  // ---------------------------------------------------------------------------
  // 7. Medical Team Rounding and Boundary Cases (3500 vs 3501)
  // ---------------------------------------------------------------------------
  describe('Medical Team Rounding and Boundary Cases', () => {
    const baseMedicalInput: ZoneDemandInput = {
      zone_id: 'zone-med-test',
      zone_name: 'Medical Test Zone',
      affected_population: 3500,
      severity: 'critical',
      medical_risk: 'critical',
      accessibility: 0.5,
      vulnerability: 0.5,
    };

    it('should evaluate exactly 1 team at 3,500 people under both round and ceil modes', () => {
      const at3500Round = calculateZoneDemand(
        { ...baseMedicalInput, affected_population: 3500 },
        { medical_rounding_mode: 'round' }
      );
      assert.equal(at3500Round.demands.medical_teams.quantity, 1);

      const at3500Ceil = calculateZoneDemand(
        { ...baseMedicalInput, affected_population: 3500 },
        { medical_rounding_mode: 'ceil' }
      );
      assert.equal(at3500Ceil.demands.medical_teams.quantity, 1);
    });

    it('should document and evaluate behavior at 3,501 people under round vs ceil rules', () => {
      // Under default 'round' mode (nearest-load factor): 3501 / 3500 = 1.00028 -> rounds to 1 team
      const at3501Round = calculateZoneDemand(
        { ...baseMedicalInput, affected_population: 3501 },
        { medical_rounding_mode: 'round' }
      );
      assert.equal(at3501Round.demands.medical_teams.quantity, 1);
      assert.match(at3501Round.demands.medical_teams.explanation, /nearest-load rounding rule/);

      // Under 'ceil' mode (strict ceiling capacity rule): 3501 / 3500 = 1.00028 -> ceils to 2 teams
      const at3501Ceil = calculateZoneDemand(
        { ...baseMedicalInput, affected_population: 3501 },
        { medical_rounding_mode: 'ceil' }
      );
      assert.equal(at3501Ceil.demands.medical_teams.quantity, 2);
      assert.match(at3501Ceil.demands.medical_teams.explanation, /ceiling capacity rule/);
    });

    it('should demonstrate why round mode preserves PRD canonical Zone A output (3,842 people -> 1 team)', () => {
      // Zone A (3,842 people): 3842 / 3500 = 1.097
      const zoneARound = calculateZoneDemand(canonicalZoneAInput, { medical_rounding_mode: 'round' });
      assert.equal(zoneARound.demands.medical_teams.quantity, 1);

      // Note: If ceil mode were used on Zone A, it would evaluate to 2 teams, conflicting with PRD canonical 1 team
      const zoneACeil = calculateZoneDemand(canonicalZoneAInput, { medical_rounding_mode: 'ceil' });
      assert.equal(zoneACeil.demands.medical_teams.quantity, 2);
    });

    it('should trigger second team under round mode when population reaches 1.5x threshold (5,250 people)', () => {
      // 5249 / 3500 = 1.4997 -> rounds to 1 team
      const justUnder = calculateZoneDemand(
        { ...baseMedicalInput, affected_population: 5249 },
        { medical_rounding_mode: 'round' }
      );
      assert.equal(justUnder.demands.medical_teams.quantity, 1);

      // 5250 / 3500 = 1.5000 -> rounds half-up to 2 teams
      const atThreshold = calculateZoneDemand(
        { ...baseMedicalInput, affected_population: 5250 },
        { medical_rounding_mode: 'round' }
      );
      assert.equal(atThreshold.demands.medical_teams.quantity, 2);
    });

    it('should guarantee a minimum of 1 medical team for any positive population under critical/high risk', () => {
      const minimalPop = calculateZoneDemand({
        ...baseMedicalInput,
        affected_population: 1,
      });
      assert.equal(minimalPop.demands.medical_teams.quantity, 1);
    });
  });

  // ---------------------------------------------------------------------------
  // 8. Demo Assumption Transparency & Verification
  // ---------------------------------------------------------------------------
  describe('Assumption Documentation & Explanations', () => {
    it('should label all calculated resources as configurable demo assumptions and not official standards', () => {
      const result = calculateZoneDemand(canonicalZoneAInput);

      assert.equal(result.demands.food_kits.is_assumed_param, true);
      assert.equal(result.demands.water_units.is_assumed_param, true);
      assert.equal(result.demands.boats.is_assumed_param, true);
      assert.equal(result.demands.medical_teams.is_assumed_param, true);

      // Verify no misleading claims of "established disaster standard" or "official standard"
      assert.doesNotMatch(result.demands.food_kits.explanation, /official standard|established disaster/i);
      assert.doesNotMatch(result.demands.water_units.explanation, /official standard|established disaster/i);
      assert.doesNotMatch(result.demands.boats.explanation, /official standard|established disaster/i);
      assert.doesNotMatch(result.demands.medical_teams.explanation, /official standard|established disaster/i);

      // Explicitly labels demo assumption
      assert.match(result.demands.food_kits.explanation, /demo assumption/i);
      assert.match(result.demands.water_units.explanation, /demo assumption/i);
      assert.match(result.demands.boats.explanation, /demo parameter/i);
      assert.match(result.demands.medical_teams.explanation, /demo planning assumption/i);
    });
  });
});
