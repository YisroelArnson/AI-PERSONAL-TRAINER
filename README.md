# AI-PERSONAL-TRAINER
An AI powered personal trainer app

// Alternate Zod schema for exercise recommendations (for testing)
const AlternateExerciseRecommendationSchema = z.object({
  recommendations: z.array(
    z.object({
      exercise_name: z.string(),
      aliases: z.array(z.string()).optional(),
      duration_min: z.number().int().nonnegative().optional(),
      reps: z.array(z.number().int().positive()).optional(),
      load_kg_each: z.array(z.number().nonnegative()).optional(),
      distance_km: z.number().nonnegative().optional(),
      intervals: z.array(
        z.object({
          work_sec: z.number().int().positive().optional(),
          rest_sec: z.number().int().positive().optional()
        })
      ).optional(),
      rounds: z.number().int().nonnegative().optional(),
      muscles_utilized: z.array(
        z.object({
          muscle: z.string(),
          share: z.number().min(0).max(1)
        })
      ).refine(
        (muscles) => {
          if (muscles.length === 0) return true;
          const totalShare = muscles.reduce((sum, m) => sum + m.share, 0);
          return Math.abs(totalShare - 1.0) < 0.01;
        },
        { message: "Muscle shares must add up to 1.0" }
      ),
      goals_addressed: z.array(z.string()),
      reasoning: z.string(),
      equiptment: z.array(z.string()).optional(),
      movement_pattern: z.array(
        z.enum([
          "squat",
          "hinge",
          "push",
          "pull",
          "carry",
          "rotation_core",
          "isolation",
          "conditioning"
        ])
      ).optional(),
      exercise_description: z.string().optional(),
      body_region: z.string().optional()
    })