/**
 * File overview:
 * Contains automated tests for the llm config service behavior.
 *
 * Main functions in this file:
 * - createUserPlanSettingsQuery: Creates an User plan settings query used by this file.
 * - createUpsertQuery: Creates an Upsert query used by this file.
 */

const mockGetSupabaseAdminClient = jest.fn();

jest.mock('../../src/config/env', () => ({
  env: {
    defaultLlmProvider: 'anthropic',
    defaultAnthropicModel: 'claude-sonnet-4-6',
    defaultXaiModel: 'grok-4.20-reasoning'
  }
}));

jest.mock('../../src/infra/supabase/client', () => ({
  getSupabaseAdminClient: mockGetSupabaseAdminClient
}));

const {
  buildPolicyOverridesWithUserDefaultLlm,
  getGlobalDefaultLlmSelection,
  resolveEffectiveLlmSelection,
  resolveEffectiveLlmSelectionForRun,
  updateUserDefaultLlmSelection
} = require('../../src/runtime/services/llm-config.service');

/**
 * Creates an User plan settings query used by this file.
 */
function createUserPlanSettingsQuery(result) {
  const builder = {
    select: jest.fn(() => builder),
    eq: jest.fn(() => builder),
    maybeSingle: jest.fn().mockResolvedValue(result)
  };

  return builder;
}

/**
 * Creates an Upsert query used by this file.
 */
function createUpsertQuery(result) {
  const builder = {
    upsert: jest.fn(() => builder),
    select: jest.fn(() => builder),
    single: jest.fn().mockResolvedValue(result)
  };

  return builder;
}

describe('llm-config.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('prefers the explicit request llm over inherited, user default, and global defaults', async () => {
    const selection = await resolveEffectiveLlmSelection({
      userId: 'user-123',
      requestedLlm: {
        provider: 'xai',
        model: 'grok-4'
      },
      inheritedLlm: {
        provider: 'anthropic',
        model: 'claude-haiku-4-5-20251001'
      },
      userDefaultLlm: {
        provider: 'anthropic',
        model: 'claude-opus-4-6'
      }
    });

    expect(selection).toEqual({
      provider: 'xai',
      model: 'grok-4'
    });
  });

  it('prefers the inherited llm when no explicit request override is present', async () => {
    const selection = await resolveEffectiveLlmSelection({
      userId: 'user-123',
      inheritedLlm: {
        provider: 'xai',
        model: 'grok-4-fast'
      },
      userDefaultLlm: {
        provider: 'anthropic',
        model: 'claude-opus-4-6'
      }
    });

    expect(selection).toEqual({
      provider: 'xai',
      model: 'grok-4-fast'
    });
  });

  it('resolves provider-only overrides from the same-provider user default model', async () => {
    const selection = await resolveEffectiveLlmSelection({
      userId: 'user-123',
      requestedLlm: {
        provider: 'xai'
      },
      userDefaultLlm: {
        provider: 'xai',
        model: 'grok-4-custom'
      }
    });

    expect(selection).toEqual({
      provider: 'xai',
      model: 'grok-4-custom'
    });
  });

  it('falls back to the global provider default model when provider-only override has no matching user default', async () => {
    const selection = await resolveEffectiveLlmSelection({
      userId: 'user-123',
      requestedLlm: {
        provider: 'xai'
      },
      userDefaultLlm: {
        provider: 'anthropic',
        model: 'claude-opus-4-6'
      }
    });

    expect(selection).toEqual({
      provider: 'xai',
      model: 'grok-4.20-reasoning'
    });
  });

  it('returns the stored run llm when present and otherwise falls back to the global default', () => {
    expect(resolveEffectiveLlmSelectionForRun({
      trigger_payload: {
        metadata: {
          llm: {
            provider: 'xai',
            model: 'grok-4'
          }
        }
      }
    })).toEqual({
      provider: 'xai',
      model: 'grok-4'
    });

    expect(resolveEffectiveLlmSelectionForRun({
      trigger_payload: {
        metadata: {}
      }
    })).toEqual(getGlobalDefaultLlmSelection());
  });

  it('merges user default llm settings without clobbering unrelated policy overrides and clears them cleanly', () => {
    const baseOverrides = {
      sessionReset: {
        idleExpiryMinutes: 45
      },
      llm: {
        default: {
          provider: 'anthropic',
          model: 'claude-haiku-4-5-20251001'
        },
        auditMode: true
      }
    };

    expect(buildPolicyOverridesWithUserDefaultLlm(baseOverrides, {
      provider: 'xai'
    })).toEqual({
      sessionReset: {
        idleExpiryMinutes: 45
      },
      llm: {
        auditMode: true,
        default: {
          provider: 'xai',
          model: null
        }
      }
    });

    expect(buildPolicyOverridesWithUserDefaultLlm(baseOverrides, null)).toEqual({
      sessionReset: {
        idleExpiryMinutes: 45
      },
      llm: {
        auditMode: true
      }
    });
  });

  it('upserts merged policy overrides and returns both stored and effective defaults', async () => {
    const settingsQuery = createUserPlanSettingsQuery({
      data: {
        user_id: 'user-123',
        policy_overrides_json: {
          sessionReset: {
            idleExpiryMinutes: 45
          }
        }
      },
      error: null
    });
    const upsertQuery = createUpsertQuery({
      data: {
        user_id: 'user-123',
        policy_overrides_json: {
          sessionReset: {
            idleExpiryMinutes: 45
          },
          llm: {
            default: {
              provider: 'xai',
              model: null
            }
          }
        }
      },
      error: null
    });
    const from = jest.fn()
      .mockReturnValueOnce(settingsQuery)
      .mockReturnValueOnce(upsertQuery);

    mockGetSupabaseAdminClient.mockReturnValue({
      from
    });

    const result = await updateUserDefaultLlmSelection('user-123', {
      provider: 'xai'
    });

    expect(upsertQuery.upsert).toHaveBeenCalledWith({
      user_id: 'user-123',
      policy_overrides_json: {
        sessionReset: {
          idleExpiryMinutes: 45
        },
        llm: {
          default: {
            provider: 'xai',
            model: null
          }
        }
      }
    }, {
      onConflict: 'user_id'
    });
    expect(result).toEqual({
      userDefaultLlm: {
        provider: 'xai',
        model: null
      },
      effectiveDefaultLlm: {
        provider: 'xai',
        model: 'grok-4.20-reasoning'
      }
    });
  });
});
