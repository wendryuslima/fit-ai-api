import { fromNodeHeaders } from "better-auth/node";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";

import { NotFoundError } from "../errors/index.js";
import { auth } from "../lib/auth.js";
import {
  ErrorSchema,
  HomeParams,
  HomeQuery,
  HomeResponse,
} from "../schemas/index.js";
import { GetHomeData } from "../usecases/GetHomeData.js";

dayjs.extend(utc);

export const homeRoutes = async (app: FastifyInstance) => {
  app.withTypeProvider<ZodTypeProvider>().route({
    method: "GET",
    url: "/home/:date",
    schema: {
      tags: ["Home"],
      summary: "Get home page data",
      params: HomeParams,
      querystring: HomeQuery,
      response: {
        200: HomeResponse,
        400: ErrorSchema,
        401: ErrorSchema,
        404: ErrorSchema,
        500: ErrorSchema,
      },
    },
    handler: async (request, reply) => {
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

        const dateParam = request.params.date;
        const parsedDate = dayjs.utc(dateParam);
        if (
          !parsedDate.isValid() ||
          parsedDate.format("YYYY-MM-DD") !== dateParam
        ) {
          return reply.status(400).send({
            error: "Invalid date format. Expected YYYY-MM-DD.",
            code: "INVALID_DATE",
          });
        }

        const getHomeData = new GetHomeData();
        const result = await getHomeData.execute({
          userId: session.user.id,
          date: dateParam,
        });

        return reply.status(200).send(result);
      } catch (error) {
        if (error instanceof NotFoundError) {
          return reply.status(404).send({
            error: error.message,
            code: "NOT_FOUND_ERROR",
          });
        }

        app.log.error(error);
        return reply.status(500).send({
          error: "Internal server error",
          code: "INTERNAL_SERVER_ERROR",
        });
      }
    },
  });
};
