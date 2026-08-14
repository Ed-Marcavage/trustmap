import fs from 'node:fs';
import path from 'node:path';

export const name = 'archify-dsh-skill-probe';
export const inject = ['skills'];

export async function apply(ctx) {
  const out = process.env.ARCHIFY_DSH_PROBE_OUT;
  if (!out) throw new Error('ARCHIFY_DSH_PROBE_OUT is required for the test-only skill probe');
  const cwd = process.cwd();
  const list = await ctx.skills.list({ cwd });
  const archify = list.find((skill) => skill.name === 'archify');
  const definition = archify ? await ctx.skills.get('archify', { cwd }) : null;
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, `${JSON.stringify({
    skills: list.map((skill) => ({
      name: skill.name,
      provider: skill.provider,
      resourceBase: skill.resourceBase,
      path: skill.path,
    })),
    definition: definition && {
      name: definition.name,
      provider: definition.provider,
      resourceBase: definition.resourceBase,
      path: definition.path,
      contentLength: definition.content?.length || 0,
    },
  }, null, 2)}\n`);
  const exit = ctx.cmdlineArgs?.exit || ctx.appExit;
  if (typeof exit === 'function') exit(0);
}
