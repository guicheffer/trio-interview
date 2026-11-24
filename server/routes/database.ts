import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { resolve } from 'path';
import { existsSync } from 'fs';
import Database from 'better-sqlite3';
import { getWorkPath } from '../lib/active-candidate.js';

interface QueryRequest {
  dbPath: string;
  query: string;
}

export async function registerDatabaseRoutes(server: FastifyInstance) {
  // POST /api/database/query - Execute SQL query on SQLite database
  server.post('/api/database/query', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { dbPath, query } = request.body as QueryRequest;

      if (!dbPath || !query) {
        return reply.status(400).send({ error: 'dbPath and query are required' });
      }

      // Resolve path within candidate's exercise directory
      const workPath = getWorkPath();
      const fullPath = resolve(workPath, dbPath);

      // Security: ensure path is within work directory
      if (!fullPath.startsWith(workPath)) {
        return reply.status(403).send({ error: 'Access denied' });
      }

      if (!existsSync(fullPath)) {
        return reply.status(404).send({ error: 'Database file not found' });
      }

      // Open database (read-only for safety)
      const db = new Database(fullPath, { readonly: true, fileMustExist: true });

      try {
        // Execute query
        const stmt = db.prepare(query);
        const isSelect = query.trim().toUpperCase().startsWith('SELECT');

        if (isSelect) {
          const rows = stmt.all() as Record<string, unknown>[];
          // Extract column names
          const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
          // Convert to array of arrays format
          const values = rows.map(row => columns.map(col => (row as any)[col]));
          reply.send({ columns, values });
        } else {
          // For non-SELECT queries (INSERT, UPDATE, DELETE, etc.)
          const info = stmt.run();
          reply.send({
            columns: [],
            values: [],
            changes: info.changes
          });
        }
      } finally {
        db.close();
      }
    } catch (error: any) {
      server.log.error({ error }, '[Database] Query failed');
      reply.status(500).send({ error: error.message || 'Query execution failed' });
    }
  });

  // GET /api/database/tables - List all tables in database
  server.get('/api/database/tables', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { dbPath } = request.query as { dbPath: string };

      if (!dbPath) {
        return reply.status(400).send({ error: 'dbPath query parameter is required' });
      }

      const workPath = getWorkPath();
      const fullPath = resolve(workPath, dbPath);

      if (!fullPath.startsWith(workPath)) {
        return reply.status(403).send({ error: 'Access denied' });
      }

      if (!existsSync(fullPath)) {
        return reply.status(404).send({ error: 'Database file not found' });
      }

      const db = new Database(fullPath, { readonly: true, fileMustExist: true });

      try {
        // Get list of tables with row counts
        const tables = db.prepare('SELECT name FROM sqlite_master WHERE type="table" ORDER BY name').all() as { name: string }[];
        const tablesWithCounts = tables.map(table => {
          const result = db.prepare(`SELECT COUNT(*) as count FROM "${table.name}"`).get() as { count: number };
          return { name: table.name, rowCount: result.count };
        });

        reply.send({ tables: tablesWithCounts });
      } finally {
        db.close();
      }
    } catch (error: any) {
      server.log.error({ error }, '[Database] List tables failed');
      reply.status(500).send({ error: error.message || 'Failed to list tables' });
    }
  });
}
