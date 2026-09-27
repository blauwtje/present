/**
 * Links that set up a device in one tap. Everything sits in the URL fragment, which browsers never send to a server.
 * `#k=<token>` connects sync; `#add=<base64url JSON backup>` adds profile entries once.
 */
export interface LinkParams {
  token?: string;
  add?: string;
}

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(data: string): string {
  const bin = atob(data.replace(/-/g, '+').replace(/_/g, '/'));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

export function readLink(hash: string): LinkParams {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const out: LinkParams = {};
  const k = params.get('k');
  if (k && /^[A-Za-z0-9_]{20,255}$/.test(k)) out.token = k;
  const add = params.get('add');
  if (add) {
    try {
      out.add = fromBase64Url(add);
    } catch {
      // A broken link adds nothing.
    }
  }
  return out;
}

/** The hash with `add` removed, so a reload or a home-screen copy does not add it again. */
export function withoutAdd(hash: string): string {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  params.delete('add');
  const rest = params.toString();
  return rest ? `#${rest}` : '';
}

export function personalLink(base: string, token: string): string {
  return `${base}#k=${token}`;
}

export function addLink(base: string, backupJson: string): string {
  return `${base}#add=${toBase64Url(backupJson)}`;
}

/** Accept a pasted token or a pasted personal link. */
export function tokenFromInput(input: string): string | undefined {
  const t = input.trim();
  if (t.includes('#')) return readLink(t.slice(t.indexOf('#'))).token;
  return /^[A-Za-z0-9_]{20,255}$/.test(t) ? t : undefined;
}
