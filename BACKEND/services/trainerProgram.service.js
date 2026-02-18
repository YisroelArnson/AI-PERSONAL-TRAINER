const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const { getAnthropicClient } = require('./modelProviders.service');

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_PUBLIC_URL,
  process.env.SUPABASE_SECRET_KEY
);

const DEFAULT_MODEL = process.env.PROGRAM_MODEL || process.env.PRIMARY_MODEL || 'claude-haiku-4-5';

function nowIso() {
  return new Date().toISOString();
}

async function fetchLatestIntakeSummary(userId) {
  const { data, error } = await supabase
    .from('trainer_structured_intake')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

async function fetchLatestAssessmentBaseline(userId) {
  const { data, error } = await supabase
    .from('trainer_assessment_baselines')
    .select('baseline_json, trainer_assessment_sessions!inner(user_id)')
    .eq('trainer_assessment_sessions.user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data?.baseline_json || null;
}

async function fetchApprovedGoal(userId) {
  const { data, error } = await supabase
    .from('trainer_goal_contracts')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'approved')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data?.contract_json || null;
}

const PROGRAM_SYSTEM_PROMPT = `You are an expert strength & conditioning coach and exercise physiologist. You design evidence-based training programs grounded in these principles:

EXERCISE SCIENCE FOUNDATIONS:
- Progressive overload: systematically increase training stimulus over time (load, volume, or intensity)
- Specificity: training adaptations are specific to the movement patterns, energy systems, and muscle groups trained
- Recovery & supercompensation: adaptation occurs during rest, not during training. Adequate recovery between sessions is essential
- Periodization: organize training into phases (accumulation, intensification, deload) to manage fatigue and drive long-term progress
- Individual variation: program variables must respect the client's training age, injury history, schedule, and recovery capacity
- Minimum effective dose: prescribe the least volume needed to drive adaptation — more is not always better

SAFETY PRINCIPLES:
- Never prescribe exercises contraindicated by the client's reported injuries or health conditions
- Always include warm-up protocols that prepare the specific joints and tissues for the session
- Include cool-down / mobility work to support recovery
- Flag any exercises that require coaching supervision for beginners
- When in doubt, regress to a safer variation
- Include clear RPE (Rate of Perceived Exertion) or intensity guidelines so the client can self-regulate

You output training programs as structured markdown documents. Return ONLY the markdown content, no code fences or extra text.`;

const PROGRAM_MARKDOWN_TEMPLATE = `Use this exact markdown structure with these sections in order. Be specific and detailed — this is the client's training guide.

IMPORTANT for Training Sessions: Do NOT lock in specific exercises. Instead, for each session day, provide movement CATEGORIES and example exercises. The actual workout will be generated on the fly based on constraints like location, time, energy, and equipment available that day.

# Your Training Program
[2-3 sentence overview of the program]

# Goals
**Primary goal:** [primary goal]
**Secondary goal:** [secondary goal or omit]
**Timeline:** [N] weeks

**How we measure progress:**
- [measurable indicator 1]
- [measurable indicator 2]

# Weekly Structure
You will train **[N] days per week**.
[Split description]

**Rest days:** [rest day guidance]

# Training Sessions
## Day 1: [Session Name]
*[duration] minutes — [intensity] intensity*

[Session goal in one sentence]

**Warm-up:**
- [warm-up item]

**Movement focus:**
- **[Movement Category]** — [example exercises]
  [sets x reps]
  *[RPE and intensity guide. Rest time.]*

**Cool-down:**
- [cool-down item]

[Repeat ## Day N for each session]

# Progression Plan
[Overall progression strategy]

**[Phase Name]** (weeks [range])
[Phase description]

**Deload protocol:** [deload trigger and protocol]

# Current Phase
**[Phase Name]** — Week 1 of [N]
- Rep range: [range]
- Intensity: [level] (RPE [range])
- Volume: [sets per muscle group per week]

# Available Phases
1. [Phase] ([rep range], [intensity], [duration])
2. [Phase] ([rep range], [intensity], [duration])
3. Deload ([rep range], low intensity, 1 week)

# Exercise Rules
**Prefer:** [preferred movement types, equipment]
**Avoid:** [movements to avoid with reasons]
**Always include:** [mandatory exercises with reasons]

# Recovery
**Sleep:** [sleep recommendation]
**Nutrition:** [nutrition guidance]
**Active recovery:** [off-day activities]

- [recovery tip]

# Safety Guidelines
[General safety approach]

**Movements to avoid or modify:**
- [contraindication with alternative]

**Stop and reassess if:**
- [warning sign]

# Coach Notes
> [Personalized observation from intake]
> [Another observation]

# Milestones
- [ ] [Milestone 1]
- [ ] [Milestone 2]

# Scheduling Recommendations
- [Scheduling suggestion]`;

async function draftProgram(userId) {
  console.log(`[program] Starting draft for user ${userId}`);
  const t0 = Date.now();

  const intake = await fetchLatestIntakeSummary(userId);
  console.log(`[program] Fetched intake: ${intake ? 'yes' : 'missing'} (${Date.now() - t0}ms)`);

  const baseline = await fetchLatestAssessmentBaseline(userId);
  console.log(`[program] Fetched baseline: ${baseline ? 'yes' : 'missing'} (${Date.now() - t0}ms)`);

  const goals = await fetchApprovedGoal(userId);
  console.log(`[program] Fetched goals: ${goals ? 'yes' : 'missing'} (${Date.now() - t0}ms)`);

  const prompt = `Design a personalized training program for this client. Output the program as a markdown document.

CLIENT DATA:
${JSON.stringify(intake, null, 2)}

ASSESSMENT BASELINE:
${JSON.stringify(baseline, null, 2)}

APPROVED GOALS:
${JSON.stringify(goals, null, 2)}

${PROGRAM_MARKDOWN_TEMPLATE}

Return ONLY the markdown document. No code fences, no preamble, no explanation — just the program markdown starting with "# Your Training Program".`;

  console.log(`[program] Calling Claude (${DEFAULT_MODEL}, max_tokens=16384)...`);
  const tApi = Date.now();

  const client = getAnthropicClient();
  const response = await client.messages.create({
    model: DEFAULT_MODEL,
    max_tokens: 16384,
    system: [{ type: 'text', text: PROGRAM_SYSTEM_PROMPT }],
    messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }]
  });

  const apiMs = Date.now() - tApi;
  console.log(`[program] Claude responded in ${apiMs}ms — stop_reason=${response.stop_reason}, usage: input=${response.usage?.input_tokens} output=${response.usage?.output_tokens}`);

  if (response.stop_reason === 'max_tokens') {
    console.error('[program] Response truncated — hit max_tokens limit');
    throw new Error('Program generation was too long and got cut off. Please try again.');
  }

  const textBlock = response.content.find(block => block.type === 'text');
  let markdown = (textBlock?.text || '').trim();
  console.log(`[program] Raw response length: ${markdown.length} chars`);

  // Strip code fences if the model wrapped the output
  if (markdown.startsWith('```')) {
    markdown = markdown.replace(/^```(?:markdown)?\n?/, '').replace(/\n?```$/, '').trim();
  }

  if (!markdown || !markdown.includes('# ')) {
    console.error('[program] Invalid markdown. First 500 chars:', markdown.slice(0, 500));
    throw new Error('Failed to generate program markdown');
  }

  console.log(`[program] Markdown OK — ${(markdown.match(/^## /gm) || []).length} session days`);

  const { data, error } = await supabase
    .from('trainer_programs')
    .insert({
      user_id: userId,
      status: 'draft',
      version: 1,
      program_markdown: markdown,
      created_at: nowIso(),
      updated_at: nowIso()
    })
    .select()
    .single();

  if (error) {
    console.error(`[program] DB insert failed:`, error.message);
    throw error;
  }

  await supabase.from('trainer_program_events').insert({
    program_id: data.id,
    event_type: 'draft',
    data: { markdown_length: markdown.length }
  });

  console.log(`[program] Draft saved — id=${data.id}, total time ${Date.now() - t0}ms`);
  return data;
}

async function editProgram(programId, instruction) {
  const { data: existing, error } = await supabase
    .from('trainer_programs')
    .select('*')
    .eq('id', programId)
    .single();

  if (error) throw error;

  const prompt = `Apply this edit to the training program markdown. Preserve all sections and structure. Return ONLY the updated markdown, no code fences or explanation.

EDIT INSTRUCTION: ${instruction}

CURRENT PROGRAM:
${existing.program_markdown}

Return the complete updated program markdown with the edit applied.`;

  const client = getAnthropicClient();
  const response = await client.messages.create({
    model: DEFAULT_MODEL,
    max_tokens: 16384,
    system: [{ type: 'text', text: PROGRAM_SYSTEM_PROMPT }],
    messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }]
  });

  const textBlock = response.content.find(block => block.type === 'text');
  let updatedMarkdown = (textBlock?.text || '').trim();

  // Strip code fences if the model wrapped the output
  if (updatedMarkdown.startsWith('```')) {
    updatedMarkdown = updatedMarkdown.replace(/^```(?:markdown)?\n?/, '').replace(/\n?```$/, '').trim();
  }

  if (!updatedMarkdown || !updatedMarkdown.includes('# ')) {
    console.error('Failed to parse edited program. First 500 chars:', updatedMarkdown.slice(0, 500));
    throw new Error('Failed to parse edited program');
  }

  const nextVersion = (existing.version || 0) + 1;
  const { data, error: updateError } = await supabase
    .from('trainer_programs')
    .update({
      program_markdown: updatedMarkdown,
      version: nextVersion,
      updated_at: nowIso()
    })
    .eq('id', programId)
    .select()
    .single();

  if (updateError) throw updateError;
  await supabase.from('trainer_program_events').insert({
    program_id: programId,
    event_type: 'edit',
    data: { instruction, markdown_length: updatedMarkdown.length }
  });

  return data;
}

async function approveProgram(programId) {
  const { data, error } = await supabase
    .from('trainer_programs')
    .update({
      status: 'approved',
      approved_at: nowIso(),
      updated_at: nowIso()
    })
    .eq('id', programId)
    .select()
    .single();

  if (error) throw error;
  await supabase.from('trainer_program_events').insert({
    program_id: programId,
    event_type: 'approve',
    data: { approved_at: nowIso() }
  });
  return data;
}

async function activateProgram(programId) {
  const { data: program, error } = await supabase
    .from('trainer_programs')
    .update({
      status: 'active',
      active_from: nowIso(),
      updated_at: nowIso()
    })
    .eq('id', programId)
    .select()
    .single();

  if (error) throw error;

  await supabase
    .from('trainer_active_program')
    .upsert({
      user_id: program.user_id,
      program_id: program.id,
      program_version: program.version,
      updated_at: nowIso()
    });

  await supabase.from('trainer_program_events').insert({
    program_id: programId,
    event_type: 'activate',
    data: { activated_at: nowIso() }
  });

  return program;
}

async function getProgram(programId) {
  const { data, error } = await supabase
    .from('trainer_programs')
    .select('*')
    .eq('id', programId)
    .single();
  if (error) throw error;
  return data;
}

async function getActiveProgram(userId) {
  const { data: activeRef, error: refError } = await supabase
    .from('trainer_active_program')
    .select('program_id')
    .eq('user_id', userId)
    .maybeSingle();

  if (refError || !activeRef) return null;

  const { data: program, error: progError } = await supabase
    .from('trainer_programs')
    .select('*')
    .eq('id', activeRef.program_id)
    .single();

  if (progError) return null;
  return program;
}

module.exports = {
  draftProgram,
  editProgram,
  approveProgram,
  activateProgram,
  getProgram,
  getActiveProgram
};
