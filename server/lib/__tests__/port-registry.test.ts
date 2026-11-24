import { beforeEach, describe, expect, test, vi } from 'vitest';
import { clearPort, getAllPorts, getBasePath, getPort, getServerPort, registerPort } from '../port-registry.js';

describe('port registry', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    for (const entry of getAllPorts()) clearPort(entry.candidate, entry.exercise);
  });

  test('has nothing registered by default', () => {
    expect(getPort('maria', 'demo')).toBeNull();
    expect(getServerPort('maria', 'demo')).toBeNull();
    expect(getBasePath('maria', 'demo')).toBe('/');
  });

  test('registers the frontend, the API and the base path', () => {
    registerPort('maria', 'demo', 5173, 3002, '/preview/maria/demo/');

    expect(getPort('maria', 'demo')).toBe(5173);
    expect(getServerPort('maria', 'demo')).toBe(3002);
    expect(getBasePath('maria', 'demo')).toBe('/preview/maria/demo/');
  });

  test('keeps the API and base path when the same frontend port registers again', () => {
    registerPort('maria', 'demo', 5173, 3002, '/preview/maria/demo/');
    registerPort('maria', 'demo', 5173);

    expect(getServerPort('maria', 'demo')).toBe(3002);
    expect(getBasePath('maria', 'demo')).toBe('/preview/maria/demo/');
  });

  test('forgets the old details when the frontend moves to another port', () => {
    registerPort('maria', 'demo', 5173, 3002, '/preview/maria/demo/');
    registerPort('maria', 'demo', 5174);

    expect(getPort('maria', 'demo')).toBe(5174);
    expect(getServerPort('maria', 'demo')).toBeNull();
    expect(getBasePath('maria', 'demo')).toBe('/');
  });

  test('clears one candidate without touching another', () => {
    registerPort('maria', 'demo', 5173);
    registerPort('ana', 'demo', 5180);
    clearPort('maria', 'demo');

    expect(getPort('maria', 'demo')).toBeNull();
    expect(getAllPorts().map(e => e.candidate)).toEqual(['ana']);
  });
});
