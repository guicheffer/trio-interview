/**
 * Tracks ports where candidate servers are running.
 * When a terminal detects "localhost:PORT" in server output,
 * the preview route proxies /preview/:candidate/:exercise/* → localhost:PORT
 */

interface PortEntry {
  candidate: string;
  exercise: string;
  port: number; // Frontend dev server (Vite)
  serverPort?: number; // Backend API server (Express)
  basePath?: string; // Vite base when started for a tunnel, e.g. /preview/<candidate>/<exercise>/
  registeredAt: number;
}

const registry = new Map<string, PortEntry>();

export function registerPort(candidate: string, exercise: string, port: number, serverPort?: number, basePath?: string): void {
  const key = `${candidate}/${exercise}`;
  const previous = registry.get(key);
  const keepPrevious = previous?.port === port;
  registry.set(key, {
    candidate,
    exercise,
    port,
    serverPort: serverPort ?? (keepPrevious ? previous?.serverPort : undefined),
    basePath: basePath ?? (keepPrevious ? previous?.basePath : undefined),
    registeredAt: Date.now(),
  });
  const backend = serverPort ? `, backend:${serverPort}` : '';
  console.log(`[PortRegistry] ${key} -> frontend:${port}${backend}`);
}

export function getPort(candidate: string, exercise: string): number | null {
  const entry = registry.get(`${candidate}/${exercise}`);
  return entry?.port ?? null;
}

export function getBasePath(candidate: string, exercise: string): string {
  return registry.get(`${candidate}/${exercise}`)?.basePath ?? '/';
}

export function getServerPort(candidate: string, exercise: string): number | null {
  const entry = registry.get(`${candidate}/${exercise}`);
  return entry?.serverPort ?? null;
}

export function clearPort(candidate: string, exercise: string): void {
  registry.delete(`${candidate}/${exercise}`);
}

export function getAllPorts(): PortEntry[] {
  return Array.from(registry.values());
}
