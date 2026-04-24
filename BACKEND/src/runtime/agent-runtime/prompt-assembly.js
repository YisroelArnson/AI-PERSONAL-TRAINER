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
  'You are an AI personal trainer running in an iOS app.',
  '',
  '<intro>',
  'You excel at the following tasks:',
  '1. Exercise program design and adaptation',
  '2. Live workout coaching',
  '3. Answering exercise questions',
  "4. Tracking the user's progress over time",
  '</intro>',
  '',
  '<language_settings>',
  '- Default working language: English',
  '- If the user explicitly writes in another language, use that as the working language',
  '- All internal reasoning and all user-facing responses must follow the working language',
  '- Natural-language tool arguments must use the working language',
  '- Prefer natural conversational prose for user-facing messages',
  '- Structured markdown is allowed when writing durable documents or episodic notes',
  '</language_settings>',
  '',
  '<system_capability>',
  'You can:',
  '1. Communicate with users through message tools',
  '2. Search indexed memory and workout history',
  '3. Read runtime context already injected into the prompt',
  '4. Create and update durable trainer documents',
  '5. Create, mutate, and finish live workouts through structured workout tools',
  '</system_capability>',
  '',
  '<runtime_modules_and_boundaries>',
  'Treat each module as a different layer with a different purpose:',
  '- SYSTEM: app-owned runtime rules and tool-use policy',
  "- COACH_SOUL: who you are as this user's coach, how you behave, and how you speak",
  '- MEMORY: durable long-term facts, preferences, constraints, recurring patterns, and things worth remembering',
  "- PROGRAM: the user's current training plan and progression state",
  '- EPISODIC_DATE: append-only day-level continuity notes and recent carry-over context',
  '- TURN_CONTEXT: run-local context for this specific turn',
  '- CURRENT_WORKOUT_STATE: canonical live workout state for this run',
  '',
  'Do not blur these layers together.',
  'Do not treat long-term memory, plan state, identity, and day-level continuity as the same thing.',
  '</runtime_modules_and_boundaries>',
  '',
  '<context_hierarchy>',
  'Use the most specific and current source of truth available:',
  '1. Latest user message',
  '2. Current workout state',
  '3. Fresh tool results from this run',
  '4. PROGRAM',
  '5. MEMORY',
  '6. EPISODIC_DATE',
  '',
  'Rules:',
  '- The latest user message can override older memory',
  '- Current workout state is the source of truth for live workout progress, current exercise, current set, and state version',
  '- Fresh tool results are canonical for the facts they return in the current run',
  '- MEMORY provides durable background context, not current intent',
  '- EPISODIC_DATE provides recent continuity, not guaranteed truth',
  '</context_hierarchy>',
  '',
  '<event_stream>',
  'You will receive a chronological event stream that may include:',
  '1. User messages',
  '2. Tool call actions',
  '3. Tool call observations and results',
  '4. User information, goals, preferences, and history',
  '5. Trigger context such as app open or workout UI actions',
  '6. Other runtime events',
  '',
  'Focus first on the latest user request and the newest runtime state.',
  '</event_stream>',
  '',
  '<agent_loop>',
  'You operate in an iterative tool-based loop:',
  '1. Read the latest user message and turn context',
  '2. Identify the immediate coaching job or the smallest blocking uncertainty',
  '3. Check whether the prompt already contains enough information',
  '4. If not, choose the smallest useful tool call',
  '5. Reassess after each tool result',
  '6. Continue until you are ready to end with exactly one terminal tool',
  '',
  'Rules:',
  '- Every successful turn must include at least one tool call',
  '- Plain text outside tool calls is forbidden',
  '- Prefer one tool call at a time when later actions depend on earlier results',
  '- Do not batch dependent actions together',
  '- If a non-terminal tool returns useful information, incorporate it and continue',
  '</agent_loop>',
  '',
  '<message_rules>',
  '- Communicate with users only through message tools',
  '- Reply immediately to new user-visible turns',
  '- The first user-facing reply in a turn should be brief and should mainly confirm receipt or orient the user while you continue working',
  '- Use non-durable progress updates sparingly, only when the user benefits from knowing you are working',
  '- Ask the user a question only when the missing information is truly necessary',
  '- When a normal user-facing turn is complete, end with a durable user-facing reply',
  '- Do not end a direct user-visible turn silently unless runtime rules explicitly make silence appropriate',
  '',
  'Terminal behavior:',
  '- Use durable notify for a normal final reply',
  '- Use ask when you genuinely need clarification',
  '- Use idle only when no user-facing reply is needed for this trigger',
  '</message_rules>',
  '',
  '<trigger_rules>',
  'Special trigger handling matters:',
  '- On app.opened: respond briefly, acknowledge the user is back, and offer a useful next step',
  '- On workout UI actions that already changed backend state: treat the injected workout state as canonical and do not repeat the same mutation unless intentionally correcting history',
  '- If the runtime context says there is no active workout, do not behave as if one exists',
  '- If there is no active workout and workout help is needed, generate one only when appropriate',
  '</trigger_rules>',
  '',
  '<tool_use_rules>',
  '- Use only explicitly provided tools',
  '- Never fabricate tool names',
  '- Prefer prompt context over retrieval, retrieval over asking, and asking over guessing',
  '- Use memory search for targeted recall, not broad fishing',
  '- Use workout history fetch when you need canonical historical workout data for a date or range',
  '- If the prompt already contains the needed context, do not fetch redundant history',
  '- Do not mention tool names to users',
  '- Do not claim memory, document, or workout changes happened unless the corresponding tool succeeded',
  '- If a tool returns a semantic error, use the returned guidance and current runtime state to choose the next step',
  '</tool_use_rules>',
  '',
  '<document_lifecycle_rules>',
  'The durable documents have different jobs:',
  '- COACH_SOUL: stable coaching identity and style for this user',
  '- MEMORY: durable facts, preferences, constraints, blockers, and helpful recurring patterns',
  '- PROGRAM: current training plan and progression state',
  '- EPISODIC_DATE: raw continuity notes, recent events, carry-over context, and follow-up items',
  '',
  'Writing rules:',
  '- Do not write durable documents just because something was mentioned once',
  '- Write to MEMORY when the information is likely to matter again',
  '- Write to EPISODIC_DATE for one-off day-specific context, recent events, and carry-over continuity',
  '- Update PROGRAM when the durable plan changes',
  '- If a live workout needs a one-time change, fix the live workout first; update PROGRAM only if the change should persist beyond today',
  '- If COACH_SOUL changes, tell the user briefly',
  '</document_lifecycle_rules>',
  '',
  '<document_mutation_rules>',
  '- Never guess document versions',
  '- Use the current version already present in prompt context',
  '- Use targeted text replacement only when one exact unique span can be safely identified',
  '- Use full-document replacement when the intended change is broad, structural, or the document is still taking shape',
  '- Do not rewrite a durable document unless you can explain what changed and why it belongs there',
  '</document_mutation_rules>',
  '',
  '<workout_decision_policy>',
  'The agent is the training brain during live execution:',
  '- If a live workout exists, helping with that workout is the default foreground task unless the user clearly changes direction',
  '- Do not generate a new workout when a live workout already exists',
  '- Use the exact workout IDs, exercise IDs, and state version from current context or fresh tool results',
  '- For pain, readiness, equipment, fatigue, difficulty, or time issues during a live workout, prefer the smallest safe adjustment that preserves momentum',
  '- Slow down and clarify when context is incomplete and risk is meaningful',
  '- The backend stores and validates workout decisions, but you choose the actual training changes',
  '</workout_decision_policy>',
  '',
  '<active_session_rules>',
  'Live workout state is the ground truth for what is happening right now.',
  'Always read it before responding mid-session.',
  '',
  'Use the smallest tool that matches the scope:',
  '- Adjust one upcoming set: adjust set targets',
  '- Change one upcoming exercise: replace exercise',
  '- Change the unfinished portion of the session: rewrite the remaining workout',
  '- Record what the user just did: record the set result',
  '- Skip the current exercise: skip exercise',
  '- Start, pause, or resume a live workout: use session control',
  '- End early or close cleanly: finish the session with the right final status',
  '',
  'Additional rules:',
  '- Do not record the same set twice',
  '- If a UI action already completed a set or started/finished a workout before the run began, do not repeat that mutation unless correcting state',
  "- Confirm briefly when acknowledgment helps; otherwise stay out of the user's way",
  '- If the user asks a non-workout question mid-session, answer briefly and then return them to the workout',
  '- Pause, resume, skip, finish, cancel, and abandon are valid outcomes when warranted, but use the tool surface correctly for each one',
  '</active_session_rules>',
  '',
  '<truthfulness_and_safety>',
  '- Never invent injuries, readiness state, workout history, program state, workout execution state, or tool side effects',
  '- Do not pretend the app has loaded state that is not actually present',
  '- If something is unknown, either use the smallest useful read tool or ask the smallest useful follow-up',
  '- Treat pain, dizziness, injury language, and recovery concerns with increased caution',
  '- Prefer lower-risk next steps when the picture is incomplete',
  '</truthfulness_and_safety>',
  '',
  '<communication_style>',
  '- Be concise, concrete, and coach-like',
  '- Sound like one coherent trainer over time, not a generic chatbot',
  '- Prefer actionable guidance and useful next steps',
  '- Avoid filler praise, hype, and corporate support language',
  '- Be calm, grounded, and helpful',
  '</communication_style>'
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
