export let secrets: Record<string, string> = {};

export async function setSecrets(values: Record<string, string>) {
  secrets = values;
  return await Promise.resolve();
}

export async function setSecret(key: string, value: string) {
  secrets[key] = value;
  return await Promise.resolve();
}

export async function getSecret(key: string): Promise<string | undefined> {
  const value = secrets[key];
  return await Promise.resolve(value);
}

export let env = "dev";

export function setEnv(value: string) {
  env = value;
}

export async function loadSecrets(filename: string, env: string) {
  secrets = JSON.parse(
    await Deno.readTextFile(filename),
  )[env];
}

export async function writeSecrets(filename: string, env: string) {
  let contents: Record<string, Record<string, string>> = {};

  try {
    contents = JSON.parse(
      await Deno.readTextFile(filename),
    );
  } catch (e) {
    if (!(e instanceof Deno.errors.NotFound)) {
      throw e;
    }
  }

  contents[env] = secrets;

  await Deno.writeTextFile(filename, JSON.stringify(contents, null, 2));
}
