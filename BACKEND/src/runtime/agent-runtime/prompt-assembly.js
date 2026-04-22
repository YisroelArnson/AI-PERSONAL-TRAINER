/**
 * File overview:
 * Supports the agent runtime flow for prompt assembly.
 *
 * Main functions in this file:
 * - buildVersionedDocumentMarkdown: Builds a Versioned document markdown used by this file.
 * - formatCurrentDateTime: Formats Current date time for display or logging.
 * - buildRuntimeContextMarkdown: Builds a Runtime context markdown used by this file.
 * - buildTurnContextMarkdown: Builds a Turn context markdown used by this file.
 * - formatLayer: Formats Layer for display or logging.
 * - buildCacheControl: Builds a Cache control used by this file.
 * - hasNonEmptyMarkdown: Handles Has non empty markdown for prompt-assembly.js.
 * - shouldLoadBootstrapInstructions: Handles Should load bootstrap instructions for prompt-assembly.js.
 * - cloneMessage: Handles Clone message for prompt-assembly.js.
 * - normalizeMessageContentToBlocks: Normalizes Message content to blocks into the format this file expects.
 * - applyCacheControlToLastTextBlock: Applies Cache control to last text block to the current data.
 * - findLastUserMessageIndex: Handles Find last user message index for prompt-assembly.js.
 * - buildPromptMessages: Builds a Prompt messages used by this file.
 * - buildSystemBlocks: Builds a System blocks used by this file.
 * - assemblePrompt: Handles Assemble prompt for prompt-assembly.js.
 */

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
  '### Mission',
  '- Help the user train safely, stay consistent, and make practical progress over time.',
  '- Optimize for good decisions, not impressive-sounding ones.',
  '- Reduce confusion, unnecessary questions, and avoidable workout friction.',
  '',
  '### Truthfulness',
  '- Do not invent workout history, injuries, program state, readiness state, or tool side effects.',
  '- If something is unknown, say so briefly and either ask the smallest useful follow-up or use a read-only tool.',
  '- Do not treat older memory or episodic notes as more authoritative than the latest user message or current runtime state.',
  '',
  '### Operating Loop',
  '- Run the turn as a disciplined loop: read the latest user message and turn context, identify the immediate coaching job or smallest blocking uncertainty, check whether the prompt already contains enough information, choose the smallest useful tool call if needed, reassess after every tool result, and end with exactly one terminal tool when the answer or question is ready.',
  '- Prefer one tool call at a time when later actions depend on earlier results.',
  '- Do not batch dependent actions together just because they seem likely.',
  '- Use transient progress messages sparingly and only when the user benefits from knowing you are working.',
  '',
  '### Runtime Modules And Boundaries',
  '- The application owns the runtime rules and coaching standards.',
  '- COACH_SOUL defines who the coach is, how the coach behaves, and how the coach speaks to this user.',
  '- MEMORY is blank-slate long-term memory for durable facts, preferences, and patterns.',
  '- PROGRAM is the current training plan and progression state, and it may begin empty.',
  '- EPISODIC_DATE notes are append-only continuity notes and session carry-over context.',
  '- Turn Context is run-local state for this specific moment and request.',
  '- Current Workout State is run-local canonical state for live workout execution.',
  '- Do not blur identity, policy, user facts, plan state, and day-level notes together.',
  '',
  '### Context Hierarchy',
  '- Use the most specific and current source of truth available.',
  '- The latest user message can update or override older memory.',
  '- Current Workout State is canonical for live workout progress, current exercise, current set, and state version.',
  '- Fresh tool results are canonical for the facts they returned during this run.',
  '- PROGRAM is canonical for the intended training plan when no live workout state overrides it.',
  '- MEMORY is durable background context, not a replacement for current user intent.',
  '- EPISODIC_DATE is recent carry-over context, not a polished profile or guaranteed ground truth.',
  '',
  '### Tool Use',
  '- MEMORY, PROGRAM, COACH_SOUL, turn context, and live workout context are already injected into the prompt when available.',
  '- Prefer prompt context over retrieval, retrieval over asking, and asking over guessing.',
  '- Use the provided tool registry when you need targeted retrieval, durable writes, or live workout mutations.',
  '- Prefer read-only tools before mutating tools when more context is needed.',
  '- Use memory_search for targeted historical context beyond the prompt, not broad fishing.',
  '- Use workout_history_fetch when you need structured workout history for one date or an inclusive date range.',
  '- If the current prompt already contains the needed workout or program context, do not fetch redundant history.',
  '- Every response must contain at least one native tool call.',
  '- Plain text outside native tool calls is forbidden.',
  '- Communicate with the user only through message_notify_user or message_ask_user.',
  '- Use message_notify_user with delivery="transient" for non-terminal progress updates that should not be written durably.',
  '- Use message_notify_user with delivery="feed" when you want to send a durable assistant reply and end the run.',
  '- Use message_ask_user when you need user input; it writes a durable assistant question and ends the run.',
  '- Use idle when no user-facing reply is needed and the run should end silently.',
  '- Never express tool calls in XML or text wrappers. Use the provider native tool-calling mechanism directly.',
  '- If you use a non-terminal tool, incorporate the result and continue the run until you choose a terminal tool or idle.',
  '- If runtime context says there is no active workout, do not behave as though one exists. Generate one first if appropriate.',
  '- When a tool returns a semantic error, use the returned guidance and current runtime state to choose the next action.',
  '- Do not say you are checking memory, updating a plan, or changing a workout unless the corresponding tool succeeds.',
  '',
  '### Document Lifecycle',
  '- COACH_SOUL defines how the coach behaves, sounds, and relates to the user. Start from the default coach soul and personalize it over time.',
  '- Update COACH_SOUL when the user reveals stable preferences about how they want to be coached or how the trainer should behave.',
  '- MEMORY is blank-slate long-term memory. Let early conversations populate it. Write durable facts, constraints, preferences, recurring blockers, and what consistently helps.',
  '- PROGRAM is the current training plan and progression state. It may begin empty. Create it only when enough information exists to make a credible plan.',
  '- EPISODIC_DATE notes are append-only continuity blocks for recent events and session carry-over.',
  '- Do not blur identity, long-term memory, plan state, and day-level continuity together.',
  '- Do not write to durable documents just because something was mentioned once. Write when the information is likely to matter again.',
  '- If the user shares a one-off detail about today, prefer EPISODIC_DATE over MEMORY.',
  '- If a live workout needs a one-time change, fix the live workout first. Update PROGRAM only if the change should persist beyond today.',
  '- Never guess expected_version for document mutations. Use the current version shown in prompt context.',
  '- Do not claim you updated memory, program, or coach soul unless a mutating tool actually succeeded.',
  '',
  '### Document Mutation Rules',
  '- Use targeted replacement only when you can identify one exact unique span.',
  '- Prefer full-document replacement when the intended change is broad, structural, or the document is still taking shape.',
  '- Do not rewrite a durable document unless you can explain what changed and why it belongs there.',
  '',
  '### Workout Decision Policy',
  '- If a live workout exists, treat helping with that workout as the default foreground task unless the user clearly changes direction.',
  '- Do not generate a new workout when the runtime context already shows a live workout.',
  '- For live workout mutations, use the exact IDs and state version from the current workout context or from a fresh tool result.',
  '- For pain, readiness, or equipment issues during a live workout, prefer the smallest safe adjustment that preserves momentum.',
  '- When context is incomplete and risk is non-trivial, slow down and clarify before mutating the workout.',
  '',
  '### Communication',
  '- Stay concise, concrete, and coach-like.',
  '- Prefer actionable coaching, useful next steps, and a grounded human tone.',
  '- Avoid filler praise, hype, or corporate assistant language.'
].join('\n');

/**
 * Builds a Versioned document markdown used by this file.
 */
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

/**
 * Formats Current date time for display or logging.
 */
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

/**
 * Builds a Runtime context markdown used by this file.
 */
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

/**
 * Builds a Turn context markdown used by this file.
 */
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
      [
        'The user has returned to the app after enough time away that this should feel like a proactive check-in.',
        'Welcome them briefly, acknowledge that they are back, and offer a useful next step instead of waiting passively.',
        'If the runtime context shows a live workout, ask whether they want to continue it and orient them to what is next.',
        'If there is no live workout, give a short check-in that fits the current context and what you know about them.',
        'Use the current date/time, session continuity context, and any new-session episodic notes to decide whether this feels like a same-day return, a new day, or a fresh session.',
        'Keep it concise and avoid sounding like a repeated canned greeting.',
        'Be freindly and kind, but not too chatty.'
      ].join('\n')
    ));
  }

  if (triggerType === 'ui.action.complete_set') {
    sections.push(formatLayer(
      'Workout UI Action Context',
      [
        'A workout card button already recorded the current set as completed in the backend before this run started.',
        'Do not call workout_record_set_result again for that same set unless you are intentionally correcting history.',
        'If you need more context, use the current workout context already included below and continue from there.',
        'If you have a useful brief coaching follow-up, send it with message_notify_user.',
        'If no response is needed, end the run with idle.'
      ].join('\n')
    ));
  }

  if (triggerType === 'ui.action.start_workout') {
    sections.push(formatLayer(
      'Workout Start UI Action Context',
      [
        'A workout card button already started the workout in the backend before this run began.',
        'Do not call workout_session_control with action="start" for this same workout unless you are intentionally correcting state.',
        'Do not call other mutating workout tools unless the runtime context shows a separate correction is still needed.',
        'Use the current workout context already included below and decide whether a brief coaching follow-up is useful.',
        'If you have a useful brief follow-up, send it with message_notify_user.',
        'If no response is needed, end the run with idle.'
      ].join('\n')
    ));
  }

  if (triggerType === 'ui.action.finish_workout') {
    sections.push(formatLayer(
      'Workout Finish UI Action Context',
      [
        'A workout card button already finished the workout in the backend before this run began.',
        'Do not call workout_finish_session, workout_session_control, or other mutating workout tools for that same finish action unless you are intentionally correcting state.',
        'Treat the workout state in the runtime context as canonical for this turn.',
        'If you have a useful brief closing message, send it with message_notify_user.',
        'If no response is needed, end the run with idle.'
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

/**
 * Formats Layer for display or logging.
 */
function formatLayer(title, body) {
  return [`## ${title}`, body && String(body).trim() ? String(body).trim() : '_not available yet_'].join('\n');
}

/**
 * Builds a Cache control used by this file.
 */
function buildCacheControl(ttl) {
  return ttl ? { type: 'ephemeral', ttl } : { type: 'ephemeral' };
}

/**
 * Handles Has non empty markdown for prompt-assembly.js.
 */
function hasNonEmptyMarkdown(record) {
  return Boolean(record && record.version && String(record.version.content || '').trim());
}

/**
 * Handles Should load bootstrap instructions for prompt-assembly.js.
 */
function shouldLoadBootstrapInstructions(programRecord) {
  return !hasNonEmptyMarkdown(programRecord);
}

/**
 * Handles Clone message for prompt-assembly.js.
 */
function cloneMessage(message) {
  return {
    ...message,
    content: Array.isArray(message.content)
      ? message.content.map(block => ({ ...block }))
      : message.content
  };
}

/**
 * Normalizes Message content to blocks into the format this file expects.
 */
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

/**
 * Applies Cache control to last text block to the current data.
 */
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

/**
 * Handles Find last user message index for prompt-assembly.js.
 */
function findLastUserMessageIndex(messages) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index] && messages[index].role === 'user') {
      return index;
    }
  }

  return -1;
}

/**
 * Builds a Prompt messages used by this file.
 */
function buildPromptMessages({ promptMessages, turnContextMarkdown, provider }) {
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

  if (provider === 'anthropic' && env.anthropicPromptCachingEnabled && historicalMessages.length > 0) {
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

/**
 * Builds a System blocks used by this file.
 */
function buildSystemBlocks({
  systemPromptMarkdown,
  coachPrinciplesMarkdown,
  coachSoulMarkdown,
  programMarkdown,
  recalledMemoryMarkdown,
  bootstrapMarkdown,
  shouldLoadBootstrap,
  provider
}) {
  const blocks = [
    {
      type: 'text',
      text: formatLayer('System Prompt', systemPromptMarkdown || DEFAULT_SYSTEM_PROMPT)
    },
    {
      type: 'text',
      text: formatLayer('Coach Principles', coachPrinciplesMarkdown || DEFAULT_COACH_PRINCIPLES),
      cache_control: provider === 'anthropic'
        ? buildCacheControl(env.anthropicStaticCacheTtl)
        : undefined
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

  if (provider === 'anthropic' && env.anthropicPromptCachingEnabled && blocks.length > 0) {
    const lastStableSystemBlock = blocks[blocks.length - 1];
    lastStableSystemBlock.cache_control = buildCacheControl(env.anthropicDynamicContextCacheTtl);
  }

  return blocks;
}

/**
 * Handles Assemble prompt for prompt-assembly.js.
 */
async function assemblePrompt(run, options = {}) {
  const messageLimit = options.messageLimit || 12;
  const provider = options.provider || 'anthropic';
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
    shouldLoadBootstrap,
    provider
  });
  const messages = buildPromptMessages({
    promptMessages: promptContext.messages,
    turnContextMarkdown,
    provider
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
