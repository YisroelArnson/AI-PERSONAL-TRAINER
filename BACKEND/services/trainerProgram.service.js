const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const { getAnthropicClient } = require('./modelProviders.service');

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_PUBLIC_URL,
  process.env.SUPABASE_SECRET_KEY
);

const DEFAULT_MODEL = process.env.PRIMARY_MODEL || 'claude-haiku-4-5';

function nowIso() {
  return new Date().toISOString();
}

async function fetchLatestIntakeSummary(userId) {
  // Try structured intake first (new flow)
  const { data: structured, error: sErr } = await supabase
    .from('trainer_structured_intake')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!sErr && structured) return structured;

  // Fall back to old conversational intake summaries
  const { data, error } = await supabase
    .from('trainer_intake_summaries')
    .select('summary_json, trainer_intake_sessions!inner(user_id)')
    .eq('trainer_intake_sessions.user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data?.summary_json || null;
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

Return JSON only.`;

function programToMarkdown(p) {
  const lines = [];

  // Program Overview
  if (p.overview) {
    lines.push('# Your Training Program');
    lines.push('');
    lines.push(p.overview);
    lines.push('');
  }

  // Goals
  if (p.goals) {
    lines.push('# Goals');
    lines.push('');
    lines.push(`**Primary goal:** ${p.goals.primary || ''}`);
    if (p.goals.secondary) lines.push(`**Secondary goal:** ${p.goals.secondary}`);
    lines.push(`**Timeline:** ${p.goals.timeline_weeks || '?'} weeks`);
    if (p.goals.metrics?.length) {
      lines.push('');
      lines.push('**How we measure progress:**');
      p.goals.metrics.forEach(m => lines.push(`- ${m}`));
    }
    lines.push('');
  }

  // Weekly Structure
  if (p.weekly_structure) {
    const ws = p.weekly_structure;
    lines.push('# Weekly Structure');
    lines.push('');
    lines.push(`You will train **${ws.days_per_week || '?'} days per week**.`);
    if (ws.split_description) lines.push(ws.split_description);
    if (ws.rest_day_guidance) lines.push('');
    if (ws.rest_day_guidance) lines.push(`**Rest days:** ${ws.rest_day_guidance}`);
    lines.push('');
  }

  // Sessions
  if (p.sessions?.length) {
    lines.push('# Training Sessions');
    lines.push('');
    p.sessions.forEach((s, i) => {
      lines.push(`## Day ${i + 1}: ${s.name}`);
      lines.push(`*${s.duration_min} minutes — ${s.intensity || 'moderate'} intensity*`);
      lines.push('');
      if (s.session_goal) {
        lines.push(s.session_goal);
        lines.push('');
      }

      // Warm-up
      if (s.warm_up?.length) {
        lines.push('**Warm-up:**');
        s.warm_up.forEach(w => lines.push(`- ${w}`));
        lines.push('');
      }

      // Movement categories
      if (s.movement_categories?.length) {
        lines.push('**Movement focus:**');
        s.movement_categories.forEach(cat => {
          lines.push(`- **${cat.category}** — ${cat.examples?.join(', ') || ''}`);
          if (cat.sets_reps) lines.push(`  ${cat.sets_reps}`);
          if (cat.intensity_guide) lines.push(`  *${cat.intensity_guide}*`);
        });
        lines.push('');
      }

      // Cool-down
      if (s.cool_down?.length) {
        lines.push('**Cool-down:**');
        s.cool_down.forEach(c => lines.push(`- ${c}`));
        lines.push('');
      }
    });
  }

  // Progression Plan
  if (p.progression) {
    lines.push('# Progression Plan');
    lines.push('');
    if (p.progression.strategy) lines.push(p.progression.strategy);
    lines.push('');
    if (p.progression.phases?.length) {
      p.progression.phases.forEach(phase => {
        lines.push(`**${phase.name}** (weeks ${phase.weeks})`);
        lines.push(phase.description);
        lines.push('');
      });
    }
    if (p.progression.deload) {
      lines.push(`**Deload protocol:** ${p.progression.deload}`);
      lines.push('');
    }
  }

  // Recovery
  if (p.recovery) {
    lines.push('# Recovery');
    lines.push('');
    if (p.recovery.sleep) lines.push(`**Sleep:** ${p.recovery.sleep}`);
    if (p.recovery.nutrition) lines.push(`**Nutrition:** ${p.recovery.nutrition}`);
    if (p.recovery.active_recovery) lines.push(`**Active recovery:** ${p.recovery.active_recovery}`);
    if (p.recovery.tips?.length) {
      lines.push('');
      p.recovery.tips.forEach(t => lines.push(`- ${t}`));
    }
    lines.push('');
  }

  // Safety & Guardrails
  if (p.safety) {
    lines.push('# Safety Guidelines');
    lines.push('');
    if (p.safety.general) lines.push(p.safety.general);
    if (p.safety.contraindications?.length) {
      lines.push('');
      lines.push('**Movements to avoid or modify:**');
      p.safety.contraindications.forEach(c => lines.push(`- ${c}`));
    }
    if (p.safety.warning_signs?.length) {
      lines.push('');
      lines.push('**Stop and reassess if:**');
      p.safety.warning_signs.forEach(w => lines.push(`- ${w}`));
    }
    lines.push('');
  }

  // Coach Notes
  if (p.coach_notes?.length) {
    lines.push('# Coach Notes');
    lines.push('');
    p.coach_notes.forEach(n => lines.push(`> ${n}`));
    lines.push('');
  }

  return lines.join('\n');
}

async function draftProgram(userId) {
  const intake = await fetchLatestIntakeSummary(userId);
  const baseline = await fetchLatestAssessmentBaseline(userId);
  const goals = await fetchApprovedGoal(userId);

  const prompt = `Design a personalized training program for this client.

CLIENT DATA:
${JSON.stringify(intake, null, 2)}

ASSESSMENT BASELINE:
${JSON.stringify(baseline, null, 2)}

APPROVED GOALS:
${JSON.stringify(goals, null, 2)}

Return a JSON object with this structure. Be specific and detailed — this is the client's training guide.

IMPORTANT for sessions: Do NOT lock in specific exercises. Instead, for each session, provide movement CATEGORIES and example exercises. The actual workout will be generated on the fly based on constraints like location, time, energy, and equipment available that day.

{
  "overview": "A 2-3 sentence summary of the program — what it is, who it's for, and the training philosophy behind it.",
  "goals": {
    "primary": "Primary goal statement",
    "secondary": "Secondary goal or empty string",
    "timeline_weeks": 12,
    "metrics": ["Measurable progress indicators"]
  },
  "weekly_structure": {
    "days_per_week": 4,
    "split_description": "Description of the training split (e.g., upper/lower, push/pull/legs, full body)",
    "rest_day_guidance": "What to do on rest days"
  },
  "sessions": [
    {
      "name": "Session name (e.g., Upper Push + Core)",
      "duration_min": 50,
      "intensity": "moderate / hard / light",
      "session_goal": "What this session aims to accomplish in one sentence",
      "warm_up": ["5 min light cardio", "Arm circles, band pull-aparts"],
      "movement_categories": [
        {
          "category": "Horizontal Push",
          "examples": ["Bench press", "Push-ups", "Dumbbell floor press"],
          "sets_reps": "3-4 sets of 8-12 reps",
          "intensity_guide": "RPE 7-8. Last 1-2 reps should be challenging but doable with good form."
        }
      ],
      "cool_down": ["5 min static stretching — chest, shoulders, triceps"]
    }
  ],
  "progression": {
    "strategy": "How the client should progress week to week (load, volume, density, etc.)",
    "phases": [
      {
        "name": "Phase name",
        "weeks": "1-4",
        "description": "What changes in this phase and why"
      }
    ],
    "deload": "When and how to deload"
  },
  "recovery": {
    "sleep": "Sleep recommendation based on training load",
    "nutrition": "Basic nutrition guidance relevant to their goals",
    "active_recovery": "What to do on off days",
    "tips": ["Specific recovery tips based on their training"]
  },
  "safety": {
    "general": "Overall safety approach for this client",
    "contraindications": ["Movements to avoid based on their injuries/health"],
    "warning_signs": ["Signs they should stop and reassess"]
  },
  "coach_notes": ["Personalized coaching observations — things you noticed from their intake that inform the program"]
}`;

  const client = getAnthropicClient();
  const response = await client.messages.create({
    model: DEFAULT_MODEL,
    max_tokens: 4096,
    system: [{ type: 'text', text: PROGRAM_SYSTEM_PROMPT }],
    messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }]
  });

  const textBlock = response.content.find(block => block.type === 'text');
  const raw = textBlock?.text || '';
  const parsed = extractJson(raw);
  if (!parsed) {
    console.error('Failed to parse program. Raw response:', raw.slice(0, 500));
    throw new Error('Failed to parse program');
  }

  const markdown = programToMarkdown(parsed);

  const { data, error } = await supabase
    .from('trainer_programs')
    .insert({
      user_id: userId,
      status: 'draft',
      version: 1,
      program_json: parsed,
      program_markdown: markdown,
      created_at: nowIso(),
      updated_at: nowIso()
    })
    .select()
    .single();

  if (error) throw error;
  await supabase.from('trainer_program_events').insert({
    program_id: data.id,
    event_type: 'draft',
    data: parsed
  });

  return data;
}

async function editProgram(programId, instruction) {
  const { data: existing, error } = await supabase
    .from('trainer_programs')
    .select('*')
    .eq('id', programId)
    .single();

  if (error) throw error;

  const prompt = `Apply this edit to the training program. Keep the same JSON structure. Return JSON only.

EDIT INSTRUCTION: ${instruction}

CURRENT PROGRAM:
${JSON.stringify(existing.program_json, null, 2)}

Return the updated JSON with the edit applied. Maintain all the same fields and structure.`;

  const client = getAnthropicClient();
  const response = await client.messages.create({
    model: DEFAULT_MODEL,
    max_tokens: 4096,
    system: [{ type: 'text', text: PROGRAM_SYSTEM_PROMPT }],
    messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }]
  });

  const textBlock = response.content.find(block => block.type === 'text');
  const raw = textBlock?.text || '';
  const parsed = extractJson(raw);
  if (!parsed) {
    console.error('Failed to parse edited program. Raw response:', raw.slice(0, 500));
    throw new Error('Failed to parse edited program');
  }

  const nextVersion = (existing.version || 0) + 1;
  const updatedMarkdown = programToMarkdown(parsed);
  const { data, error: updateError } = await supabase
    .from('trainer_programs')
    .update({
      program_json: parsed,
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
    data: { instruction, program: parsed }
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

module.exports = {
  draftProgram,
  editProgram,
  approveProgram,
  activateProgram,
  getProgram
};
