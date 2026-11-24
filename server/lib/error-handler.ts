import { FastifyError, FastifyReply, FastifyRequest } from 'fastify';

/**
 * Global error handler that logs errors but doesn't crash the server
 * This is critical for interviews - we want to see errors, not crash
 */
export function setupErrorHandler(server: any) {
  // Handle uncaught errors
  server.setErrorHandler((error: FastifyError, request: FastifyRequest, reply: FastifyReply) => {
    // Log the full error for debugging
    server.log.error({
      err: error,
      req: {
        method: request.method,
        url: request.url,
        headers: request.headers,
      },
      msg: 'Unhandled error caught',
    });

    // Return error to client but keep server running
    reply.status(error.statusCode || 500).send({
      error: error.message || 'Internal Server Error',
      statusCode: error.statusCode || 500,
    });
  });

  // Handle process-level errors (don't crash!)
  process.on('uncaughtException', (error) => {
    server.log.error('[UNCAUGHT EXCEPTION] Server NOT crashing (by design):', error);
    // Don't exit - this is intentional for interviews
  });

  process.on('unhandledRejection', (reason, promise) => {
    server.log.error('[UNHANDLED REJECTION] Server NOT crashing (by design):', {
      reason,
      promise,
    });
    // Don't exit - this is intentional for interviews
  });
}
