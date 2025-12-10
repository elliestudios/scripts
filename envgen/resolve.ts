import { Input } from "@cliffy/prompt";
import getPort from "get-port";
import PasswordGenerator from "@rabbit-company/password-generator";

import { parseValueWithVariables } from "./parser.ts";
import { EnvVarObject, renderEnvValue } from "./utils.ts";
import { getSecret, setSecret } from "./secrets.ts";

function generateDependencies(envVar: EnvVarObject): EnvVarObject {
  const dependencies = new Set([
    ...envVar.value
      .filter(
        (value): value is { type: "variable"; variable: string } =>
          value.type === "variable",
      )
      .map((value) => value.variable),
    ...envVar.info.dependencies,
  ]);

  return {
    ...envVar,
    info: {
      ...envVar.info,
      dependencies: [...dependencies],
    },
  };
}

export async function resolveDependencies(
  allEnvVars: EnvVarObject[],
  resolved: Record<string, string>,
  toResolve: string[],
  env: string,
): Promise<{ unresolved: string[]; resolved: Record<string, string> }> {
  const unresolved: string[] = [];

  for (const name of toResolve) {
    const envVar = allEnvVars.find((envVar) => envVar.name === name);
    if (envVar == null) {
      throw new Error(`Could not find variable ${name}`);
    }

    const resolvedEnvVar = await resolveAll(envVar, env);

    const unresolvedDependencies = resolvedEnvVar.info.dependencies.filter(
      (dependency) => resolved[dependency] == null,
    );
    if (unresolvedDependencies.length > 0) {
      unresolved.push(...resolvedEnvVar.info.dependencies, envVar.name);
    } else {
      resolved[resolvedEnvVar.name] = renderEnvValue(resolvedEnvVar.value);
    }
  }

  if (unresolved.length > 0) {
    return await resolveDependencies(allEnvVars, resolved, unresolved, env);
  }

  return { unresolved, resolved };
}

export async function resolveDefault(
  envVar: EnvVarObject,
  env: string,
): Promise<EnvVarObject> {
  if (envVar.info.deafultByEnv[env] != null) {
    return generateDependencies({
      ...envVar,
      value: envVar.info.deafultByEnv[env],
      info: {
        ...envVar.info,
        defaultValue: undefined,
        dependencies: [],
      },
    });
  }

  if (envVar.info.defaultValue != null) {
    return generateDependencies({
      ...envVar,
      value: envVar.info.defaultValue,
      info: {
        ...envVar.info,
        defaultValue: undefined,
        dependencies: [],
      },
    });
  }

  return await Promise.resolve(envVar);
}

export async function resolveAsk(envVar: EnvVarObject, env: string) {
  const defaultValue =
    envVar.info.deafultByEnv[env] ?? envVar.info.defaultValue;
  const value = await Input.prompt({
    message: `Enter value for ${envVar.name}:`,
    default: defaultValue != null ? renderEnvValue(defaultValue) : undefined,
  });

  await setSecret(envVar.name, value);

  return generateDependencies({
    ...envVar,
    value: parseValueWithVariables(value),
  });
}

export async function resolvePort(envVar: EnvVarObject, _env: string) {
  const value = (await getPort())?.toString();
  if (value == null) {
    throw new Error("Could not find available port");
  }

  await setSecret(envVar.name, value);

  return {
    ...envVar,
    value: [{ type: "string" as const, value: value }],
  };
}

export async function resolveSecret(envVar: EnvVarObject, _env: string) {
  const value = PasswordGenerator.generate(64, true, true, false);
  await setSecret(envVar.name, value);
  return { ...envVar, value: [{ type: "string" as const, value }] };
}

export async function resolveAll(
  envVar: EnvVarObject,
  env: string,
): Promise<EnvVarObject> {
  const savedSecretValue = await getSecret(envVar.name);
  if (savedSecretValue != null) {
    return {
      ...envVar,
      value: parseValueWithVariables(savedSecretValue),
    };
  }

  if (envVar.info.askEnvs.includes(env) || envVar.info.alwaysAsk) {
    return resolveAsk(envVar, env);
  }

  if (
    envVar.info.deafultByEnv[env] != null ||
    envVar.info.defaultValue != null
  ) {
    return resolveDefault(envVar, env);
  }

  if (envVar.type === "port") {
    return resolvePort(envVar, env);
  }

  if (envVar.type === "secret") {
    return resolveSecret(envVar, env);
  }

  return await Promise.resolve(envVar);
}
