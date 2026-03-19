import { openai } from "@ai-sdk/openai";
import {
  convertToModelMessages,
  stepCountIs,
  streamText,
  tool,
  type UIMessage,
} from "ai";
import { fromNodeHeaders } from "better-auth/node";
import { FastifyInstance } from "fastify";
import z from "zod";

import { WeekDay } from "../generated/prisma/enums.js";
import { auth } from "../lib/auth.js";
import { CreateWorkoutPlan } from "../usecases/CreateWorkoutPlan.js";
import { GetWorkoutPlans } from "../usecases/GetWorkoutPlans.js";

const SYSTEM_PROMPT = `
Voce e um assistente de treino.
Ajude o usuario a consultar planos existentes e criar novos planos de treino.
Antes de criar um plano, confirme nome, dias da semana e exercicios quando houver ambiguidade.
`;

const exerciseSchema = z.object({
  order: z.number().int().positive().describe("Ordem do exercicio no dia"),
  name: z.string().describe("Nome do exercicio"),
  sets: z.number().int().positive().describe("Numero de series"),
  reps: z.number().int().positive().describe("Numero de repeticoes"),
  restTimeInSeconds: z
    .number()
    .int()
    .nonnegative()
    .describe("Tempo de descanso entre series em segundos"),
});

const workoutDaySchema = z.object({
  name: z.string().describe("Nome do dia de treino"),
  weekDay: z.enum(WeekDay).describe("Dia da semana"),
  isRest: z.boolean().describe("Se e dia de descanso (true) ou treino (false)"),
  estimatedDurationInSeconds: z
    .number()
    .int()
    .nonnegative()
    .describe("Duracao estimada em segundos"),
  coverImageUrl: z
    .string()
    .url()
    .describe("URL da imagem de capa do dia de treino"),
  exercises: z
    .array(exerciseSchema)
    .describe("Lista de exercicios; use array vazio em dias de descanso"),
});

export const aiRoutes = async (app: FastifyInstance) => {
  app.post("/ai", async (request, reply) => {
    try {
      const session = await auth.api.getSession({
        headers: fromNodeHeaders(request.headers),
      });

      if (!session) {
        return reply.status(401).send({
          error: "Unauthorized",
          code: "UNAUTHORIZED",
        });
      }

      const { messages } = request.body as { messages: UIMessage[] };

      const result = streamText({
        model: openai("gpt-4o-mini"),
        system: SYSTEM_PROMPT,
        messages: await convertToModelMessages(messages),
        stopWhen: stepCountIs(5),
        tools: {
          getWorkoutPlans: tool({
            description: "Lista os planos de treino do usuario autenticado.",
            inputSchema: z.object({
              active: z
                .boolean()
                .optional()
                .describe("Filtra por planos ativos quando informado"),
            }),
            execute: async ({ active }) => {
              const getWorkoutPlans = new GetWorkoutPlans();
              return getWorkoutPlans.execute({
                userId: session.user.id,
                active,
              });
            },
          }),
          createWorkoutPlan: tool({
            description: "Cria um novo plano de treino para o usuario.",
            inputSchema: z.object({
              name: z.string().describe("Nome do plano de treino"),
              workoutDays: z
                .array(workoutDaySchema)
                .length(7)
                .describe(
                  "Array com exatamente 7 dias de treino, de MONDAY a SUNDAY",
                ),
            }),
            execute: async ({ name, workoutDays }) => {
              const createWorkoutPlan = new CreateWorkoutPlan();
              return createWorkoutPlan.execute({
                userId: session.user.id,
                name,
                workoutDays,
              });
            },
          }),
        },
      });

      const response = result.toUIMessageStreamResponse();

      reply.status(response.status);
      response.headers.forEach((value, key) => {
        reply.header(key, value);
      });

      return reply.send(response.body);
    } catch (error) {
      app.log.error(error);
      return reply.status(500).send({
        error: "Internal server error",
        code: "INTERNAL_SERVER_ERROR",
      });
    }
  });
};
