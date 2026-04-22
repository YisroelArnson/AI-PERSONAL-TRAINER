/**
 * File overview:
 * Implements runtime service logic for llm config.
 *
 * Main functions in this file:
 * - getAdminClientOrThrow: Gets Admin client or throw needed by this file.
 * - normalizeProvider: Normalizes Provider into the format this file expects.
 * - normalizeModel: Normalizes Model into the format this file expects.
 * - normalizeLlmSelection: Normalizes LLM selection into the format this file expects.
 * - getProviderDefaultModel: Gets Provider default model needed by this file.
 * - getGlobalDefaultLlmSelection: Gets Global default LLM selection needed by this file.
 * - finalizeLlmSelection: Handles Finalize LLM selection for llm-config.service.js.
 * - getStoredUserDefaultLlmSelection: Gets Stored user default LLM selection needed by this file.
 * - loadUserPlanSettings: Loads User plan settings for the surrounding workflow.
 * - loadUserDefaultLlmSelection: Loads User default LLM selection for the surrounding workflow.
 * - resolveEffectiveLlmSelection: Resolves Effective LLM selection before the next step runs.
 * - getRunStoredLlmSelection: Gets Run stored LLM selection needed by this file.
 * - resolveEffectiveLlmSelectionForRun: Resolves Effective LLM selection for run before the next step runs.
 * - buildPolicyOverridesWithUserDefaultLlm: Builds a Policy overrides with user default LLM used by this file.
 * - updateUserDefaultLlmSelection: Updates User default LLM selection with the latest state.
 * - getUserDefaultLlmSelectionSummary: Gets User default LLM selection summary needed by this file.
 */

const { env } = require('../../config/env');
const { getSupabaseAdminClient } = require('../../infra/supabase/client');

const SUPPORTED_PROVIDERS = new Set(['anthropic', 'xai']);

/**
 * Gets Admin client or throw needed by this file.
 */
function getAdminClientOrThrow() {
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    throw new Error('Supabase admin client is not configured');
  }

  return supabase;
}

/**
 * Normalizes Provider into the format this file expects.
 */
function normalizeProvider(provider) {
  if (!provider || !String(provider).trim()) {
    return null;
  }

  const normalized = String(provider).trim().toLowerCase();
  return SUPPORTED_PROVIDERS.has(normalized) ? normalized : null;
}

/**
 * Normalizes Model into the format this file expects.
 */
function normalizeModel(model) {
  if (!model || !String(model).trim()) {
    return null;
  }

  return String(model).trim();
}

/**
 * Normalizes LLM selection into the format this file expects.
 */
function normalizeLlmSelection(selection) {
  if (!selection || typeof selection !== 'object') {
    return null;
  }

  const provider = normalizeProvider(selection.provider);

  if (!provider) {
    return null;
  }

  return {
    provider,
    model: normalizeModel(selection.model)
  };
}

/**
 * Gets Provider default model needed by this file.
 */
function getProviderDefaultModel(provider, options = {}) {
  const normalizedProvider = normalizeProvider(provider);

  if (!normalizedProvider) {
    throw new Error(`Unsupported LLM provider: ${provider}`);
  }

  const preferredSelection = normalizeLlmSelection(options.preferredSelection);

  if (
    preferredSelection
    && preferredSelection.provider === normalizedProvider
    && preferredSelection.model
  ) {
    return preferredSelection.model;
  }

  if (normalizedProvider === 'anthropic') {
    return env.defaultAnthropicModel;
  }

  if (normalizedProvider === 'xai') {
    return env.defaultXaiModel;
  }

  throw new Error(`Unsupported LLM provider: ${provider}`);
}

/**
 * Gets Global default LLM selection needed by this file.
 */
function getGlobalDefaultLlmSelection() {
  const provider = normalizeProvider(env.defaultLlmProvider) || 'anthropic';

  return {
    provider,
    model: getProviderDefaultModel(provider)
  };
}

/**
 * Handles Finalize LLM selection for llm-config.service.js.
 */
function finalizeLlmSelection(selection, options = {}) {
  const normalizedSelection = normalizeLlmSelection(selection);

  if (!normalizedSelection) {
    return null;
  }

  return {
    provider: normalizedSelection.provider,
    model: normalizedSelection.model || getProviderDefaultModel(
      normalizedSelection.provider,
      {
        preferredSelection: options.preferredSelection
      }
    )
  };
}

/**
 * Gets Stored user default LLM selection needed by this file.
 */
function getStoredUserDefaultLlmSelection(policyOverrides) {
  if (!policyOverrides || typeof policyOverrides !== 'object') {
    return null;
  }

  const llmConfig = policyOverrides.llm;

  if (!llmConfig || typeof llmConfig !== 'object') {
    return null;
  }

  return normalizeLlmSelection(llmConfig.default);
}

/**
 * Loads User plan settings for the surrounding workflow.
 */
async function loadUserPlanSettings(userId) {
  const supabase = getAdminClientOrThrow();
  const { data, error } = await supabase
    .from('user_plan_settings')
    .select('user_id, plan_tier, policy_overrides_json')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data || null;
}

/**
 * Loads User default LLM selection for the surrounding workflow.
 */
async function loadUserDefaultLlmSelection(userId) {
  const settings = await loadUserPlanSettings(userId);
  return getStoredUserDefaultLlmSelection(settings ? settings.policy_overrides_json : null);
}

/**
 * Resolves Effective LLM selection before the next step runs.
 */
async function resolveEffectiveLlmSelection({
  userId,
  requestedLlm = null,
  inheritedLlm = null,
  userDefaultLlm = undefined
}) {
  const normalizedRequested = normalizeLlmSelection(requestedLlm);
  const normalizedInherited = normalizeLlmSelection(inheritedLlm);
  const normalizedUserDefault = userDefaultLlm === undefined
    ? await loadUserDefaultLlmSelection(userId)
    : normalizeLlmSelection(userDefaultLlm);

  if (normalizedRequested) {
    return finalizeLlmSelection(normalizedRequested, {
      preferredSelection: normalizedUserDefault
    });
  }

  if (normalizedInherited) {
    return finalizeLlmSelection(normalizedInherited, {
      preferredSelection: normalizedUserDefault
    });
  }

  if (normalizedUserDefault) {
    return finalizeLlmSelection(normalizedUserDefault, {
      preferredSelection: normalizedUserDefault
    });
  }

  return getGlobalDefaultLlmSelection();
}

/**
 * Gets Run stored LLM selection needed by this file.
 */
function getRunStoredLlmSelection(run) {
  const payload = run && run.trigger_payload && typeof run.trigger_payload === 'object'
    ? run.trigger_payload
    : {};
  const metadata = payload && payload.metadata && typeof payload.metadata === 'object'
    ? payload.metadata
    : {};

  return normalizeLlmSelection(metadata.llm);
}

/**
 * Resolves Effective LLM selection for run before the next step runs.
 */
function resolveEffectiveLlmSelectionForRun(run) {
  const storedSelection = getRunStoredLlmSelection(run);

  if (storedSelection) {
    return finalizeLlmSelection(storedSelection);
  }

  return getGlobalDefaultLlmSelection();
}

/**
 * Builds a Policy overrides with user default LLM used by this file.
 */
function buildPolicyOverridesWithUserDefaultLlm(policyOverrides, userDefaultLlm) {
  const baseOverrides = policyOverrides && typeof policyOverrides === 'object'
    ? policyOverrides
    : {};
  const llmOverrides = baseOverrides.llm && typeof baseOverrides.llm === 'object'
    ? baseOverrides.llm
    : {};
  const normalizedUserDefault = normalizeLlmSelection(userDefaultLlm);

  if (!normalizedUserDefault) {
    if (!Object.prototype.hasOwnProperty.call(baseOverrides, 'llm')) {
      return { ...baseOverrides };
    }

    const nextLlmOverrides = { ...llmOverrides };
    delete nextLlmOverrides.default;

    if (Object.keys(nextLlmOverrides).length === 0) {
      const nextOverrides = { ...baseOverrides };
      delete nextOverrides.llm;
      return nextOverrides;
    }

    return {
      ...baseOverrides,
      llm: nextLlmOverrides
    };
  }

  return {
    ...baseOverrides,
    llm: {
      ...llmOverrides,
      default: normalizedUserDefault
    }
  };
}

/**
 * Updates User default LLM selection with the latest state.
 */
async function updateUserDefaultLlmSelection(userId, userDefaultLlm) {
  const supabase = getAdminClientOrThrow();
  const existingSettings = await loadUserPlanSettings(userId);
  const mergedPolicyOverrides = buildPolicyOverridesWithUserDefaultLlm(
    existingSettings ? existingSettings.policy_overrides_json : {},
    userDefaultLlm
  );

  const { data, error } = await supabase
    .from('user_plan_settings')
    .upsert({
      user_id: userId,
      policy_overrides_json: mergedPolicyOverrides
    }, {
      onConflict: 'user_id'
    })
    .select('user_id, policy_overrides_json')
    .single();

  if (error) {
    throw error;
  }

  const storedUserDefault = getStoredUserDefaultLlmSelection(data ? data.policy_overrides_json : {});

  return {
    userDefaultLlm: storedUserDefault,
    effectiveDefaultLlm: storedUserDefault
      ? finalizeLlmSelection(storedUserDefault, {
          preferredSelection: storedUserDefault
        })
      : getGlobalDefaultLlmSelection()
  };
}

/**
 * Gets User default LLM selection summary needed by this file.
 */
async function getUserDefaultLlmSelectionSummary(userId) {
  const userDefaultLlm = await loadUserDefaultLlmSelection(userId);

  return {
    userDefaultLlm,
    effectiveDefaultLlm: userDefaultLlm
      ? finalizeLlmSelection(userDefaultLlm, {
          preferredSelection: userDefaultLlm
        })
      : getGlobalDefaultLlmSelection()
  };
}

module.exports = {
  SUPPORTED_PROVIDERS,
  buildPolicyOverridesWithUserDefaultLlm,
  finalizeLlmSelection,
  getGlobalDefaultLlmSelection,
  getProviderDefaultModel,
  getRunStoredLlmSelection,
  getStoredUserDefaultLlmSelection,
  loadUserDefaultLlmSelection,
  normalizeLlmSelection,
  resolveEffectiveLlmSelection,
  resolveEffectiveLlmSelectionForRun,
  updateUserDefaultLlmSelection,
  getUserDefaultLlmSelectionSummary
};
