/**
 * Built-in plugin registry.
 *
 * These plugins surface context that the main scan misses because it lives in
 * dotfile directories that `collectFiles()` skips (`.github/`, `.circleci/`,
 * `.husky/`, `.git/hooks/`, `.claude/`). Each plugin discovers those files
 * independently from `project.root` and self-gates: it returns `{}` when nothing
 * relevant is present, so auto-loading them is a no-op on projects without CI,
 * git hooks, or agent skills.
 *
 * Auto-loaded by default (opt out per plugin via `disableDetectors: ["cicd"]`):
 *   - cicd      — GitHub Actions / CircleCI pipelines
 *   - githooks  — lefthook / husky / raw .git/hooks
 *   - skills    — .claude/commands + .claude/skills
 *
 * NOT auto-loaded: `terraform`. It intentionally reaches OUTSIDE the scanned
 * directory (sibling `../infrastructure` repos) and is most useful with explicit
 * `serviceName`/`infraPath` config, so silently reading files outside the target
 * dir would be surprising. Enable it opt-in via `codesight.config`:
 *
 *   import { createTerraformPlugin } from "codesight/plugins/terraform";
 *   export default { plugins: [createTerraformPlugin({ infraPath: "../infra" })] };
 */
import type { CodesightPlugin } from "../types.js";
import { createCICDPlugin } from "./cicd/index.js";
import { createGitHooksPlugin } from "./githooks/index.js";
import { createSkillsPlugin } from "./skills/index.js";

/** Names of the auto-loaded built-ins, usable as `disableDetectors` keys. */
export const BUILTIN_PLUGIN_NAMES = ["cicd", "githooks", "skills"] as const;

/**
 * The default plugins that run on every scan, minus any whose name appears in
 * `disabled` (sourced from `disableDetectors`). Order is stable; each is inert
 * when its target files are absent.
 */
export function createBuiltinPlugins(disabled: ReadonlySet<string> = new Set()): CodesightPlugin[] {
  const all: CodesightPlugin[] = [
    createCICDPlugin(),
    createGitHooksPlugin(),
    createSkillsPlugin(),
  ];
  return all.filter((p) => !disabled.has(p.name));
}

export { createCICDPlugin, createGitHooksPlugin, createSkillsPlugin };
export { createTerraformPlugin } from "./terraform/index.js";
