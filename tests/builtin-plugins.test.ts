import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

async function setup(files: Record<string, string>): Promise<string> {
  const root = join(tmpdir(), `codesight-builtin-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  for (const [rel, content] of Object.entries(files)) {
    const full = join(root, rel);
    await mkdir(join(full, ".."), { recursive: true });
    await writeFile(full, content);
  }
  return root;
}

async function cleanup(root: string) {
  await rm(root, { recursive: true, force: true });
}

const fakeProject = (root: string) => ({
  root,
  name: "demo",
  frameworks: [],
  language: "typescript",
  orms: [],
  isMonorepo: false,
  workspaces: [],
  repoType: "single" as const,
});

describe("Built-in plugin registry", async () => {
  const { createBuiltinPlugins, BUILTIN_PLUGIN_NAMES, createTerraformPlugin } = await import(
    "../dist/plugins/index.js"
  );

  it("auto-loads cicd, githooks, and skills by default", () => {
    const names = createBuiltinPlugins().map((p: any) => p.name);
    assert.deepEqual(names, ["cicd", "githooks", "skills"]);
    assert.deepEqual([...BUILTIN_PLUGIN_NAMES], ["cicd", "githooks", "skills"]);
  });

  it("does NOT auto-load terraform (opt-in only, reaches outside project root)", () => {
    const names = createBuiltinPlugins().map((p: any) => p.name);
    assert.ok(!names.includes("terraform"), "terraform must not be auto-loaded");
    // ...but it is still importable/usable on demand.
    assert.equal(typeof createTerraformPlugin, "function");
    assert.equal(createTerraformPlugin().name, "terraform");
  });

  it("respects disableDetectors: a disabled name is dropped", () => {
    const disabled = new Set(["cicd"]);
    const names = createBuiltinPlugins(disabled).map((p: any) => p.name);
    assert.deepEqual(names, ["githooks", "skills"]);
  });

  it("returns nothing when every built-in is disabled", () => {
    const disabled = new Set(["cicd", "githooks", "skills"]);
    assert.equal(createBuiltinPlugins(disabled).length, 0);
  });

  it("self-gates: built-ins emit sections only for files that exist", async () => {
    const root = await setup({
      ".github/workflows/ci.yml": "name: ci\non: [push]\njobs:\n  build:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo hi\n",
      ".claude/commands/review.md": "---\ndescription: Review the PR\n---\nReview it.",
      // deliberately NO git hooks → githooks must stay silent
    });
    try {
      const plugins = createBuiltinPlugins();
      const results = await Promise.all(
        plugins.map((p: any) => p.detector!([], fakeProject(root)))
      );
      const byName: Record<string, any> = {};
      plugins.forEach((p: any, i: number) => (byName[p.name] = results[i]));

      assert.ok(byName.cicd.customSections?.length === 1, "cicd should emit a section");
      assert.ok(byName.cicd.customSections[0].content.length > 0);
      assert.ok(byName.skills.customSections?.length === 1, "skills should emit a section");
      assert.deepEqual(byName.githooks, {}, "githooks self-gates to {} when no hooks present");
    } finally {
      await cleanup(root);
    }
  });
});
