import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { FileSandbox } from '../lib/file-sandbox.js';
import { resolve, basename } from 'path';

/** The first top level heading ("# Title") of the brief. Only that: "## Section" and a "#" inside a code block do not count. */
export function titleFromBrief(brief: string): string | null {
  let inCode = false;
  for (const line of brief.split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(line)) { inCode = !inCode; continue; }
    if (inCode) continue;
    const match = /^#\s+(.+?)\s*#*\s*$/.exec(line);
    if (match) return match[1].trim() || null;
  }
  return null;
}

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
        title: titleFromBrief(description) ?? exerciseId.charAt(0).toUpperCase() + exerciseId.slice(1),
        description,
      });
    } catch (error) {
      server.log.error(error);
      reply.status(500).send({ error: 'Failed to load exercise' });
    }
  });
}
