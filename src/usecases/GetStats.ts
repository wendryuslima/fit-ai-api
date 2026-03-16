import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";

import { prisma } from "../lib/db.js";

dayjs.extend(utc);

const dateKeyFormat = "YYYY-MM-DD";

export interface InputDto {
  userId: string;
  from: string;
  to: string;
}

export interface OutputDto {
  workoutStreak: number;
  consistencyByDay: Record<
    string,
    {
      workoutDayCompleted: boolean;
      workoutDayStarted: boolean;
    }
  >;
  completedWorkoutsCount: number;
  conclusionRate: number;
  totalTimeInSeconds: number;
}

export class GetStats {
  async execute(dto: InputDto): Promise<OutputDto> {
    const fromDate = dayjs.utc(dto.from).startOf("day");
    const toDate = dayjs.utc(dto.to).endOf("day");

    const sessions = await prisma.workoutSession.findMany({
      where: {
        startedAt: {
          gte: fromDate.toDate(),
          lte: toDate.toDate(),
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
      orderBy: {
        startedAt: "asc",
      },
    });

    const consistencyByDay: OutputDto["consistencyByDay"] = {};
    const completedDates = new Set<string>();

    let completedWorkoutsCount = 0;
    let totalTimeInSeconds = 0;

    for (const session of sessions) {
      const dateKey = dayjs.utc(session.startedAt).format(dateKeyFormat);

      if (!consistencyByDay[dateKey]) {
        consistencyByDay[dateKey] = {
          workoutDayCompleted: false,
          workoutDayStarted: false,
        };
      }

      consistencyByDay[dateKey].workoutDayStarted = true;

      if (!session.completedAt) {
        continue;
      }

      consistencyByDay[dateKey].workoutDayCompleted = true;
      completedDates.add(dateKey);
      completedWorkoutsCount += 1;
      totalTimeInSeconds += dayjs
        .utc(session.completedAt)
        .diff(dayjs.utc(session.startedAt), "second");
    }

    let workoutStreak = 0;
    let currentStreak = 0;
    let previousCompletedDate: string | null = null;

    for (const completedDate of Array.from(completedDates).sort()) {
      if (!previousCompletedDate) {
        currentStreak = 1;
      } else {
        const diffInDays = dayjs
          .utc(completedDate)
          .diff(dayjs.utc(previousCompletedDate), "day");

        currentStreak = diffInDays === 1 ? currentStreak + 1 : 1;
      }

      workoutStreak = Math.max(workoutStreak, currentStreak);
      previousCompletedDate = completedDate;
    }

    return {
      workoutStreak,
      consistencyByDay,
      completedWorkoutsCount,
      conclusionRate:
        sessions.length === 0 ? 0 : completedWorkoutsCount / sessions.length,
      totalTimeInSeconds,
    };
  }
}
