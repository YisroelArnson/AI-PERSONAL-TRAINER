const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const { getAnthropicClient } = require('./modelProviders.service');

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_PUBLIC_URL,
  process.env.SUPABASE_SECRET_KEY
);

// Use Haiku for intake conversations (fast, cost-effective for Q&A)
const DEFAULT_MODEL = 'claude-haiku-4-5';

// Maximum questions to ask before forcing completion (safety net)
const MAX_QUESTIONS = 20;

const TOPICS = {
  goals: 'Goals',
  history: 'History',
  equipment: 'Equipment',
  injuries: 'Injuries',
  schedule: 'Schedule',
  preferences: 'Preferences'
};

const CHECKLIST_ITEMS = [
  { id: 'goals_primary', label: 'Primary goal(s)', topic: TOPICS.goals, required: true },
  { id: 'goals_secondary', label: 'Secondary goal(s)', topic: TOPICS.goals, required: false },
  { id: 'motivation', label: 'Motivation / why now', topic: TOPICS.goals, required: true },
  { id: 'history_training', label: 'Training history', topic: TOPICS.history, required: true },
  { id: 'activity_level', label: 'Current activity level', topic: TOPICS.history, required: true },
  { id: 'equipment_access', label: 'Equipment & locations', topic: TOPICS.equipment, required: true },
  { id: 'injuries_limitations', label: 'Injuries / limitations', topic: TOPICS.injuries, required: true },
  { id: 'red_flags', label: 'Red flag screening', topic: TOPICS.injuries, required: true },
  { id: 'time_availability', label: 'Days/week & minutes', topic: TOPICS.schedule, required: true },
  { id: 'schedule_preferences', label: 'Schedule preferences', topic: TOPICS.schedule, required: false },
  { id: 'exercise_likes', label: 'Likes/dislikes', topic: TOPICS.preferences, required: false },
  { id: 'coaching_style', label: 'Coaching style & intensity', topic: TOPICS.preferences, required: false }
];

function nowIso() {
  return new Date().toISOString();
}

function defaultChecklist() {
  return CHECKLIST_ITEMS.map(item => ({
    ...item,
    status: 'unchecked',
    note: null
  }));
}

async function getActiveSession(userId) {
  const { data, error } = await supabase
    .from('trainer_intake_sessions')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'in_progress')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function createSession(userId) {
  const { data, error } = await supabase
    .from('trainer_intake_sessions')
    .insert({
      user_id: userId,
      status: 'in_progress',
      current_topic: TOPICS.goals
    })
    .select()
    .single();

  if (error) throw error;

  const checklist = defaultChecklist();
  const { error: checklistError } = await supabase
    .from('trainer_intake_checklist')
    .insert({
      session_id: data.id,
      items_json: checklist
    });

  if (checklistError) throw checklistError;

  // Seed first question
  const modelOutput = await generateNextQuestion({ checklist, transcript: [] });
  await updateSession(data.id, { current_topic: modelOutput.current_topic });
  await logEvent(data.id, 'assistant_message', {
    text: modelOutput.next_question,
    presentation: modelOutput.presentation || { style: 'focus_prompt', animate: 'word_by_word', replace_canvas: true }
  });
  await logEvent(data.id, 'progress_update', summarizeChecklist(checklist));

  return data;
}

async function getOrCreateSession(userId) {
  const active = await getActiveSession(userId);
  if (active) return active;
  return createSession(userId);
}

async function getSession(sessionId) {
  const { data, error } = await supabase
    .from('trainer_intake_sessions')
    .select('*')
    .eq('id', sessionId)
    .single();

  if (error) throw error;
  return data;
}

async function updateSession(sessionId, updates) {
  const { data, error } = await supabase
    .from('trainer_intake_sessions')
    .update({
      ...updates,
      updated_at: nowIso()
    })
    .eq('id', sessionId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function getChecklist(sessionId) {
  const { data, error } = await supabase
    .from('trainer_intake_checklist')
    .select('*')
    .eq('session_id', sessionId)
    .single();

  if (error) throw error;
  return data?.items_json || [];
}

async function updateChecklist(sessionId, nextItems) {
  const { data, error } = await supabase
    .from('trainer_intake_checklist')
    .update({
      items_json: nextItems,
      updated_at: nowIso()
    })
    .eq('session_id', sessionId)
    .select()
    .single();

  if (error) throw error;
  return data?.items_json || [];
}

async function getNextSequence(sessionId) {
  const { data, error } = await supabase
    .from('trainer_intake_events')
    .select('sequence_number')
    .eq('session_id', sessionId)
    .order('sequence_number', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return (data?.sequence_number || 0) + 1;
}

async function logEvent(sessionId, eventType, data) {
  const maxRetries = 5;
  let lastError = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const sequenceNumber = await getNextSequence(sessionId);
    const { data: event, error } = await supabase
      .from('trainer_intake_events')
      .insert({
        session_id: sessionId,
        sequence_number: sequenceNumber,
        event_type: eventType,
        data
      })
      .select()
      .single();

    if (!error) {
      return event;
    }

    if (error.code === '23505') {
      lastError = error;
      await new Promise(resolve => setTimeout(resolve, Math.random() * 50));
      continue;
    }

    throw error;
  }

  throw lastError;
}

async function getTranscript(sessionId, limit = 16) {
  const { data, error } = await supabase
    .from('trainer_intake_events')
    .select('*')
    .eq('session_id', sessionId)
    .in('event_type', ['assistant_message', 'user_answer'])
    .order('sequence_number', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data || []).reverse();
}

async function getLatestAssistantMessage(sessionId) {
  const { data, error } = await supabase
    .from('trainer_intake_events')
    .select('*')
    .eq('session_id', sessionId)
    .eq('event_type', 'assistant_message')
    .order('sequence_number', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data;
}

function summarizeChecklist(checklist) {
  const required = checklist.filter(item => item.required);
  const completedRequired = required.filter(item => item.status === 'checked' || item.status === 'skipped').length;
  const totalRequired = required.length;

  const byTopic = checklist.reduce((acc, item) => {
    acc[item.topic] = acc[item.topic] || { total: 0, done: 0 };
    acc[item.topic].total += 1;
    if (item.status !== 'unchecked') acc[item.topic].done += 1;
    return acc;
  }, {});

  return {
    required_done: completedRequired,
    required_total: totalRequired,
    topics: Object.entries(byTopic).map(([topic, info]) => ({
      topic,
      completed: info.done,
      total: info.total
    }))
  };
}

function extractJson(text) {
  if (!text) return null;
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch (error) {
    return null;
  }
}

async function generateNextQuestion({ checklist, transcript, questionCount = 0 }) {
  const missing = checklist.filter(item => item.status === 'unchecked');
  const requiredMissing = missing.filter(item => item.required);

  // Safety net: if we've asked too many questions, force completion
  if (questionCount >= MAX_QUESTIONS) {
    return {
      next_question: "Thanks for sharing all that information! I have what I need to get started.",
      current_topic: TOPICS.preferences,
      checklist_updates: requiredMissing.map(item => ({ item_id: item.id, status: 'skipped', note: 'Max questions reached' })),
      safety_flag: { triggered: false, message: '' },
      presentation: { style: 'focus_prompt', animate: 'word_by_word', replace_canvas: true },
      conversation_complete: true
    };
  }

  // NOTE: We don't check allRequiredComplete here because the checklist is stale.
  // The AI will analyze the user's answer, return checklist_updates, and we check
  // completion in handleAnswer AFTER applying updates.

  const transcriptText = transcript
    .map(event => {
      const role = event.event_type === 'assistant_message' ? 'Coach' : 'User';
      return `${role}: ${event.data?.text || ''}`;
    })
    .join('\n');

  // Show full checklist for context
  const checklistStatus = checklist.map(item => {
    const status = item.status === 'checked' ? '✓' : item.status === 'skipped' ? '⊘' : '○';
    return `${status} ${item.id}: ${item.label}${item.required ? ' (REQUIRED)' : ''}`;
  }).join('\n');

  const prompt = `You are a personal trainer conducting an intake interview.

FULL CHECKLIST STATUS (○=unchecked, ✓=checked, ⊘=skipped):
${checklistStatus}

ITEMS STILL NEEDED (unchecked):
${missing.length > 0 ? missing.map(item => `- ${item.id}: ${item.label}${item.required ? ' (REQUIRED)' : ''}`).join('\n') : 'NONE - all items complete'}

Required items still missing: ${requiredMissing.length > 0 ? requiredMissing.map(item => item.id).join(', ') : 'NONE'}

CONVERSATION:
${transcriptText}

IMPORTANT: Based on the user's LAST response, you MUST update the checklist. Look at what the user said and mark matching items as "checked".

Return ONLY JSON:
{
  "checklist_updates": [{"item_id": "goals_primary", "status": "checked", "note": "User said..."}],
  "next_question": "Your next question or closing statement",
  "current_topic": "${Object.values(TOPICS).join(' | ')}",
  "safety_flag": {"triggered": false, "message": ""},
  "conversation_complete": false,
  "presentation": {"style": "focus_prompt", "animate": "word_by_word", "replace_canvas": true}
}

RULES:
1. ALWAYS include checklist_updates - analyze the user's last message and mark items they answered.
2. Use the exact item_id from the checklist (e.g., "goals_primary", "motivation", "history_training").
3. If user's response covers multiple items, mark ALL of them.
4. Only ask about UNCHECKED items.
5. When all REQUIRED items are checked, set conversation_complete=true and make next_question a closing statement (NOT a question).
6. If red-flag symptoms mentioned, set safety_flag.triggered=true.`;

  const client = getAnthropicClient();
  const response = await client.messages.create({
    model: DEFAULT_MODEL,
    max_tokens: 512,
    system: [{ type: 'text', text: 'Return JSON only. Be thorough about marking checklist items as checked based on the conversation.' }],
    messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }]
  });

  const textBlock = response.content.find(block => block.type === 'text');
  const parsed = extractJson(textBlock?.text || '');

  if (!parsed?.next_question) {
    return {
      next_question: 'Thanks — anything else you want your coach to know before we finish intake?',
      current_topic: TOPICS.preferences,
      checklist_updates: [],
      safety_flag: { triggered: false, message: '' },
      presentation: { style: 'focus_prompt', animate: 'word_by_word', replace_canvas: true },
      conversation_complete: false
    };
  }

  return parsed;
}

function applyChecklistUpdates(checklist, updates = []) {
  if (!Array.isArray(updates) || updates.length === 0) return checklist;
  const mapped = checklist.map(item => {
    const match = updates.find(update => update.item_id === item.id);
    if (!match) return item;
    return {
      ...item,
      status: match.status || item.status,
      note: match.note || item.note
    };
  });
  return mapped;
}

async function handleAnswer({ sessionId, userId, answerText }) {
  await logEvent(sessionId, 'user_answer', { text: answerText });

  const checklist = await getChecklist(sessionId);
  const transcript = await getTranscript(sessionId);

  // Count how many questions have been asked so far
  const questionCount = transcript.filter(e => e.event_type === 'assistant_message').length;
  console.log(`[Intake] handleAnswer: questionCount=${questionCount}, answer="${answerText.substring(0, 50)}..."`);

  const modelOutput = await generateNextQuestion({ checklist, transcript, questionCount });
  console.log(`[Intake] AI returned: updates=${JSON.stringify(modelOutput.checklist_updates)}, complete=${modelOutput.conversation_complete}`);

  const nextChecklist = applyChecklistUpdates(checklist, modelOutput.checklist_updates || []);
  const savedChecklist = await updateChecklist(sessionId, nextChecklist);

  const progress = summarizeChecklist(savedChecklist);

  await updateSession(sessionId, { current_topic: modelOutput.current_topic });

  const assistantEvent = await logEvent(sessionId, 'assistant_message', {
    text: modelOutput.next_question,
    presentation: modelOutput.presentation || { style: 'focus_prompt', animate: 'word_by_word', replace_canvas: true }
  });

  await logEvent(sessionId, 'checklist_update', {
    updates: modelOutput.checklist_updates || []
  });

  await logEvent(sessionId, 'progress_update', progress);

  if (modelOutput.safety_flag?.triggered) {
    await logEvent(sessionId, 'safety_flag', modelOutput.safety_flag);
  }

  // Determine if conversation is complete
  // ONLY trust the AI's conversation_complete flag - it knows if there are follow-up questions
  // Don't auto-complete based on progress alone, as AI may want to ask optional questions
  const isComplete = modelOutput.conversation_complete === true;

  console.log(`[Intake] handleAnswer complete: progress=${progress.required_done}/${progress.required_total}, ai_complete=${modelOutput.conversation_complete}, isComplete=${isComplete}`);

  return {
    assistant: assistantEvent,
    checklist: savedChecklist,
    progress,
    safety: modelOutput.safety_flag || { triggered: false },
    conversation_complete: isComplete
  };
}

async function synthesizeSummary(sessionId) {
  const transcript = await getTranscript(sessionId, 200);
  const transcriptText = transcript
    .map(event => {
      const role = event.event_type === 'assistant_message' ? 'Coach' : 'User';
      return `${role}: ${event.data?.text || ''}`;
    })
    .join('\n');

  const prompt = `You are synthesizing an intake summary for a fitness coach. Return JSON only.\n\nTranscript:\n${transcriptText}\n\nReturn JSON:\n{\n  "goals": {"primary": "", "secondary": ""},\n  "motivation": "",\n  "history": {"training": "", "activity_level": ""},\n  "equipment": "",\n  "injuries": "",\n  "schedule": {"days_per_week": "", "minutes_per_session": "", "preferences": ""},\n  "preferences": {"likes": "", "dislikes": "", "coaching_style": ""},\n  "notes": ""\n}`;

  const client = getAnthropicClient();
  const response = await client.messages.create({
    model: DEFAULT_MODEL,
    max_tokens: 768,
    system: [{ type: 'text', text: 'Return JSON only.' }],
    messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }]
  });

  const textBlock = response.content.find(block => block.type === 'text');
  const parsed = extractJson(textBlock?.text || '');

  if (!parsed) {
    throw new Error('Failed to parse intake summary');
  }

  const { data: existing, error: fetchError } = await supabase
    .from('trainer_intake_summaries')
    .select('version')
    .eq('session_id', sessionId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (fetchError) throw fetchError;
  const version = (existing?.version || 0) + 1;

  const { data: summary, error } = await supabase
    .from('trainer_intake_summaries')
    .insert({
      session_id: sessionId,
      version,
      summary_json: parsed,
      created_at: nowIso()
    })
    .select()
    .single();

  if (error) throw error;
  return summary;
}

async function confirmSummary(sessionId) {
  const summary = await synthesizeSummary(sessionId);
  await updateSession(sessionId, { status: 'confirmed' });
  return summary;
}

async function editSummary(sessionId, changes) {
  const { data: latest, error } = await supabase
    .from('trainer_intake_summaries')
    .select('*')
    .eq('session_id', sessionId)
    .order('version', { ascending: false })
    .limit(1)
    .single();

  if (error) throw error;

  const nextSummary = {
    ...latest.summary_json,
    ...changes
  };

  const nextVersion = (latest.version || 0) + 1;
  const { data: saved, error: saveError } = await supabase
    .from('trainer_intake_summaries')
    .insert({
      session_id: sessionId,
      version: nextVersion,
      summary_json: nextSummary,
      created_at: nowIso()
    })
    .select()
    .single();

  if (saveError) throw saveError;
  return saved;
}

async function getLatestSummary(sessionId) {
  const { data, error } = await supabase
    .from('trainer_intake_summaries')
    .select('*')
    .eq('session_id', sessionId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data;
}

// MARK: - Structured Intake (new screen-by-screen flow)

async function submitStructuredIntake(userId, intakeData) {
  const row = {
    user_id: userId,
    name: intakeData.name || null,
    birthday: intakeData.birthday || null,
    gender: intakeData.gender || null,
    goals: intakeData.goals || null,
    timeline: intakeData.timeline || null,
    experience_level: intakeData.experience_level || null,
    frequency: intakeData.frequency || null,
    current_routine: intakeData.current_routine || null,
    past_attempts: intakeData.past_attempts || null,
    hobby_sports: intakeData.hobby_sports || null,
    height_inches: intakeData.height_inches || null,
    weight_lbs: intakeData.weight_lbs || null,
    body_comp: intakeData.body_comp || null,
    physical_baseline: intakeData.physical_baseline || null,
    mobility: intakeData.mobility || null,
    injuries: intakeData.injuries || null,
    health_nuances: intakeData.health_nuances || null,
    supplements: intakeData.supplements || null,
    activity_level: intakeData.activity_level || null,
    sleep: intakeData.sleep || null,
    nutrition: intakeData.nutrition || null,
    environment: intakeData.environment || null,
    movement_prefs: intakeData.movement_prefs || null,
    coaching_style: intakeData.coaching_style || null,
    anything_else: intakeData.anything_else || null,
    status: 'submitted'
  };

  const { data, error } = await supabase
    .from('trainer_structured_intake')
    .insert(row)
    .select()
    .single();

  if (error) throw error;

  // Sync profile fields (sex/dob) to app_user
  const profileUpdates = {};
  if (intakeData.gender) {
    const genderMap = { male: 'male', female: 'female', m: 'male', f: 'female' };
    profileUpdates.sex = genderMap[intakeData.gender.toLowerCase()] || 'unspecified';
  }
  if (intakeData.birthday) profileUpdates.dob = intakeData.birthday;

  if (Object.keys(profileUpdates).length > 0) {
    await supabase
      .from('app_user')
      .update({ ...profileUpdates, updated_at: new Date().toISOString() })
      .eq('user_id', userId);
  }

  // Sync body measurements to trainer_measurements
  const { logMeasurement } = require('./trainerMeasurements.service');
  const now = new Date().toISOString();

  if (intakeData.height_inches) {
    const heightCm = Math.round(intakeData.height_inches * 2.54);
    await logMeasurement(userId, {
      measurement_type: 'height',
      value: heightCm,
      unit: 'cm',
      measured_at: now,
      source: 'onboarding'
    });
  }

  if (intakeData.weight_lbs) {
    const weightKg = Math.round(intakeData.weight_lbs * 0.453592 * 10) / 10;
    await logMeasurement(userId, {
      measurement_type: 'weight',
      value: weightKg,
      unit: 'kg',
      measured_at: now,
      source: 'onboarding'
    });
  }

  return data;
}

async function getLatestStructuredIntake(userId) {
  const { data, error } = await supabase
    .from('trainer_structured_intake')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data;
}

module.exports = {
  getOrCreateSession,
  getSession,
  updateSession,
  getChecklist,
  logEvent,
  handleAnswer,
  confirmSummary,
  editSummary,
  getLatestSummary,
  getLatestAssistantMessage,
  submitStructuredIntake,
  getLatestStructuredIntake
};
