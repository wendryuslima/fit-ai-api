import { ForbiddenError, NotFoundError } from "../errors/index.js";
import { prisma } from "../lib/db.js";

export interface InputDto {
  userId: string;
  workoutPlanId: string;
  workoutDayId: string;
  workoutSessionId: string;
  completedAt: Date;
}

export interface OutputDto {
  id: string;
  completedAt: Date;
  startedAt: Date;
}

export class UpdateWorkoutSession {
  async execute(dto: InputDto): Promise<OutputDto> {
    return prisma.$transaction(async (tx) => {
      const workoutSession = await tx.workoutSession.findUnique({
        where: {
          id: dto.workoutSessionId,
        },
        include: {
          workoutDay: {
            include: {
              workouPlan: true,
            },
          },
        },
      });

      if (!workoutSession) {
        throw new NotFoundError("Workout session not found");
      }

      if (workoutSession.workoutDayId !== dto.workoutDayId) {
        throw new NotFoundError("Workout session not found");
      }

      if (workoutSession.workoutDay.workoutPlanId !== dto.workoutPlanId) {
        throw new NotFoundError("Workout session not found");
      }

      if (workoutSession.workoutDay.workouPlan.userId !== dto.userId) {
        throw new ForbiddenError("User is not allowed to update this session");
      }

      const updatedSession = await tx.workoutSession.update({
        where: {
          id: workoutSession.id,
        },
        data: {
          completedAt: dto.completedAt,
        },
      });

      return {
        id: updatedSession.id,
        completedAt: updatedSession.completedAt ?? dto.completedAt,
        startedAt: updatedSession.startedAt,
      };
    });
  }
}
