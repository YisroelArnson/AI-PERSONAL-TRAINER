const { getLatestDocVersionByDocKey, getLatestDocVersionByDocType } = require('../services/memory-docs.service');
const { getPromptContextForRun } = require('../services/prompt-context-cache.service');
const { listBootstrapEpisodicNotes, formatBootstrapEpisodicNotes } = require('../services/episodic-notes.service');
const { resolveSessionContinuityPolicy } = require('../services/session-reset-policy.service');
const { env } = require('../../config/env');

const DEFAULT_COACH_SOUL = [
  'You are steady, warm, clear, and encouraging.',
  'You coach like a real trainer who remembers the user and keeps momentum high without being cheesy.',
  'You sound human, practical, and grounded.'
].join(' ');

const SYSTEM_PROMPT = [
  'You are the AI Personal Trainer runtime.',
  'Follow application rules, stay concise, prefer actionable coaching, and do not invent unavailable system state.',
  'Use the provided tool registry when you need durable program or memory context.',
  'Read-only tools should be preferred before mutating tools when more context is needed.',
  'If you use a tool, incorporate the result and continue the run.',
  'Do not claim you updated memory or the program unless a mutating tool actually did it.',
  'When the user asks for coaching help, answer like a thoughtful trainer rather than a generic assistant.'
].join(' ');

const COACH_PRINCIPLES = [
  'Bias toward safety, clarity, and progressive overload.',
  'Prefer simple exercise selection and actionable cues over over-explaining.',
  'When information is missing, ask the smallest useful follow-up or use a read-only tool.',
  'Avoid pretending certainty about workout history, injuries, or program state without evidence.'
].join(' ');

function formatLayer(title, body) {
  return [`## ${title}`, body && String(body).trim() ? String(body).trim() : '_not available yet_'].join('\n');
}

function buildCacheControl(ttl) {
  return ttl ? { type: 'ephemeral', ttl } : { type: 'ephemeral' };
}

function buildSystemBlocks({
  coachSoul,
  programMarkdown,
  recalledMemoryMarkdown,
  episodicBootstrapMarkdown,
  triggerType
}) {
  const blocks = [
    {
      type: 'text',
      text: formatLayer('System Prompt', SYSTEM_PROMPT)
    },
    {
      type: 'text',
      text: formatLayer('Coach Principles', COACH_PRINCIPLES),
      cache_control: buildCacheControl(env.anthropicStaticCacheTtl)
    },
    {
      type: 'text',
      text: formatLayer('Coach Soul', coachSoul || DEFAULT_COACH_SOUL)
    },
    {
      type: 'text',
      text: formatLayer('Program Markdown', programMarkdown)
    },
    {
      type: 'text',
      text: formatLayer('Recalled Memory Markdown', recalledMemoryMarkdown)
    }
  ];

  if (episodicBootstrapMarkdown) {
    blocks.push({
      type: 'text',
      text: formatLayer('New Session Episodic Notes', episodicBootstrapMarkdown)
    });
  }

  if (triggerType === 'app.opened') {
    blocks.push({
      type: 'text',
      text: formatLayer(
        'App Open Context',
        'The app was just opened. Welcome the user briefly, check in, and avoid repetitive greetings during short foreground/background churn.'
      )
    });
  }

  const lastBlock = blocks[blocks.length - 1];
  if (env.anthropicPromptCachingEnabled && lastBlock) {
    lastBlock.cache_control = buildCacheControl(env.anthropicDynamicContextCacheTtl);
  }

  return blocks;
}

async function assemblePrompt(run, options = {}) {
  const messageLimit = options.messageLimit || 12;
  const [coachSoulDoc, programDoc, memoryDoc, promptContext, continuityPolicy] = await Promise.all([
    getLatestDocVersionByDocKey(run.user_id, 'COACH_SOUL').catch(() => null),
    getLatestDocVersionByDocType(run.user_id, 'PROGRAM').catch(() => null),
    getLatestDocVersionByDocType(run.user_id, 'MEMORY').catch(() => null),
    getPromptContextForRun(run, { messageLimit }),
    resolveSessionContinuityPolicy(run.user_id).catch(() => null)
  ]);
  const shouldLoadBootstrapEpisodicNotes = promptContext.sourceEventIds.length <= 1;
  const episodicNotes = shouldLoadBootstrapEpisodicNotes && continuityPolicy
    ? await listBootstrapEpisodicNotes({
        userId: run.user_id,
        timezone: continuityPolicy.timezone,
        readStrategy: continuityPolicy.episodicReadStrategy,
        customWindowDays: continuityPolicy.episodicCustomWindowDays
      }).catch(() => [])
    : [];

  const coachSoul = coachSoulDoc ? coachSoulDoc.version.content : DEFAULT_COACH_SOUL;
  const programMarkdown = programDoc ? programDoc.version.content : '';
  const recalledMemoryMarkdown = memoryDoc ? memoryDoc.version.content : '';
  const episodicBootstrapMarkdown = formatBootstrapEpisodicNotes(episodicNotes);
  const systemBlocks = buildSystemBlocks({
    coachSoul,
    programMarkdown,
    recalledMemoryMarkdown,
    episodicBootstrapMarkdown,
    triggerType: run.trigger_type
  });

  return {
    systemPrompt: systemBlocks.map(block => block.text).join('\n\n'),
    systemBlocks,
    messages: promptContext.messages,
    metadata: {
      cacheHit: promptContext.cacheHit,
      sourceEventIds: promptContext.sourceEventIds,
      layers: {
        hasCoachSoul: Boolean(coachSoulDoc),
        hasProgramMarkdown: Boolean(programDoc),
        hasMemoryMarkdown: Boolean(memoryDoc),
        hasEpisodicBootstrap: episodicNotes.length > 0
      }
    }
  };
}

module.exports = {
  assemblePrompt
};
