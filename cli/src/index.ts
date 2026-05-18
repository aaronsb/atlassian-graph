#!/usr/bin/env node
/**
 * atlassian-graph CLI (ADR-100) — a thin client over the core service on
 * :4000. It holds no graph logic and no credentials; it maps argv to HTTP
 * and formats the result. The future MCP server is the same client behind
 * a different entry point (stdio + tool schemas instead of argv), so the
 * read/mutation boundary it inherits lives in the core, not here.
 */

const BASE = process.env.GRAPH_API ?? "http://localhost:4000";

type Flags = Record<string, string | boolean>;

function parseArgs(argv: string[]): { positional: string[]; flags: Flags } {
  const positional: string[] = [];
  const flags: Flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    } else {
      positional.push(a);
    }
  }
  return { positional, flags };
}

async function getJson(path: string): Promise<unknown> {
  const res = await fetch(`${BASE}${path}`);
  const body = await res.json().catch(() => ({ error: `Non-JSON response (HTTP ${res.status})` }));
  if (!res.ok) throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  return body;
}

async function postJson(path: string, payload: unknown): Promise<{ status: number; body: any }> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({ error: `Non-JSON response (HTTP ${res.status})` }));
  return { status: res.status, body };
}

function out(v: unknown): void {
  console.log(JSON.stringify(v, null, 2));
}

function qs(params: Record<string, string | undefined>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined) p.set(k, v);
  const s = p.toString();
  return s ? `?${s}` : "";
}

const HELP = `atlassian-graph CLI (ADR-100) — thin client over ${BASE}

Usage:
  graph-cli search <query> [--kind OBJECT] [--limit 50]
  graph-cli type <TypeName>
  graph-cli traverse <FromType> [--strategy breadth|depth] [--depth 2]
                                [--direction out|in|both] [--category project_work]
                                [--kind OBJECT] [--to TargetType] [--limit 50]
  graph-cli query '<graphql>'        # read-only; mutations rejected by the core (ADR-100)
  graph-cli query --stdin            # read the query from stdin

Env:
  GRAPH_API   base URL of the service (default http://localhost:4000)
`;

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const c of process.stdin) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString("utf8").trim();
}

async function main(): Promise<void> {
  const [cmd, ...rest] = process.argv.slice(2);
  const { positional, flags } = parseArgs(rest);

  switch (cmd) {
    case "search": {
      const q = positional[0];
      if (!q) throw new Error("search needs a query: graph-cli search <query>");
      out(await getJson(`/api/search${qs({
        q,
        kind: flags.kind as string | undefined,
        limit: flags.limit as string | undefined,
      })}`));
      break;
    }
    case "type": {
      const name = positional[0];
      if (!name) throw new Error("type needs a name: graph-cli type <TypeName>");
      out(await getJson(`/api/type/${encodeURIComponent(name)}`));
      break;
    }
    case "traverse": {
      const from = positional[0];
      if (!from) throw new Error("traverse needs a start type: graph-cli traverse <FromType>");
      out(await getJson(`/api/traverse/${encodeURIComponent(from)}${qs({
        strategy: flags.strategy as string | undefined,
        depth: flags.depth as string | undefined,
        direction: flags.direction as string | undefined,
        category: flags.category as string | undefined,
        kind: flags.kind as string | undefined,
        to: flags.to as string | undefined,
        limit: flags.limit as string | undefined,
      })}`));
      break;
    }
    case "query": {
      const gql = flags.stdin ? await readStdin() : positional[0];
      if (!gql) throw new Error("query needs GraphQL text or --stdin");
      const { status, body } = await postJson("/api/query", { query: gql });
      if (status === 403) {
        // The core read/mutation gate fired. Surface it as the intended
        // signal, not a generic failure.
        console.error(`Rejected by core boundary (HTTP 403): ${body.error}`);
        process.exit(2);
      }
      out(body);
      break;
    }
    case "help":
    case "--help":
    case "-h":
    case undefined:
      console.log(HELP);
      break;
    default:
      console.error(`Unknown command: ${cmd}\n`);
      console.log(HELP);
      process.exit(1);
  }
}

main().catch((err: unknown) => {
  console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
