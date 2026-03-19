import { openai } from "@ai-sdk/openai";
import {
  convertToModelMessages,
  stepCountIs,
  streamText,
  tool,
} from "ai";
import { fromNodeHeaders } from "better-auth/node";
import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod/v4";

import { WeekDay } from "../generated/prisma/enums.js";
import { auth } from "../lib/auth.js";
import { CreateWorkoutPlan } from "../usecases/CreateWorkoutPlan.js";
import { GetUserTrainData } from "../usecases/GetUserTrainData.js";
import { GetWorkoutPlans } from "../usecases/GetWorkoutPlans.js";
import { UpsertUserTrainData } from "../usecases/UpsertUserTrainData.js";

const SUPERIOR_COVER_IMAGE_URLS = [
  "https://gw8hy3fdcv.ufs.sh/f/ccoBDpLoAPCO3y8pQ6GBg8iqe9pP2JrHjwd1nfKtVSQskI0v",
  "https://gw8hy3fdcv.ufs.sh/f/ccoBDpLoAPCOW3fJmqZe4yoUcwvRPQa8kmFprzNiC30hqftL",
] as const;

const LOWER_COVER_IMAGE_URLS = [
  "https://gw8hy3fdcv.ufs.sh/f/ccoBDpLoAPCOgCHaUgNGronCvXmSzAMs1N3KgLdE5yHT6Ykj",
  "https://gw8hy3fdcv.ufs.sh/f/ccoBDpLoAPCO85RVu3morROwZk5NPhs1jzH7X8TyEvLUCGxY",
] as const;

const ORDERED_WEEK_DAYS = [
  WeekDay.MONDAY,
  WeekDay.TUESDAY,
  WeekDay.WEDNESDAY,
  WeekDay.THURSDAY,
  WeekDay.FRIDAY,
  WeekDay.SATURDAY,
  WeekDay.SUNDAY,
] as const;

const SYSTEM_PROMPT = `
Voce e um personal trainer virtual especialista em montar planos de treino.

Regras de comportamento:
- Tom amigavel e motivador.
- Linguagem simples, curta, sem jargoes tecnicos.
- O publico principal sao pessoas leigas em musculacao.
- Responda sempre de forma curta e objetiva.
- SEMPRE chame a tool getUserTrainData antes de qualquer resposta ao usuario.

Fluxo com dados do usuario:
- Se getUserTrainData retornar null, faca em uma unica mensagem perguntas simples e diretas pedindo: nome, peso em kg, altura em cm, idade e percentual de gordura corporal.
- Quando o usuario responder, chame updateUserTrainData.
- Ao chamar updateUserTrainData, converta peso de kg para gramas.
- Ao chamar updateUserTrainData, normalize percentual de gordura para decimal entre 0 e 1 quando o usuario informar algo como 18 ou 18%.
- Se getUserTrainData retornar dados, cumprimente o usuario pelo nome.

Fluxo para criar plano:
- Antes de criar um plano, pergunte apenas o necessario: objetivo, quantos dias por semana a pessoa pode treinar e se existe alguma restricao fisica ou lesao.
- Depois chame createWorkoutPlan.
- O plano deve ter exatamente 7 dias, de MONDAY a SUNDAY, nesta ordem.
- Dias sem treino devem ter isRest: true, exercises: [], estimatedDurationInSeconds: 0.
- Use nomes descritivos para cada dia, por exemplo: "Superior A - Peito e Costas" ou "Descanso".

Divisoes de treino por disponibilidade:
- 2 a 3 dias por semana: Full Body ou ABC (A: Peito+Triceps, B: Costas+Biceps, C: Pernas+Ombros)
- 4 dias por semana: Upper/Lower preferencialmente, ou ABCD
- 5 dias por semana: PPLUL (Push/Pull/Legs + Upper/Lower)
- 6 dias por semana: PPL 2x (Push/Pull/Legs repetido)

Principios de montagem:
- Agrupe musculos sinergicos juntos, como peito+triceps e costas+biceps.
- Coloque exercicios compostos antes dos isoladores.
- Use de 4 a 8 exercicios por sessao.
- Use 3 a 4 series por exercicio.
- Use 8 a 12 repeticoes para hipertrofia e 4 a 6 para forca quando fizer sentido.
- Use 60 a 90 segundos de descanso na maioria dos exercicios e 2 a 3 minutos nos compostos pesados.
- Evite treinar o mesmo grupo muscular em dias consecutivos.

Regras de coverImageUrl:
- Todo dia do plano precisa ter coverImageUrl.
- Dias majoritariamente superiores, push, pull, upper ou full body usam uma destas URLs, alternando entre elas:
  1. ${SUPERIOR_COVER_IMAGE_URLS[0]}
  2. ${SUPERIOR_COVER_IMAGE_URLS[1]}
- Dias majoritariamente inferiores, legs ou lower usam uma destas URLs, alternando entre elas:
  1. ${LOWER_COVER_IMAGE_URLS[0]}
  2. ${LOWER_COVER_IMAGE_URLS[1]}
- Dias de descanso usam imagem de superior.

Use getWorkoutPlans apenas quando o usuario quiser consultar planos existentes.
`;

const exerciseSchema = z
  .object({
    order: z.number().int().min(1).describe("Ordem do exercicio no dia"),
    name: z.string().trim().min(1).describe("Nome do exercicio"),
    sets: z.number().int().min(1).max(4).describe("Numero de series"),
    reps: z.number().int().min(1).describe("Numero de repeticoes"),
    restTimeInSeconds: z
      .number()
      .int()
      .min(1)
      .describe("Tempo de descanso entre series em segundos"),
  })
  .strict();

const workoutDaySchema = z
  .object({
    name: z.string().trim().min(1).describe("Nome descritivo do dia"),
    weekDay: z.enum(WeekDay).describe("Dia da semana"),
    isRest: z.boolean().describe("Se o dia e descanso"),
    estimatedDurationInSeconds: z
      .number()
      .int()
      .min(0)
      .describe("Duracao estimada em segundos"),
    coverImageUrl: z
      .string()
      .url()
      .describe("URL da imagem de capa do dia"),
    exercises: z
      .array(exerciseSchema)
      .describe("Lista de exercicios; em descanso deve ser []"),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.isRest) {
      if (value.exercises.length !== 0) {
        ctx.addIssue({
          code: "custom",
          message: "Dias de descanso devem ter exercises vazio.",
          path: ["exercises"],
        });
      }

      if (value.estimatedDurationInSeconds !== 0) {
        ctx.addIssue({
          code: "custom",
          message: "Dias de descanso devem ter duracao 0.",
          path: ["estimatedDurationInSeconds"],
        });
      }

      return;
    }

    if (value.exercises.length < 4 || value.exercises.length > 8) {
      ctx.addIssue({
        code: "custom",
        message: "Dias de treino devem ter de 4 a 8 exercicios.",
        path: ["exercises"],
      });
    }

    if (value.estimatedDurationInSeconds <= 0) {
      ctx.addIssue({
        code: "custom",
        message: "Dias de treino devem ter duracao maior que 0.",
        path: ["estimatedDurationInSeconds"],
      });
    }
  });

const createWorkoutPlanInputSchema = z
  .object({
    name: z.string().trim().min(1).describe("Nome do plano de treino"),
    workoutDays: z
      .array(workoutDaySchema)
      .length(7)
      .describe("Array com exatamente 7 dias, de MONDAY a SUNDAY"),
  })
  .strict()
  .superRefine((value, ctx) => {
    value.workoutDays.forEach((day, index) => {
      if (day.weekDay !== ORDERED_WEEK_DAYS[index]) {
        ctx.addIssue({
          code: "custom",
          message: `Os dias devem estar na ordem de MONDAY a SUNDAY. Esperado ${ORDERED_WEEK_DAYS[index]}.`,
          path: ["workoutDays", index, "weekDay"],
        });
      }
    });
  });

const postAiBodySchema = z
  .object({
    messages: z.custom<Array<Parameters<typeof convertToModelMessages>[0][number]>>(),
  })
  .strict();

export const aiRoutes = async (app: FastifyInstance) => {
  app.withTypeProvider<ZodTypeProvider>().route({
    method: "POST",
    url: "/ai",
    schema: {
      tags: ["AI"],
      summary: "Chat with the workout plan assistant",
      body: postAiBodySchema,
    },
    handler: async (request, reply) => {
      const session = await auth.api.getSession({
        headers: fromNodeHeaders(request.headers),
      });

      if (!session) {
        return reply.status(401).send({
          error: "Unauthorized",
          code: "UNAUTHORIZED",
        });
      }

      try {
        const { messages } = request.body;

        const result = streamText({
          model: openai("gpt-4o-mini"),
          system: SYSTEM_PROMPT,
          messages: await convertToModelMessages(messages, {
            ignoreIncompleteToolCalls: true,
          }),
          stopWhen: stepCountIs(5),
          prepareStep: ({ stepNumber }) => {
            if (stepNumber === 0) {
              return {
                toolChoice: {
                  type: "tool",
                  toolName: "getUserTrainData",
                },
                activeTools: ["getUserTrainData"],
              };
            }

            return {
              activeTools: [
                "getUserTrainData",
                "updateUserTrainData",
                "getWorkoutPlans",
                "createWorkoutPlan",
              ],
            };
          },
          tools: {
            getUserTrainData: tool({
              description:
                "Busca os dados de treino do usuario autenticado. Deve ser chamada antes de qualquer resposta.",
              inputSchema: z.object({}).strict(),
              execute: async () => {
                const getUserTrainData = new GetUserTrainData();
                return getUserTrainData.execute({
                  userId: session.user.id,
                });
              },
            }),
            updateUserTrainData: tool({
              description:
                "Cria ou atualiza os dados de treino do usuario autenticado.",
              inputSchema: z
                .object({
                  weightInGrams: z
                    .number()
                    .positive()
                    .describe(
                      "Peso do usuario em gramas. Se estiver em kg, converta antes de chamar.",
                    ),
                  heightInCentimeters: z
                    .number()
                    .int()
                    .positive()
                    .describe("Altura em centimetros"),
                  age: z.number().int().positive().describe("Idade em anos"),
                  bodyFatPercentage: z
                    .number()
                    .min(0)
                    .max(100)
                    .describe(
                      "Percentual de gordura corporal. Salve como decimal entre 0 e 1.",
                    ),
                })
                .strict(),
              execute: async ({
                age,
                bodyFatPercentage,
                heightInCentimeters,
                weightInGrams,
              }) => {
                const upsertUserTrainData = new UpsertUserTrainData();

                return upsertUserTrainData.execute({
                  userId: session.user.id,
                  weightInGrams: Math.round(
                    weightInGrams >= 1000
                      ? weightInGrams
                      : weightInGrams * 1000,
                  ),
                  heightInCentimeters,
                  age,
                  bodyFatPercentage:
                    bodyFatPercentage > 1
                      ? bodyFatPercentage / 100
                      : bodyFatPercentage,
                });
              },
            }),
            getWorkoutPlans: tool({
              description: "Lista os planos de treino do usuario autenticado.",
              inputSchema: z.object({}).strict(),
              execute: async () => {
                const getWorkoutPlans = new GetWorkoutPlans();
                return getWorkoutPlans.execute({
                  userId: session.user.id,
                });
              },
            }),
            createWorkoutPlan: tool({
              description:
                "Cria um novo plano de treino com exatamente 7 dias, cada um com coverImageUrl.",
              inputSchema: createWorkoutPlanInputSchema,
              execute: async ({ name, workoutDays }) => {
                const createWorkoutPlan = new CreateWorkoutPlan();

                return createWorkoutPlan.execute({
                  userId: session.user.id,
                  name,
                  workoutDays: [...workoutDays].sort(
                    (left, right) =>
                      ORDERED_WEEK_DAYS.indexOf(left.weekDay) -
                      ORDERED_WEEK_DAYS.indexOf(right.weekDay),
                  ),
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
    },
  });
};
