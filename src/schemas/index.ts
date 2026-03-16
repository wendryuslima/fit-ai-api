import z from "zod";

import { WeekDay } from "../generated/prisma/enums.js";

export const ErrorSchema = z.object({
  error: z.string(),
  code: z.string(),
});

export const WorkoutPlan = z.object({
  id: z.uuid(),
  name: z.string().trim().min(1),
  workoutDays: z.array(
    z.object({
      name: z.string().trim().min(1),
      weekDay: z.enum(WeekDay),
      isRest: z.boolean().default(false),
      coverImageUrl: z.string().trim().min(1).optional(),
      estimatedDurationInSeconds: z.number().min(1),
      exercises: z.array(
        z.object({
          order: z.number().min(0),
          name: z.string().trim().min(1),
          sets: z.number().min(1),
          reps: z.number().min(1),
          restTimeInSeconds: z.number().min(1),
        }),
      ),
    }),
  ),
});

export const GetWorkoutPlanParams = z.object({
  id: z.uuid(),
});

export const GetWorkoutPlanQuery = z.object({}).strict();

export const GetWorkoutPlansQuery = z
  .object({
    active: z
      .preprocess((value) => {
        if (value === undefined) {
          return undefined;
        }

        if (value === "true") {
          return true;
        }

        if (value === "false") {
          return false;
        }

        return value;
      }, z.boolean().optional()),
  })
  .strict();

export const GetWorkoutPlansResponse = z.array(
  z.object({
    id: z.uuid(),
    name: z.string().trim().min(1),
    isActive: z.boolean(),
    workoutDays: z.array(
      z.object({
        id: z.uuid(),
        workoutPlanId: z.uuid(),
        name: z.string().trim().min(1),
        isRest: z.boolean(),
        coverImageUrl: z.string().trim().min(1).optional(),
        estimatedDurationInSeconds: z.number().min(1),
        weekDay: z.enum(WeekDay),
        exercises: z.array(
          z.object({
            id: z.uuid(),
            workoutDayId: z.uuid(),
            order: z.number().min(0),
            name: z.string().trim().min(1),
            sets: z.number().min(1),
            reps: z.number().min(1),
            restTimeInSeconds: z.number().min(1),
          }),
        ),
      }),
    ),
  }),
);

export const GetWorkoutPlanResponse = z.object({
  id: z.uuid(),
  name: z.string().trim().min(1),
  workoutDays: z.array(
    z.object({
      id: z.uuid(),
      weekDay: z.enum(WeekDay),
      name: z.string().trim().min(1),
      isRest: z.boolean(),
      coverImageUrl: z.string().trim().min(1).optional(),
      estimatedDurationInSeconds: z.number().min(1),
      exercisesCount: z.number().min(0),
    }),
  ),
});

export const GetWorkoutDayParams = z.object({
  workoutPlanId: z.uuid(),
  workoutDayId: z.uuid(),
});

export const GetWorkoutDayQuery = z.object({}).strict();

export const GetWorkoutDayResponse = z.object({
  id: z.uuid(),
  name: z.string().trim().min(1),
  isRest: z.boolean(),
  coverImageUrl: z.string().trim().min(1).optional(),
  estimatedDurationInSeconds: z.number().min(1),
  weekDay: z.enum(WeekDay),
  exercises: z.array(
    z.object({
      id: z.uuid(),
      workoutDayId: z.uuid(),
      order: z.number().min(0),
      name: z.string().trim().min(1),
      sets: z.number().min(1),
      reps: z.number().min(1),
      restTimeInSeconds: z.number().min(1),
    }),
  ),
  sessions: z.array(
    z.object({
      id: z.uuid(),
      workoutDayId: z.uuid(),
      startedAt: z.string().datetime(),
      completedAt: z.string().datetime().optional(),
    }),
  ),
}); 

export const StartWorkoutSessionBody = z.object({}).strict();

export const StartWorkoutSessionParams = z.object({
  workoutPlanId: z.uuid(),
  workoutDayId: z.uuid(),
});

export const StartWorkoutSessionQuery = z.object({}).strict();

export const StartWorkoutSessionResponse = z.object({
  userWorkoutSessionId: z.uuid(),
});

export const UpdateWorkoutSessionBody = z.object({
  completedAt: z.string().datetime(),
});

export const UpdateWorkoutSessionParams = z.object({
  workoutPlanId: z.uuid(),
  workoutDayId: z.uuid(),
  workoutSessionId: z.uuid(),
});

export const UpdateWorkoutSessionQuery = z.object({}).strict();

export const UpdateWorkoutSessionResponse = z.object({
  id: z.uuid(),
  completedAt: z.string().datetime(),
  startedAt: z.string().datetime(),
});

export const HomeParams = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const HomeQuery = z.object({}).strict();

export const HomeResponse = z.object({
  activeWorkoutPlanId: z.uuid(),
  todayWorkoutDay: z.object({
    workoutPlanId: z.uuid(),
    id: z.uuid(),
    name: z.string().trim().min(1),
    isRest: z.boolean(),
    weekDay: z.enum(WeekDay),
    estimatedDurationInSeconds: z.number().min(1),
    coverImageUrl: z.string().trim().min(1).optional(),
    exercisesCount: z.number().min(0),
  }),
  workoutStreak: z.number().min(0),
  consistencyByDay: z.record(
    z.iso.date(),
    z.object({
      workoutDayCompleted: z.boolean(),
      workoutDayStarted: z.boolean(),
    }),
  ),
});

export const StatsQuery = z
  .object({
    from: z.iso.date(),
    to: z.iso.date(),
  })
  .strict();

export const StatsResponse = z.object({
  workoutStreak: z.number().min(0),
  consistencyByDay: z.record(
    z.iso.date(),
    z.object({
      workoutDayCompleted: z.boolean(),
      workoutDayStarted: z.boolean(),
    }),
  ),
  completedWorkoutsCount: z.number().min(0),
  conclusionRate: z.number().min(0),
  totalTimeInSeconds: z.number().min(0),
});
