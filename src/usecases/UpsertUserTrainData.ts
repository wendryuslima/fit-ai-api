import { NotFoundError } from "../errors/index.js";
import { prisma } from "../lib/db.js";

export interface InputDto {
  userId: string;
  weightInGrams: number;
  heightInCentimeters: number;
  age: number;
  bodyFatPercentage: number;
}

export interface OutputDto {
  userId: string;
  weightInGrams: number;
  heightInCentimeters: number;
  age: number;
  bodyFatPercentage: number;
}

export class UpsertUserTrainData {
  async execute(dto: InputDto): Promise<OutputDto> {
    const user = await prisma.user.findUnique({
      where: {
        id: dto.userId,
      },
      select: {
        id: true,
      },
    });

    if (!user) {
      throw new NotFoundError("User not found");
    }

    const trainData = await prisma.userTrainData.upsert({
      where: {
        userId: dto.userId,
      },
      create: {
        userId: dto.userId,
        weightInGrams: dto.weightInGrams,
        heightInCentimeters: dto.heightInCentimeters,
        age: dto.age,
        bodyFatPercentage: dto.bodyFatPercentage,
      },
      update: {
        weightInGrams: dto.weightInGrams,
        heightInCentimeters: dto.heightInCentimeters,
        age: dto.age,
        bodyFatPercentage: dto.bodyFatPercentage,
      },
    });

    return {
      userId: trainData.userId,
      weightInGrams: trainData.weightInGrams,
      heightInCentimeters: trainData.heightInCentimeters,
      age: trainData.age,
      bodyFatPercentage: trainData.bodyFatPercentage,
    };
  }
}
