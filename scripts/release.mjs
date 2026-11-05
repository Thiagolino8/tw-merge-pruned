import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const { name, version, repository } = manifest;
const [directory, mode = "--check"] = process.argv.slice(2);
assert.ok(directory && ["--check", "--publish"].includes(mode), "Uso: node scripts/release.mjs <artefatos> [--check|--publish]");
const filename = `${name}-${version}.tgz`;
assert.deepEqual(readdirSync(directory).filter(file => file.endsWith(".tgz")), [filename], "Artefato ausente ou inesperado");
const archive = path.resolve(directory, filename);
const packed = JSON.parse(execFileSync("tar", ["-xOf", archive, "package/package.json"], { encoding: "utf8" }));
assert.deepEqual(packed, manifest, "Manifesto do artefato difere da fonte validada");
const tag = process.env.GITHUB_REF;
if (tag?.startsWith("refs/tags/v"))
  assert.equal(tag, `refs/tags/v${version}`, "Tag e versão divergem");
const integrity = `sha512-${createHash("sha512").update(readFileSync(archive)).digest("base64")}`;
console.log(`Validado ${name}@${version}`);

if (mode === "--publish") {
  assert.equal(process.env.GITHUB_ACTIONS, "true", "A publicação automática exige GitHub Actions");
  assert.equal(process.env.GITHUB_EVENT_NAME, "push", "A publicação automática exige push de tag");
  assert.equal(tag, `refs/tags/v${version}`, "A publicação automática exige a tag da versão");
  assert.equal(repository.url, `git+https://github.com/${process.env.GITHUB_REPOSITORY}.git`, "Repositório divergente");
  const response = await fetch(`https://registry.npmjs.org/${encodeURIComponent(name)}/${version}`, { signal: AbortSignal.timeout(30_000) });
  if (response.status === 404) {
    await response.body?.cancel();
    execFileSync("npm", ["publish", archive, "--access", "public", "--ignore-scripts", "--tag", version.includes("-") ? "next" : "latest"], { stdio: "inherit" });
  } else {
    assert.ok(response.ok, `Falha ao consultar ${name}: HTTP ${response.status}`);
    assert.equal((await response.json()).dist.integrity, integrity, "Versão já publicada com conteúdo diferente");
    console.log(`Já publicado com o mesmo conteúdo: ${name}@${version}`);
  }
}
