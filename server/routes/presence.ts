import { FastifyInstance, FastifyRequest } from 'fastify';
import { nanoid } from 'nanoid';
import { isPreviewHost } from '../../shared/preview-origin.js';

export type Role = 'interviewer' | 'candidate';

interface Client {
  id: string;
  socket: any;
  role: Role;
  name: string;
  room: string | null;
}

interface KvEntry {
  value: string | null;
  ts: number;
}

const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;
const SAFE_ROOM = /^[A-Za-z0-9_-]{1,140}$/;
const MAX_VALUE = 2_000_000;

const clients = new Map<string, Client>();
// Latest value of every shared key, per room (candidate + exercise)
const rooms = new Map<string, Map<string, KvEntry>>();

/**
 * The host the browser asked for. Each proxy appends to x-forwarded-host, so the last entry is the one the nearest
 * hop saw; an earlier entry could have been written by the visitor.
 */
export function effectiveHost(request: Pick<FastifyRequest, 'headers'>): string {
  const forwarded = String(request.headers['x-forwarded-host'] || '').split(',').map(h => h.trim()).filter(Boolean);
  return forwarded.length ? forwarded[forwarded.length - 1] : String(request.headers.host || '').trim();
}

export function roleForRequest(request: Pick<FastifyRequest, 'headers'>): Role {
  const host = effectiveHost(request);
  // The preview port shows candidate written code, so it never carries the interviewer's powers
  return LOCAL_HOST.test(host) && !isPreviewHost(host) ? 'interviewer' : 'candidate';
}

// Live overview for the terminal dashboard of `make start`: who is in each room and what they have open
export function liveRooms() {
  const result: Array<{ room: string; online: Record<string, number>; kv: Record<string, string | null> }> = [];
  const online = new Map<string, Record<string, number>>();
  for (const c of clients.values()) {
    if (!c.room) continue;
    const counts = online.get(c.room) ?? {};
    counts[c.role] = (counts[c.role] ?? 0) + 1;
    online.set(c.room, counts);
  }
  for (const [room, counts] of online) {
    const kv: Record<string, string | null> = {};
    rooms.get(room)?.forEach((entry, key) => { kv[key] = entry.value; });
    result.push({ room, online: counts, kv });
  }
  return result;
}

export function connectedCandidates(): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const c of clients.values()) {
    if (c.role === 'candidate' && c.room) counts[c.room] = (counts[c.room] ?? 0) + 1;
  }
  return counts;
}

function cleanName(raw: unknown): string {
  const name = typeof raw === 'string' ? raw.replace(/[^\p{L}\p{N} _.-]/gu, '').trim().slice(0, 40) : '';
  return name || 'Candidate';
}

const clamp01 = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : null);

function send(client: Client, payload: Record<string, unknown>) {
  try { client.socket.send(JSON.stringify(payload)); } catch {}
}

function peersOf(client: Client): Client[] {
  return [...clients.values()].filter(o => o.id !== client.id && o.room === client.room);
}

// Candidates only ever see the interviewer; the interviewer sees the candidates, tagged with their name
function deliverCursor(from: Client, payload: Record<string, unknown>) {
  if (!from.room) return;
  const label = from.role === 'candidate' ? from.name : 'Interviewer';
  for (const other of peersOf(from)) {
    if (other.role === from.role) continue;
    send(other, { ...payload, id: from.id, label, role: from.role });
  }
}

// Live editing signals (carets, selections, text edits, chat drafts) go to everyone else in the room, both ways
const PEER_KINDS = new Set(['caret', 'edit', 'doc-request', 'doc-full', 'draft', 'view-request']);
const MAX_PEER_PAYLOAD = 300_000;

function deliverPeer(from: Client, payload: Record<string, unknown>) {
  if (!from.room) return;
  const label = from.role === 'candidate' ? from.name : 'Interviewer';
  for (const other of peersOf(from)) {
    send(other, { ...payload, type: 'peer', id: from.id, label, role: from.role });
  }
}

type Message = Record<string, any>;

/** Tells everyone in a room who is there (how many interviewers and candidates), so each screen knows if the other side is online */
function broadcastRoster(room: string | null) {
  if (!room) return;
  const roles = { interviewer: 0, candidate: 0 };
  const members: Client[] = [];
  for (const c of clients.values()) {
    if (c.room !== room) continue;
    roles[c.role]++;
    members.push(c);
  }
  for (const member of members) send(member, { type: 'roster', roles });
}

function handleJoin(client: Client, msg: Message) {
  if (typeof msg.room !== 'string' || !SAFE_ROOM.test(msg.room)) return;
  const previousRoom = client.room;
  if (client.room && client.room !== msg.room) deliverCursor(client, { type: 'leave' });
  client.room = msg.room;
  if (previousRoom && previousRoom !== msg.room) broadcastRoster(previousRoom);
  broadcastRoster(msg.room);
  const entries: Record<string, KvEntry> = {};
  rooms.get(msg.room)?.forEach((entry, key) => { entries[key] = entry; });
  send(client, { type: 'kv-snapshot', room: msg.room, entries });
}

function handleKv(client: Client, msg: Message) {
  if (!client.room || typeof msg.key !== 'string' || !msg.key.startsWith('trio_cc_')) return;
  if (msg.value !== null && (typeof msg.value !== 'string' || msg.value.length > MAX_VALUE)) return;
  const entry: KvEntry = { value: msg.value, ts: Date.now() };
  let store = rooms.get(client.room);
  if (!store) { store = new Map(); rooms.set(client.room, store); }
  store.set(msg.key, entry);
  for (const other of peersOf(client)) send(other, { type: 'kv', key: msg.key, value: entry.value, ts: entry.ts });
}

function handlePeer(client: Client, msg: Message) {
  if (typeof msg.kind !== 'string' || !PEER_KINDS.has(msg.kind)) return;
  const { type: _type, ...rest } = msg;
  if (JSON.stringify(rest).length > MAX_PEER_PAYLOAD) return;
  deliverPeer(client, rest);
}

function handleMove(client: Client, msg: Message) {
  const x = clamp01(msg.x);
  const y = clamp01(msg.y);
  if (x === null || y === null) return;
  deliverCursor(client, { type: 'cursor', x, y });
}

const MESSAGE_HANDLERS: Record<string, (client: Client, msg: Message) => void> = {
  name: (client, msg) => { client.name = cleanName(msg.name); },
  join: handleJoin,
  kv: handleKv,
  peer: handlePeer,
  move: handleMove,
};

function parseMessage(raw: Buffer): Message | null {
  try { return JSON.parse(raw.toString()); } catch { return null; }
}

export async function registerPresenceRoutes(server: FastifyInstance) {
  server.get('/api/presence', { websocket: true } as any, (socket: any, request: FastifyRequest) => {
    const url = new URL(request.url, 'http://localhost');
    const client: Client = {
      id: nanoid(8),
      socket,
      role: roleForRequest(request),
      name: cleanName(url.searchParams.get('name')),
      room: null,
    };
    clients.set(client.id, client);
    send(client, { type: 'hello', id: client.id, role: client.role });

    socket.on('message', (raw: Buffer) => {
      const msg = parseMessage(raw);
      const handler = typeof msg?.type === 'string' && Object.hasOwn(MESSAGE_HANDLERS, msg.type) ? MESSAGE_HANDLERS[msg.type] : undefined;
      handler?.(client, msg as Message);
    });

    const gone = () => {
      deliverCursor(client, { type: 'leave' });
      deliverPeer(client, { kind: 'leave' });
      clients.delete(client.id);
      broadcastRoster(client.room);
    };
    socket.on('close', gone);
    socket.on('error', gone);
  });
}
