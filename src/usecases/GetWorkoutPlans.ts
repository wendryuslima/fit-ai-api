import { WeekDay } from "../generated/prisma/enums.js";
import { prisma } from "../lib/db.js";

export interface InputDto {
  userId: string;
  active?: boolean;
}

export interface OutputDtoItem {
  id: string;
  name: string;
  isActive: boolean;
  workoutDays: Array<{
    id: string;
    workoutPlanId: string;
    name: string;
    isRest: boolean;
    coverImageUrl?: string;
    estimatedDurationInSeconds: number;
    weekDay: WeekDay;
    exercises: Array<{
      id: string;
      workoutDayId: string;
      order: number;
      name: string;
      sets: number;
      reps: number;
      restTimeInSeconds: number;
    }>;
  }>;
}

export type OutputDto = OutputDtoItem[];

export class GetWorkoutPlans {
  async execute(dto: InputDto): Promise<OutputDto> {
    const workoutPlans = await prisma.workoutPlan.findMany({
      where: {
        userId: dto.userId,
        ...(dto.active === undefined ? {} : { isActive: dto.active }),
      },
      include: {
        workoutDays: {
          include: {
            exercises: {
              orderBy: {
                order: "asc",
              },
            },
          },
          orderBy: {
            createdAt: "asc",
          },
        },
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    return workoutPlans.map((workoutPlan) => ({
      id: workoutPlan.id,
      name: workoutPlan.name,
      isActive: workoutPlan.isActive,
      workoutDays: workoutPlan.workoutDays.map((workoutDay) => ({
        id: workoutDay.id,
        workoutPlanId: workoutDay.workoutPlanId,
        name: workoutDay.name,
        isRest: workoutDay.isRest,
        coverImageUrl: workoutDay.coverImageUrl ?? undefined,
        estimatedDurationInSeconds: workoutDay.estimatedDurationInSeconds,
        weekDay: workoutDay.weekDay,
        exercises: workoutDay.exercises.map((exercise) => ({
          id: exercise.id,
          workoutDayId: exercise.workoutDayId,
          order: exercise.order,
          name: exercise.name,
          sets: exercise.sets,
          reps: exercise.reps,
          restTimeInSeconds: exercise.restTimeInSeconds,
        })),
      })),
    }));
  }
}
