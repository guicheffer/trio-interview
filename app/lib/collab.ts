type Handler = (msg: any) => void;

class CollabSocket {
  private ws: WebSocket | null = null;
  private handlers = new Map<string, Set<Handler>>();
  private retry: ReturnType<typeof setTimeout> | null = null;
  private room: string | null = null;
  private name = '';
  role: 'interviewer' | 'candidate' | null = null;
  /** True once the code screen is open; cursors are neither sent nor shown before that */
  workspaceOpen = false;
  id: string | null = null;
  /** Who is in the room right now, from the server */
  roster: { interviewer: number; candidate: number } = { interviewer: 0, candidate: 0 };

  connect() {
    if (typeof window === 'undefined' || this.ws) return;
    if (this.retry) { clearTimeout(this.retry); this.retry = null; }
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${window.location.host}/api/presence?name=${encodeURIComponent(this.name)}`);
    this.ws = ws;

    ws.onopen = () => {
      this.handlers.get('status')?.forEach(h => h({ open: true }));
      if (this.room) ws.send(JSON.stringify({ type: 'join', room: this.room }));
    };
    ws.onmessage = (e) => {
      let msg: any;
      try { msg = JSON.parse(e.data); } catch { return; }
      if (msg.type === 'hello') { this.role = msg.role; this.id = msg.id; }
      if (msg.type === 'roster' && msg.roles) this.roster = msg.roles;
      this.handlers.get(msg.type)?.forEach(h => h(msg));
    };
    ws.onclose = () => {
      this.ws = null;
      this.roster = { interviewer: 0, candidate: 0 };
      this.handlers.get('status')?.forEach(h => h({ open: false }));
      this.handlers.get('roster')?.forEach(h => h({ roles: this.roster }));
      this.retry = setTimeout(() => this.connect(), 1500);
    };
  }

  isOpen() {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  send(msg: Record<string, unknown>) {
    if (this.isOpen()) this.ws!.send(JSON.stringify(msg));
  }

  setWorkspaceOpen(open: boolean) {
    if (this.workspaceOpen === open) return;
    this.workspaceOpen = open;
    this.handlers.get('workspace')?.forEach(h => h({ open }));
  }

  setName(name: string) {
    if (name === this.name) return;
    this.name = name;
    this.send({ type: 'name', name });
  }

  join(room: string) {
    this.room = room;
    this.connect();
    this.send({ type: 'join', room });
  }

  on(type: string, handler: Handler): () => void {
    let set = this.handlers.get(type);
    if (!set) { set = new Set(); this.handlers.set(type, set); }
    set.add(handler);
    return () => { set!.delete(handler); };
  }
}

export const collab = new CollabSocket();
