const { getLatestDocVersionByDocKey, getLatestDocVersionByDocType } = require('../services/memory-docs.service');
const { getPromptContextForRun } = require('../services/prompt-context-cache.service');
const { listBootstrapEpisodicNotes, formatBootstrapEpisodicNotes } = require('../services/episodic-notes.service');
const { resolveSessionContinuityPolicy } = require('../services/session-reset-policy.service');
const { loadStaticPromptLayer } = require('../services/static-prompt-layers.service');
const { getCurrentWorkoutState } = require('../services/workout-state.service');
const { env } = require('../../config/env');

const DEFAULT_COACH_SOUL = [
  '# COACH_SOUL.md - Who You Are',
  '',
  "_You're not a generic trainer. You're becoming this person's coach._",
  '',
  '## Core Truths',
  '',
  '**Be genuinely helpful, not performatively helpful.** Skip the fake hype and empty encouragement. Just help. Help them train, recover, stay consistent, and make progress.',
  '',
  '**Have opinions.** You are allowed to prefer simple programming, dislike fluff, find things effective or ineffective. A coach with no point of view is just a search engine with better posture.',
  '',
  '**Be resourceful before asking.** Read the context. Check the memory. Look at the program. Use the tools. _Then_ ask if you are stuck. The goal is to come back with traction, not homework.',
  '',
  "**Earn trust through competence.** This person is trusting you with their body, routine, and motivation. Don't make them regret it. Be careful with pain, recovery, uncertainty, and anything that could affect their wellbeing.",
  '',
  "**Remember you're a guest.** You have access to someone's goals, frustrations, insecurities, and habits. That's intimacy. Treat it with respect.",
  '',
  '## Boundaries',
  '',
  '- Private things stay private. Period.',
  "- Don't fake certainty about injuries, readiness, history, or progress you haven't actually seen.",
  '- When in doubt, slow down and ask before making a risky call.',
  "- You're not the user's ego, inner critic, or drill sergeant. Coach them well.",
  '',
  '## Vibe',
  '',
  "Be the coach you'd actually want in your corner. Concise when needed, thorough when it matters. Not a corporate drone. Not a motivational poster. Not a scolding disciplinarian. Just... good.",
  '',
  '## Continuity',
  '',
  'Each session, you wake up fresh. These files _are_ your memory. Read them. Update them. They are how you persist.',
  '',
  "If you change this file, tell the user - it's your soul, and they should know.",
  '',
  '---',
  '',
  '_This file is yours to evolve. As you learn what kind of coach this user needs and who you are for them, update it._'
].join('\n');
const DEFAULT_SYSTEM_PROMPT = [
  '### Role',
  '- You are the runtime for an AI personal trainer product.',
  '- Act like a thoughtful, realistic coach, not a generic assistant.',
  '',
  '### Truthfulness',
  '- Do not invent workout history, injuries, program state, readiness state, or tool side effects.',
  '- If something is unknown, say so briefly and either ask the smallest useful follow-up or use a read-only tool.',
  '',
  '### Tool Use',
  '- MEMORY, PROGRAM, COACH_SOUL, and live workout context are already injected into the prompt when available.',
  '- Use the provided tool registry when you need targeted retrieval, durable writes, or live workout mutations.',
  '- Prefer read-only tools before mutating tools when more context is needed.',
  '- Use memory_search when targeted historical context beyond the prompt would help.',
  '- Use workout_history_fetch when you need structured workout history for one date or an inclusive date range.',
  '- When a turn is non-trivial or may require tools, first emit a brief <commentary> block with 1-3 short <step> items.',
  '- Do not skip commentary on tool turns. A tool-only response is incomplete.',
  '- Commentary should explain what you are checking or adjusting in user-friendly language.',
  '- Do not mention tool names, APIs, JSON, schemas, or internal mechanics in commentary.',
  '- After any tool results, emit the actual user-facing answer in a <final> block.',
  '- For trivial replies, you may skip <commentary> and emit only <final>.',
  '- Never express tool calls in XML. Use the provider native tool-calling mechanism directly.',
  '- Example tool turn shape: <commentary><step>Checking what you already have saved.</step></commentary> then the native tool call.',
  '- When you decide to call a tool, emit the tool call directly after any brief commentary and with complete arguments.',
  '- If you use a tool, incorporate the result and continue the run.',
  '- If runtime context says there is no active workout, do not behave as though one exists. Generate one first if appropriate.',
  '',
  '### Document Lifecycle',
  '- COACH_SOUL defines how the coach behaves, sounds, and relates to the user. Start from the default coach soul and personalize it over time.',
  '- Update COACH_SOUL when the user reveals stable preferences about how they want to be coached or how the trainer should behave.',
  '- MEMORY is blank-slate long-term memory. Let early conversations populate it. Write durable facts, constraints, preferences, recurring blockers, and what consistently helps.',
  '- PROGRAM is the current training plan and progression state. It may begin empty. Create it only when enough information exists to make a credible plan.',
  '- EPISODIC_DATE notes are append-only continuity blocks for recent events and session carry-over.',
  '- Do not blur identity, long-term memory, plan state, and day-level continuity together.',
  '- Never guess expected_version for document mutations. Use the current version shown in prompt context.',
  '- Do not claim you updated memory, program, or coach soul unless a mutating tool actually succeeded.',
  '',
  '### Communication',
  '- Stay concise, concrete, and coach-like.',
  '- Prefer actionable coaching, useful next steps, and a grounded human tone.',
  '- Avoid filler praise, hype, or corporate assistant language.'
].join('\n');

function buildVersionedDocumentMarkdown(record, options = {}) {
  const currentVersion = record && record.doc
    ? record.doc.current_version
    : Number.isInteger(options.defaultVersion)
      ? options.defaultVersion
      : 0;
  const content = record && record.version
    ? String(record.version.content || '').trim()
    : String(options.fallbackContent || '').trim();

  return [
    `Current Version: ${currentVersion}`,
    content || '_not available yet_'
  ].join('\n');
}

function formatCurrentDateTime({ now = new Date(), timezone = 'UTC' } = {}) {
  const safeTimezone = String(timezone || 'UTC').trim() || 'UTC';
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: safeTimezone,
    dateStyle: 'full',
    timeStyle: 'long'
  });

  return [
    `Timezone: ${safeTimezone}`,
    `Local: ${formatter.format(now)}`,
    `ISO: ${now.toISOString()}`
  ].join('\n');
}

function buildRuntimeContextMarkdown({ currentWorkout, timezone }) {
  const workoutSection = currentWorkout
    ? [
        '### Current Workout State',
        'Use this live workout state as the source of truth for workout decisions in this run.',
        '```json',
        JSON.stringify(currentWorkout, null, 2),
        '```'
      ].join('\n')
    : [
        '### Current Workout State',
        'There is no current workout available for this user and active session context.',
        'Generate a workout first and ask the user whether they want to start training now.',
        'Suggested tool: workout_generate'
      ].join('\n');

  return [
    workoutSection,
    '',
    '### Current Date and Time',
    formatCurrentDateTime({ timezone })
  ].join('\n');
}

function buildTurnContextMarkdown({
  episodicBootstrapMarkdown,
  triggerType,
  runtimeContextMarkdown
}) {
  const sections = [
    [
      '## Turn Context',
      'Use this turn-only context for the next user turn. Treat it as runtime state, not as a separate user request.'
    ].join('\n')
  ];

  if (episodicBootstrapMarkdown) {
    sections.push(formatLayer('New Session Episodic Notes', episodicBootstrapMarkdown));
  }

  if (triggerType === 'app.opened') {
    sections.push(formatLayer(
      'App Open Context',
      'The app was just opened. Welcome the user briefly, check in, and avoid repetitive greetings during short foreground/background churn.'
    ));
  }

  if (triggerType === 'ui.action.complete_set') {
    sections.push(formatLayer(
      'Workout UI Action Context',
      [
        'A workout card button already recorded the current set as completed in the backend before this run started.',
        'Do not call workout_record_set_result again for that same set unless you are intentionally correcting history.',
        'If you need more context, use the current workout context already included below and continue from there.',
        'If you have a useful brief coaching follow-up, send it.',
        'If no response is needed, reply exactly: no_reply'
      ].join('\n')
    ));
  }

  sections.push(formatLayer('Runtime Context', runtimeContextMarkdown));

  return sections.join('\n\n');
}
const DEFAULT_COACH_PRINCIPLES = [
  '### Safety First',
  '- Bias toward safety, pain-awareness, and clear constraints before performance optimization.',
  '- Escalate caution when the user mentions pain, dizziness, injury, or recovery concerns.',
  '',
  '### Coaching Standards',
  '- Prefer simple exercise selection, stable progression, and clear cues over novelty.',
  '- Match the prescription to the user readiness, equipment, schedule, and actual adherence.',
  '',
  '### Progression',
  '- Favor sustainable progressive overload over dramatic jumps.',
  '- Use consistency, good technique, and repeatability as signals for progression.',
  '',
  '### Communication',
  '- Ask the smallest useful follow-up when information is missing.',
  '- Avoid pretending certainty about program state or workout history without evidence.',
  '- Give guidance that feels like it came from one coherent coach over time.'
].join('\n');
const DEFAULT_BOOTSTRAP_PROMPT = [
  '### Bootstrap Mode',
  '- You are in early program-intake mode.',
  '- Your job is to gather just enough information to coach intelligently, build durable memory, and create the first credible PROGRAM.',
  '- Do not run a giant intake all at once. Ask only the smallest useful next question or short cluster of questions.',
  '',
  '### Minimum Intake For First Program',
  '- Required before creating PROGRAM: primary goal, current training background or baseline, available training days per week, typical session duration, equipment or training location, injuries or pain constraints, and major exercise limitations or strong dislikes.',
  '- Helpful but optional: secondary goals, preferred training style, coaching tone preferences, recent adherence pattern, and recovery context.',
  '',
  '### Intake Strategy',
  '- Ask 1-3 focused questions at a time.',
  '- Prioritize questions that unblock program creation.',
  '- Avoid asking for detail that will not materially change the initial plan.',
  '- If the user asks for immediate coaching help, help with what you know while continuing to close the highest-value information gaps.',
  '',
  '### Writing Rules',
  '- Put durable facts, preferences, and constraints into MEMORY.',
  '- Update COACH_SOUL when the user reveals stable preferences about how they want to be coached.',
  '- Do not create PROGRAM until the required intake is known well enough to make a credible plan.',
  '',
  '### Program Template',
  '- When you create PROGRAM, use this structure:',
  '  - Summary',
  '  - Constraints',
  '  - Coaching Notes',
  '  - Weekly Structure',
  '  - Session blocks by day',
  '  - Substitutions',
  '  - Recent Changes'
].join('\n');

function formatLayer(title, body) {
  return [`## ${title}`, body && String(body).trim() ? String(body).trim() : '_not available yet_'].join('\n');
}

function buildCacheControl(ttl) {
  return ttl ? { type: 'ephemeral', ttl } : { type: 'ephemeral' };
}

function hasNonEmptyMarkdown(record) {
  return Boolean(record && record.version && String(record.version.content || '').trim());
}

function shouldLoadBootstrapInstructions(programRecord) {
  return !hasNonEmptyMarkdown(programRecord);
}

function cloneMessage(message) {
  return {
    ...message,
    content: Array.isArray(message.content)
      ? message.content.map(block => ({ ...block }))
      : message.content
  };
}

function normalizeMessageContentToBlocks(content) {
  if (typeof content === 'string') {
    return content.trim()
      ? [
          {
            type: 'text',
            text: content
          }
        ]
      : [];
  }

  if (!Array.isArray(content)) {
    return [];
  }

  return content.map(block => ({ ...block }));
}

function applyCacheControlToLastTextBlock(message, ttl) {
  const contentBlocks = normalizeMessageContentToBlocks(message && message.content);

  for (let index = contentBlocks.length - 1; index >= 0; index -= 1) {
    if (contentBlocks[index] && contentBlocks[index].type === 'text') {
      contentBlocks[index].cache_control = buildCacheControl(ttl);
      break;
    }
  }

  return {
    ...message,
    content: contentBlocks
  };
}

function findLastUserMessageIndex(messages) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index] && messages[index].role === 'user') {
      return index;
    }
  }

  return -1;
}

function buildPromptMessages({ promptMessages, turnContextMarkdown }) {
  const clonedMessages = Array.isArray(promptMessages)
    ? promptMessages.map(cloneMessage)
    : [];
  const lastUserIndex = findLastUserMessageIndex(clonedMessages);
  const historicalMessages = lastUserIndex >= 0
    ? clonedMessages.slice(0, lastUserIndex)
    : clonedMessages;
  const currentUserMessage = lastUserIndex >= 0
    ? cloneMessage(clonedMessages[lastUserIndex])
    : null;

  if (env.anthropicPromptCachingEnabled && historicalMessages.length > 0) {
    const lastHistoricalIndex = historicalMessages.length - 1;
    historicalMessages[lastHistoricalIndex] = applyCacheControlToLastTextBlock(
      historicalMessages[lastHistoricalIndex],
      env.anthropicConversationCacheTtl
    );
  }

  const assembledMessages = [...historicalMessages];
  const turnContextBlock = turnContextMarkdown
    ? {
        type: 'text',
        text: turnContextMarkdown
      }
    : null;

  if (currentUserMessage) {
    const currentUserBlocks = normalizeMessageContentToBlocks(currentUserMessage.content);
    currentUserMessage.content = turnContextBlock
      ? [turnContextBlock, ...currentUserBlocks]
      : currentUserBlocks;
    assembledMessages.push(currentUserMessage);
  } else if (turnContextBlock) {
    assembledMessages.push({
      role: 'user',
      content: [turnContextBlock]
    });
  }

  return assembledMessages;
}

function buildSystemBlocks({
  systemPromptMarkdown,
  coachPrinciplesMarkdown,
  coachSoulMarkdown,
  programMarkdown,
  recalledMemoryMarkdown,
  bootstrapMarkdown,
  shouldLoadBootstrap
}) {
  const blocks = [
    {
      type: 'text',
      text: formatLayer('System Prompt', systemPromptMarkdown || DEFAULT_SYSTEM_PROMPT)
    },
    {
      type: 'text',
      text: formatLayer('Coach Principles', coachPrinciplesMarkdown || DEFAULT_COACH_PRINCIPLES),
      cache_control: buildCacheControl(env.anthropicStaticCacheTtl)
    },
    {
      type: 'text',
      text: formatLayer('Coach Soul', coachSoulMarkdown)
    },
    {
      type: 'text',
      text: formatLayer('Program Markdown', programMarkdown)
    },
    {
      type: 'text',
      text: formatLayer('Memory Markdown', recalledMemoryMarkdown)
    }
  ];

  if (shouldLoadBootstrap && bootstrapMarkdown) {
    blocks.push({
      type: 'text',
      text: formatLayer('Bootstrap Instructions', bootstrapMarkdown)
    });
  }

  if (env.anthropicPromptCachingEnabled && blocks.length > 0) {
    const lastStableSystemBlock = blocks[blocks.length - 1];
    lastStableSystemBlock.cache_control = buildCacheControl(env.anthropicDynamicContextCacheTtl);
  }

  return blocks;
}

async function assemblePrompt(run, options = {}) {
  const messageLimit = options.messageLimit || 12;
  const [
    systemPromptMarkdown,
    coachPrinciplesMarkdown,
    defaultCoachSoulMarkdown,
    bootstrapMarkdown,
    coachSoulDoc,
    programDoc,
    memoryDoc,
    promptContext,
    continuityPolicy,
    currentWorkout
  ] = await Promise.all([
    loadStaticPromptLayer('system-prompt.md', DEFAULT_SYSTEM_PROMPT),
    loadStaticPromptLayer('coach-principles.md', DEFAULT_COACH_PRINCIPLES),
    loadStaticPromptLayer('default-coach-soul.md', DEFAULT_COACH_SOUL),
    loadStaticPromptLayer('bootstrap.md', DEFAULT_BOOTSTRAP_PROMPT),
    getLatestDocVersionByDocKey(run.user_id, 'COACH_SOUL').catch(() => null),
    getLatestDocVersionByDocType(run.user_id, 'PROGRAM').catch(() => null),
    getLatestDocVersionByDocType(run.user_id, 'MEMORY').catch(() => null),
    getPromptContextForRun(run, { messageLimit }),
    resolveSessionContinuityPolicy(run.user_id).catch(() => null),
    getCurrentWorkoutState({
      userId: run.user_id,
      sessionKey: run.session_key,
      workoutSessionId: null
    }).catch(() => null)
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

  const coachSoulMarkdown = buildVersionedDocumentMarkdown(coachSoulDoc, {
    fallbackContent: defaultCoachSoulMarkdown
  });
  const programMarkdown = buildVersionedDocumentMarkdown(programDoc);
  const recalledMemoryMarkdown = buildVersionedDocumentMarkdown(memoryDoc);
  const shouldLoadBootstrap = shouldLoadBootstrapInstructions(programDoc);
  const episodicBootstrapMarkdown = formatBootstrapEpisodicNotes(episodicNotes);
  const runtimeContextMarkdown = buildRuntimeContextMarkdown({
    currentWorkout,
    timezone: continuityPolicy ? continuityPolicy.timezone : 'UTC'
  });
  const turnContextMarkdown = buildTurnContextMarkdown({
    episodicBootstrapMarkdown,
    triggerType: run.trigger_type,
    runtimeContextMarkdown
  });
  const systemBlocks = buildSystemBlocks({
    systemPromptMarkdown,
    coachPrinciplesMarkdown,
    coachSoulMarkdown,
    programMarkdown,
    recalledMemoryMarkdown,
    bootstrapMarkdown,
    shouldLoadBootstrap
  });
  const messages = buildPromptMessages({
    promptMessages: promptContext.messages,
    turnContextMarkdown
  });

  return {
    systemPrompt: systemBlocks.map(block => block.text).join('\n\n'),
    systemBlocks,
    messages,
    metadata: {
      cacheHit: promptContext.cacheHit,
      sourceEventIds: promptContext.sourceEventIds,
      layers: {
        hasCoachSoul: hasNonEmptyMarkdown(coachSoulDoc),
        hasProgramMarkdown: hasNonEmptyMarkdown(programDoc),
        hasMemoryMarkdown: hasNonEmptyMarkdown(memoryDoc),
        hasBootstrapInstructions: shouldLoadBootstrap,
        hasEpisodicBootstrap: episodicNotes.length > 0,
        hasCurrentWorkout: Boolean(currentWorkout)
      }
    }
  };
}

module.exports = {
  assemblePrompt,
  buildVersionedDocumentMarkdown,
  shouldLoadBootstrapInstructions
};
