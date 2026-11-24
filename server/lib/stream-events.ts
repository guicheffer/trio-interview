import { isAbsolute, relative } from 'path';

const FILE_WRITE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']);

export interface EditEvent {
  name: 'editing-file' | 'file-changed';
  data: { filePath: string };
}

interface ToolUseBlock {
  type?: string;
  name?: string;
  input?: { file_path?: unknown };
}

function toolUseBlocks(event: unknown): ToolUseBlock[] {
  const e = event as { type?: string; message?: { content?: unknown } } | null;
  if (e?.type !== 'assistant' || !Array.isArray(e.message?.content)) return [];
  return e.message.content as ToolUseBlock[];
}

function eventsForBlock(block: ToolUseBlock, workPath: string): EditEvent[] {
  const filePath = block.input?.file_path;
  if (block.type !== 'tool_use' || typeof filePath !== 'string') return [];
  const events: EditEvent[] = [{ name: 'editing-file', data: { filePath } }];
  if (block.name && FILE_WRITE_TOOLS.has(block.name)) {
    const rel = isAbsolute(filePath) ? relative(workPath, filePath) : filePath;
    if (rel && !rel.startsWith('..')) events.push({ name: 'file-changed', data: { filePath: rel } });
  }
  return events;
}

/**
 * What the browser should know when the assistant touches a file: the file being edited (for the live overlay)
 * and, for write tools, the path relative to the candidate folder that changed (for the sparkle and the reload).
 */
export function editEventsFor(event: unknown, workPath: string): EditEvent[] {
  return toolUseBlocks(event).flatMap(block => eventsForBlock(block, workPath));
}
