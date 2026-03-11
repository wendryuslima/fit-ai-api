import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";

import { NotFoundError } from "../errors/index.js";
import { WeekDay } from "../generated/prisma/enums.js";
import { prisma } from "../lib/db.js";

dayjs.extend(utc);

const dateKeyFormat = "YYYY-MM-DD";
const weekDayByIndex: WeekDay[] = [
  "SUNDAY",
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
];

export interface InputDto {
  userId: string;
  date: string;
}

export interface OutputDto {
  activeWorkoutPlanId: string;
  todayWorkoutDay: {
    workoutPlanId: string;
    id: string;
    name: string;
    isRest: boolean;
    weekDay: WeekDay;
    estimatedDurationInSeconds: number;
    coverImageUrl?: string;
    exercisesCount: number;
  };
  workoutStreak: number;
  consistencyByDay: Record<
    string,
    {
      workoutDayCompleted: boolean;
      workoutDayStarted: boolean;
    }
  >;
}

export class GetHomeData {
  async execute(dto: InputDto): Promise<OutputDto> {
    const baseDate = dayjs.utc(dto.date).startOf("day");
    const weekStart = baseDate.startOf("week");
    const weekEnd = baseDate.endOf("week");

    const activePlan = await prisma.workoutPlan.findFirst({
      where: {
        userId: dto.userId,
        isActive: true,
      },
      include: {
        workoutDays: {
          include: {
            _count: {
              select: {
                exercises: true,
              },
            },
          },
        },
      },
    });

    if (!activePlan) {
      throw new NotFoundError("Active workout plan not found");
    }

    const dayIndex = baseDate.day();
    const weekDay = weekDayByIndex[dayIndex];
    const todayWorkoutDay = activePlan.workoutDays.find(
      (workoutDay) => workoutDay.weekDay === weekDay,
    );

    if (!todayWorkoutDay) {
      throw new NotFoundError("Workout day not found");
    }

    const sessionsInWeek = await prisma.workoutSession.findMany({
      where: {
        startedAt: {
          gte: weekStart.toDate(),
          lte: weekEnd.toDate(),
        },
        workoutDay: {
          workouPlan: {
            userId: dto.userId,
          },
        },
      },
      select: {
        startedAt: true,
        completedAt: true,
      },
    });

    const consistencyByDay: OutputDto["consistencyByDay"] = {};
    for (let offset = 0; offset < 7; offset += 1) {
      const dateKey = weekStart.add(offset, "day").format(dateKeyFormat);
      consistencyByDay[dateKey] = {
        workoutDayCompleted: false,
        workoutDayStarted: false,
      };
    }

    for (const session of sessionsInWeek) {
      const dateKey = dayjs.utc(session.startedAt).format(dateKeyFormat);
      const entry = consistencyByDay[dateKey];
      if (!entry) {
        continue;
      }
      entry.workoutDayStarted = true;
      if (session.completedAt) {
        entry.workoutDayCompleted = true;
      }
    }

    const completedSessions = await prisma.workoutSession.findMany({
      where: {
        completedAt: {
          not: null,
        },
        startedAt: {
          lte: baseDate.endOf("day").toDate(),
        },
        workoutDay: {
          workouPlan: {
            userId: dto.userId,
          },
        },
      },
      select: {
        startedAt: true,
        completedAt: true,
      },
    });

    const completedDates = new Set<string>();
    for (const session of completedSessions) {
      if (!session.completedAt) {
        continue;
      }
      completedDates.add(dayjs.utc(session.startedAt).format(dateKeyFormat));
    }

    let workoutStreak = 0;
    let cursor = baseDate;
    while (true) {
      const dateKey = cursor.format(dateKeyFormat);
      if (!completedDates.has(dateKey)) {
        break;
      }
      workoutStreak += 1;
      cursor = cursor.subtract(1, "day");
    }

    return {
      activeWorkoutPlanId: activePlan.id,
      todayWorkoutDay: {
        workoutPlanId: todayWorkoutDay.workoutPlanId,
        id: todayWorkoutDay.id,
        name: todayWorkoutDay.name,
        isRest: todayWorkoutDay.isRest,
        weekDay: todayWorkoutDay.weekDay,
        estimatedDurationInSeconds: todayWorkoutDay.estimatedDurationInSeconds,
        coverImageUrl: todayWorkoutDay.coverImageUrl ?? undefined,
        exercisesCount: todayWorkoutDay._count.exercises,
      },
      workoutStreak,
      consistencyByDay,
    };
  }
}
