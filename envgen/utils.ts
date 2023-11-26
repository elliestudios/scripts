import { EnvAst, EnvType, EnvValue } from "./parser.ts";

export function extractEnvironmentsVariablesAndServices(ast: EnvAst) {
  const environments = new Set<string>();
  const variables = new Set<string>();
  const services = new Set<string>();

  for (const symbol of ast.symbols) {
    switch (symbol.type) {
      case "info-env":
        symbol.env?.forEach((env) => environments.add(env));
        break;
      case "info-default":
        if (symbol.env != null) environments.add(symbol.env);
        break;
      case "info-ask":
        symbol.env?.forEach((env) => environments.add(env));
        break;
      case "info-service":
        symbol.services?.forEach((env) => services.add(env));
        break;
      case "attribute":
        variables.add(symbol.name);
        break;
    }
  }

  return {
    environments,
    variables,
    services,
  };
}

export function assertValidReferences(ast: EnvAst, variables: Set<string>) {
  for (const symbol of ast.symbols) {
    if (symbol.type === "info-default") {
      for (const value of symbol.default) {
        if (value.type === "variable" && !variables.has(value.variable)) {
          throw new Error(`Variable "${value.variable}" does not exist`);
        }
      }
    }
  }
}

export function convertToEnvVars(ast: EnvAst): EnvVarObject[] {
  const envVars = [];
  let currentInfos = [];
  for (const symbol of ast.symbols) {
    if (symbol.type.startsWith("info-")) {
      currentInfos.push(symbol);
    } else if (symbol.type === "attribute") {
      const envs: string[] = [];
      let defaultValue: EnvValue | undefined = undefined;
      const deafultByEnv: Record<string, EnvValue> = {};
      const askEnvs: string[] = [];
      let alwaysAsk = false;
      const services: string[] = [];
      let type: EnvType | undefined = undefined;
      const reflections: Array<{ service?: string; prefix: string }> = [];

      for (const info of currentInfos) {
        switch (info.type) {
          case "info-env":
            info.env?.forEach((env) => envs.push(env));
            break;
          case "info-default":
            if (info.env != null) {
              deafultByEnv[info.env] = info.default;
            } else {
              defaultValue = info.default;
            }
            break;
          case "info-ask":
            info.env?.forEach((env) => askEnvs.push(env));
            if (info.env == null) {
              alwaysAsk = true;
            }
            break;
          case "info-service":
            info.services?.forEach((env) => services.push(env));
            break;
          case "info-type":
            if (type != null) {
              throw new Error("Type already defined");
            }
            type = info.name;
            break;
          case "info-reflect":
            info.reflects?.forEach((prefix) => {
              reflections.push({ service: info.service, prefix });
            });
            break;
        }
      }

      if (type == null) {
        type = "string";
      }

      const variable = {
        name: symbol.name,
        value: symbol.value,
        type,
        info: {
          envs,
          defaultValue,
          deafultByEnv,
          alwaysAsk,
          askEnvs,
          services,
          dependencies: symbol.value
            .filter((value) => value.type === "variable")
            .map((value) => ("variable" in value ? value.variable : null))
            .filter((v): v is string => v != null),
        },
      } satisfies EnvVarObject;

      currentInfos = [];

      for (const reflection of reflections) {
        const reflectionVariable = {
          ...variable,
          name: reflection.prefix + "_" + symbol.name,
          value: [
            {
              type: "variable",
              variable: symbol.name,
            },
          ],
          info: {
            ...variable.info,
            services:
              reflection.service != null
                ? [reflection.service]
                : variable.info.services,
            dependencies: [variable.name],
          },
        } satisfies EnvVarObject;
        envVars.push(reflectionVariable);
      }

      envVars.push(variable);
    }
  }

  return envVars;
}

export type EnvVarObject = {
  name: string;
  value: EnvValue;
  type: EnvType;
  info: {
    envs: string[];
    defaultValue?: EnvValue;
    deafultByEnv: Record<string, EnvValue>;
    alwaysAsk: boolean;
    askEnvs: string[];
    services: string[];
    dependencies: string[];
  };
};

export function renderEnvValue(
  value: EnvValue,
  substitute?: (variable: string) => string | null,
) {
  let renderedValue = "";

  for (const part of value) {
    switch (part.type) {
      case "string":
        renderedValue += part.value;
        break;
      case "variable":
        renderedValue += substitute?.(part.variable) ?? `$\{${part.variable}\}`;
        break;
    }
  }

  return renderedValue;
}
