import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

test("valida o artefato e impede publicação com origem ou tag divergentes", t => {
  const root = mkdtempSync(path.join(tmpdir(), "tw-merge-release-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(path.join(root, "scripts"));
  mkdirSync(path.join(root, "artifacts"));
  mkdirSync(path.join(root, "package"));
  const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  writeFileSync(path.join(root, "package.json"), JSON.stringify(manifest));
  writeFileSync(path.join(root, "package/package.json"), JSON.stringify(manifest));
  cpSync(new URL("../scripts/release.mjs", import.meta.url), path.join(root, "scripts/release.mjs"));
  const archive = path.join(root, "artifacts", `${manifest.name}-${manifest.version}.tgz`);
  const pack = spawnSync("tar", ["-czf", archive, "-C", root, "package"], { encoding: "utf8" });
  assert.equal(pack.status, 0, pack.stderr);
  const run = (mode, env = {}) => spawnSync(process.execPath, [path.join(root, "scripts/release.mjs"), path.join(root, "artifacts"), mode], {
    encoding: "utf8",
    env: { ...process.env, GITHUB_ACTIONS: "", GITHUB_EVENT_NAME: "", GITHUB_REF: "", GITHUB_REPOSITORY: "", ...env },
  });
  assert.equal(run("--check").status, 0);
  assert.match(run("--publish").stderr, /exige GitHub Actions/);
  assert.match(run("--check", { GITHUB_REF: "refs/tags/v0.0.0" }).stderr, /Tag e versão divergem/);
  assert.match(run("--publish", {
    GITHUB_ACTIONS: "true",
    GITHUB_EVENT_NAME: "pull_request",
    GITHUB_REF: `refs/tags/v${manifest.version}`,
  }).stderr, /exige push de tag/);
  assert.match(run("--publish", {
    GITHUB_ACTIONS: "true",
    GITHUB_EVENT_NAME: "push",
    GITHUB_REF: `refs/tags/v${manifest.version}`,
    GITHUB_REPOSITORY: "other/project",
  }).stderr, /Repositório divergente/);
  manifest.version = "0.0.0";
  writeFileSync(path.join(root, "package.json"), JSON.stringify(manifest));
  assert.match(run("--check").stderr, /Artefato ausente ou inesperado/);
});

test("rejeita artefato cujo manifesto difere da fonte", t => {
  const root = mkdtempSync(path.join(tmpdir(), "tw-merge-release-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(path.join(root, "scripts"));
  mkdirSync(path.join(root, "artifacts"));
  mkdirSync(path.join(root, "package"));
  const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  writeFileSync(path.join(root, "package.json"), JSON.stringify(manifest));
  writeFileSync(path.join(root, "package/package.json"), JSON.stringify({ ...manifest, dependencies: {} }));
  cpSync(new URL("../scripts/release.mjs", import.meta.url), path.join(root, "scripts/release.mjs"));
  const archive = path.join(root, "artifacts", `${manifest.name}-${manifest.version}.tgz`);
  const pack = spawnSync("tar", ["-czf", archive, "-C", root, "package"], { encoding: "utf8" });
  assert.equal(pack.status, 0, pack.stderr);
  const result = spawnSync(process.execPath, [path.join(root, "scripts/release.mjs"), path.join(root, "artifacts")], { encoding: "utf8" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Manifesto do artefato difere/);
});
