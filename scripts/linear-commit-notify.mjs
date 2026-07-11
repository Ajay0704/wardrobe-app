#!/usr/bin/env node
/**
 * Post the latest git commit to Linear as a comment (comment-only — never
 * changes issue status). Invoked by .git/hooks/post-commit, so every commit
 * from any tool on this machine (Claude Code, Cursor, plain git) keeps Linear
 * in sync.
 *
 * - If the commit message references issues like "AJA-12", it comments on each.
 * - Otherwise it comments on the "Commit activity log" issue as a catch-all.
 *
 * The Linear key is read from .env.local (git-ignored) and never printed.
 * Fails silently so it can never block or slow a commit.
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ACTIVITY_TITLE = "Commit activity log";

function main() {
  let root;
  try {
    root = execSync("git rev-parse --show-toplevel", { encoding: "utf8" }).trim();
  } catch {
    return;
  }

  let key;
  try {
    const env = fs.readFileSync(path.join(root, ".env.local"), "utf8");
    key = (env.match(/^LINEAR_API_KEY\s*=\s*(.+)$/m) || [])[1]
      ?.trim()
      .replace(/^["']|["']$/g, "");
  } catch {
    /* no env file */
  }
  if (!key) return;

  const git = (args) =>
    execSync(`git ${args}`, { cwd: root, encoding: "utf8" }).trim();

  const sha = git("log -1 --pretty=%h");
  const subject = git("log -1 --pretty=%s");
  const body = git("log -1 --pretty=%b");
  const author = git("log -1 --pretty=%an");
  const files = git("diff-tree --no-commit-id --name-only -r HEAD")
    .split("\n")
    .filter(Boolean);

  const refs = [...new Set((`${subject} ${body}`.match(/AJA-\d+/gi) || []).map((s) => s.toUpperCase()))];

  const fileList =
    files.length <= 12
      ? files.join(", ")
      : `${files.slice(0, 12).join(", ")} +${files.length - 12} more`;
  const comment =
    `**Commit \`${sha}\`** — ${subject}\n` +
    (body ? `\n${body}\n` : "") +
    `\n_${files.length} file${files.length === 1 ? "" : "s"}: ${fileList || "—"} · by ${author}_`;

  const gql = (query, variables) =>
    fetch("https://api.linear.app/graphql", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: key },
      body: JSON.stringify({ query, variables }),
    }).then((r) => r.json());

  const comment_ = (issueId) =>
    gql(
      `mutation($in: CommentCreateInput!){ commentCreate(input:$in){ success } }`,
      { in: { issueId, body: comment } },
    );

  (async () => {
    const issueIds = [];
    if (refs.length) {
      for (const ref of refs) {
        const n = Number(ref.split("-")[1]);
        const d = await gql(
          `query($n: Float!){ issues(filter:{ number:{ eq:$n } }){ nodes{ id identifier } } }`,
          { n },
        );
        const id = d?.data?.issues?.nodes?.[0]?.id;
        if (id) issueIds.push(id);
      }
    }
    if (issueIds.length === 0) {
      const d = await gql(
        `query($t:String!){ issues(filter:{ title:{ eq:$t } }){ nodes{ id } } }`,
        { t: ACTIVITY_TITLE },
      );
      const id = d?.data?.issues?.nodes?.[0]?.id;
      if (id) issueIds.push(id);
    }
    for (const id of issueIds) await comment_(id);
  })().catch(() => {});
}

main();
