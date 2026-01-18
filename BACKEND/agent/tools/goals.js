// BACKEND/agent/tools/goals.js
// Goal management tools
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_PUBLIC_URL,
  process.env.SUPABASE_SECRET_KEY
);

const goalTools = {
  set_goals: {
    description: 'Set or update category and/or muscle training goals for the user.',
    statusMessage: {
      start: 'Updating your goals...',
      done: 'Goals updated'
    },
    parameters: {
      type: 'object',
      properties: {
        category_goals: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              category: { type: 'string', description: 'Category name' },
              weight: { type: 'number', description: 'Priority weight (-10 to 10)' }
            },
            required: ['category', 'weight']
          },
          description: 'Array of category goals to set'
        },
        muscle_goals: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              muscle: { type: 'string', description: 'Muscle name' },
              weight: { type: 'number', description: 'Priority weight (-10 to 10)' }
            },
            required: ['muscle', 'weight']
          },
          description: 'Array of muscle goals to set'
        }
      }
    },
    execute: async (args, context) => {
      const { userId } = context;
      const results = { category_goals: [], muscle_goals: [] };

      // Update category goals
      if (args.category_goals && args.category_goals.length > 0) {
        for (const goal of args.category_goals) {
          const { data, error } = await supabase
            .from('user_category_and_weight')
            .upsert({
              user_id: userId,
              category: goal.category,
              weight: Math.max(-10, Math.min(10, goal.weight))
            }, {
              onConflict: 'user_id,category'
            })
            .select()
            .single();

          if (!error) {
            results.category_goals.push({ category: goal.category, weight: goal.weight });
          }
        }
      }

      // Update muscle goals
      if (args.muscle_goals && args.muscle_goals.length > 0) {
        for (const goal of args.muscle_goals) {
          const { data, error } = await supabase
            .from('user_muscle_and_weight')
            .upsert({
              user_id: userId,
              muscle: goal.muscle,
              weight: Math.max(-10, Math.min(10, goal.weight))
            }, {
              onConflict: 'user_id,muscle'
            })
            .select()
            .single();

          if (!error) {
            results.muscle_goals.push({ muscle: goal.muscle, weight: goal.weight });
          }
        }
      }

      return {
        success: true,
        updated: results
      };
    },
    formatResult: (result) => {
      const parts = [];
      if (result.updated.category_goals.length > 0) {
        parts.push(`Categories: ${result.updated.category_goals.map(g => `${g.category}(${g.weight})`).join(', ')}`);
      }
      if (result.updated.muscle_goals.length > 0) {
        parts.push(`Muscles: ${result.updated.muscle_goals.map(g => `${g.muscle}(${g.weight})`).join(', ')}`);
      }
      return `Updated goals - ${parts.join('; ')}`;
    }
  }
};

module.exports = { goalTools };
