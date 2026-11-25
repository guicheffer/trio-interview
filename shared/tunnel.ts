import type { Tunnel } from './interview-config.js';

export interface TunnelStatus {
  ready: boolean;
  /** One line saying what is fine, or what the interviewer still has to do */
  message: string;
  /** What to run, when something is missing */
  fix?: string;
}

/** What each tunnel needs from the interviewer. The ngrok token is checked for being there, and is never printed. */
export function tunnelStatus(tunnel: Tunnel, has: (program: string) => boolean, signedInToNgrok: () => boolean): TunnelStatus {
  if (tunnel === 'none') return { ready: true, message: 'No tunnel: only people on this network, or this machine, can open the link' };
  if (tunnel === 'ngrok') {
    if (!has('ngrok')) return { ready: false, message: 'ngrok is not installed', fix: 'brew install ngrok' };
    if (!signedInToNgrok()) return { ready: false, message: 'ngrok is installed but not signed in. It needs a free account and a token', fix: 'sign up at https://dashboard.ngrok.com/signup, then: ngrok config add-authtoken <token>' };
    return { ready: true, message: 'ngrok is installed and signed in' };
  }
  if (!has('cloudflared')) return { ready: false, message: 'cloudflared is not installed', fix: 'brew install cloudflared' };
  return { ready: true, message: 'cloudflared is installed (a quick tunnel needs no account). It holds back the chat\'s live stream, so Agent mode will not answer through it; Claude Code, OpenCode and Pi do' };
}
