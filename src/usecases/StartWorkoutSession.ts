import {
  ForbiddenError,
  NotFoundError,
  WorkoutPlanNotActiveError,
  WorkoutSessionAlreadyStartedError,
} from "../errors/index.js";
import { prisma } from "../lib/db.js";

export interface InputDto {
  userId: string;
  workoutPlanId: string;
  workoutDayId: string;
}

export interface OutputDto {
  userWorkoutSessionId: string;
}

export class StartWorkoutSession {
  async execute(dto: InputDto): Promise<OutputDto> {
    return prisma.$transaction(async (tx) => {
      const workoutDay = await tx.workoutDay.findUnique({
        where: {
          id: dto.workoutDayId,
        },
        include: {
          workouPlan: true,
        },
      });

      if (!workoutDay) {
        throw new NotFoundError("Workout day not found");
      }

      if (workoutDay.workoutPlanId !== dto.workoutPlanId) {
        throw new NotFoundError("Workout day not found");
      }

      if (workoutDay.workouPlan.userId !== dto.userId) {
        throw new ForbiddenError("User is not allowed to start this session");
      }

      if (!workoutDay.workouPlan.isActive) {
        throw new WorkoutPlanNotActiveError("Workout plan is not active");
      }

      const existingSession = await tx.workoutSession.findFirst({
        where: {
          workoutDayId: workoutDay.id,
        },
      });

      if (existingSession) {
        throw new WorkoutSessionAlreadyStartedError(
          "Workout session already started",
        );
      }

      const workoutSession = await tx.workoutSession.create({
        data: {
          workoutDayId: workoutDay.id,
          startedAt: new Date(),
        },
      });

      return {
        userWorkoutSessionId: workoutSession.id,
      };
    });
  }
}
