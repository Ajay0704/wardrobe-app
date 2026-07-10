/**
 * Server-only SSRF-resistant fetch. Blocks requests to loopback / private /
 * link-local / cloud-metadata addresses, resolves the hostname to catch public
 * names that point at internal IPs, and follows redirects manually so every hop
 * is re-validated (a public URL can't 302 you into the private network).
 *
 * Note: there is a small TOCTOU window between DNS resolution here and the
 * kernel's resolution inside fetch(). For a personal app this is an acceptable,
 * proportionate mitigation; a hardened service would pin the resolved IP.
 */
import dns from "node:dns/promises";
import net from "node:net";

function ipIsPrivate(ip: string): boolean {
  const v = ip.replace(/^::ffff:/i, ""); // unwrap IPv4-mapped IPv6
  if (net.isIPv4(v)) {
    const [a, b] = v.split(".").map(Number);
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true; // link-local / cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    return false;
  }
  const low = v.toLowerCase();
  if (low === "::1" || low === "::") return true;
  if (low.startsWith("fc") || low.startsWith("fd")) return true; // ULA fc00::/7
  if (low.startsWith("fe80")) return true; // link-local
  return false;
}

async function assertPublic(u: URL): Promise<void> {
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new Error("blocked-protocol");
  }
  const host = u.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".local")) {
    throw new Error("blocked-host");
  }
  const ips = net.isIP(host)
    ? [host]
    : (await dns.lookup(host, { all: true })).map((r) => r.address);
  if (ips.length === 0 || ips.some(ipIsPrivate)) {
    throw new Error("blocked-ip");
  }
}

/**
 * fetch() that validates the target (and every redirect hop) is a public host.
 * Throws on a blocked target or too many redirects.
 */
export async function safeFetch(
  input: string,
  init?: RequestInit,
  maxRedirects = 4,
): Promise<Response> {
  let url = new URL(input);
  for (let i = 0; i <= maxRedirects; i++) {
    await assertPublic(url);
    const res = await fetch(url.toString(), { ...init, redirect: "manual" });
    const loc = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && loc) {
      url = new URL(loc, url); // resolve relative redirects
      continue;
    }
    return res;
  }
  throw new Error("too-many-redirects");
}
