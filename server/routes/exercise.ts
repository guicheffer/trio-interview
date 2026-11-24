import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { FileSandbox } from '../lib/file-sandbox.js';
import { resolve, basename } from 'path';

export async function registerExerciseRoutes(server: FastifyInstance) {
  server.get('/api/exercise', async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
      const exercisePath = process.env.EXERCISE_PATH || resolve(process.cwd(), 'exercises', 'fibonacci');
      const exerciseId = process.env.EXERCISE_ID || basename(exercisePath);

      const sandbox = new FileSandbox(exercisePath);

      // Read description.md
      const description = await sandbox.readFile('description.md');

      reply.send({
        id: exerciseId,
        title: exerciseId.charAt(0).toUpperCase() + exerciseId.slice(1),
        description,
      });
    } catch (error) {
      server.log.error(error);
      reply.status(500).send({ error: 'Failed to load exercise' });
    }
  });
}
