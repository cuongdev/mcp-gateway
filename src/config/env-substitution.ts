type EnvLike = Record<string, string | undefined>;

const PLACEHOLDER = /\$\{([A-Z_][A-Z0-9_]*)\}/g;

export function substituteEnv(value: unknown, env: EnvLike = process.env): unknown {
  if (typeof value === 'string') {
    return value.replace(PLACEHOLDER, (_, name: string) => {
      if (!(name in env) || env[name] === undefined) {
        throw new Error(`Missing env var ${name}`);
      }
      return env[name]!;
    });
  }
  if (Array.isArray(value)) {
    return value.map((v) => substituteEnv(v, env));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, substituteEnv(v, env)]),
    );
  }
  return value;
}
