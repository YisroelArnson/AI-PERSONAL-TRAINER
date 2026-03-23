const {
  buildEffectiveSessionContinuityPolicy,
  buildEffectiveSessionResetPolicy
} = require('../../src/runtime/services/session-reset-policy.service');

describe('buildEffectiveSessionResetPolicy', () => {
  it('returns spec defaults when no plan or overrides are present', () => {
    const policy = buildEffectiveSessionResetPolicy({});

    expect(policy).toEqual({
      planTier: 'standard',
      timezone: 'UTC',
      dayBoundaryEnabled: true,
      idleExpiryMinutes: 240
    });
  });

  it('applies camelCase user overrides from policy_overrides_json', () => {
    const policy = buildEffectiveSessionResetPolicy({
      planTier: 'standard',
      timezone: 'America/New_York',
      policyOverrides: {
        sessionReset: {
          dayBoundaryEnabled: false,
          idleExpiryMinutes: 45
        }
      }
    });

    expect(policy).toEqual({
      planTier: 'standard',
      timezone: 'America/New_York',
      dayBoundaryEnabled: false,
      idleExpiryMinutes: 45
    });
  });

  it('supports snake_case overrides and falls back invalid timezones to UTC', () => {
    const policy = buildEffectiveSessionResetPolicy({
      planTier: 'premium_hybrid',
      timezone: 'Mars/Olympus_Mons',
      policyOverrides: {
        session_reset: {
          day_boundary_enabled: 'true',
          idle_expiry_minutes: '0'
        }
      }
    });

    expect(policy).toEqual({
      planTier: 'premium_hybrid',
      timezone: 'UTC',
      dayBoundaryEnabled: true,
      idleExpiryMinutes: 0
    });
  });

  it('resolves session-memory and episodic bootstrap defaults and overrides', () => {
    const policy = buildEffectiveSessionContinuityPolicy({
      planTier: 'standard',
      timezone: 'America/New_York',
      policyOverrides: {
        sessionMemory: {
          enabled: 'true',
          messageCount: 22
        },
        episodicNotes: {
          readStrategy: 'custom_window_days',
          customWindowDays: 5
        }
      }
    });

    expect(policy).toEqual({
      planTier: 'standard',
      timezone: 'America/New_York',
      dayBoundaryEnabled: true,
      idleExpiryMinutes: 240,
      sessionMemoryEnabled: true,
      sessionMemoryMessageCount: 22,
      episodicReadStrategy: 'custom_window_days',
      episodicCustomWindowDays: 5
    });
  });
});
