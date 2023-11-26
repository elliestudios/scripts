import { generatePassword } from "https://deno.land/x/pass@1.2.3/mod.ts";
import { Command } from "https://deno.land/x/cliffy@v1.0.0-rc.3/command/mod.ts";
import { Input } from "https://deno.land/x/cliffy@v1.0.0-rc.3/prompt/mod.ts";
import { getAvailablePort } from "https://deno.land/x/port@1.0.0/mod.ts";

import { parser } from "./parser.ts";
import {
  extractEnvironmentsVariablesAndServices,
  assertValidReferences,
  convertToEnvVars,
  renderEnvValue,
  EnvVarObject,
} from "./utils.ts";
import { resolveTree } from "./tree.ts";

await new Command()
  .name("envgen")
  .version("0.1.0")
  .description("Generate environment variables from .env.example files")
  .command("info", "Display information about the input file")
  .arguments("<input:string>")
  .action(async (_, input) => {
    const ast = parser(await Deno.readTextFile(input));

    const { environments, variables, services } =
      extractEnvironmentsVariablesAndServices(ast);

    console.log("Environments:", [...environments].join(", "));
    console.log("Variables:", [...variables].join(", "));
    console.log("Services:", [...services].join(", "));
  })
  .command("gen", "Generate environment variables from an input file")
  .option(
    "-f, --secret-file <file:string>",
    "Path to the secrets persistance file",
    {
      default: ".secrets.json",
    },
  )
  .option("-e --env <env:string>", "Environment to generate", {
    default: "dev",
  })
  .option("-s --service <service:string>", "Service to generate")
  .arguments("<input:string>")
  .action(async (options, input) => {
    try {
      await Deno.stat(options.secretFile);
    } catch {
      await Deno.writeTextFile(options.secretFile, "{}");
      console.warn("Created new secrets file - THIS MUST NOT BE COMMITED!");
    }
    const secrets: Record<string, Record<string, string>> = JSON.parse(
      await Deno.readTextFile(options.secretFile),
    );
    secrets[options.env] ??= {};

    const ast = parser(await Deno.readTextFile(input));

    const { environments, variables, services } =
      extractEnvironmentsVariablesAndServices(ast);

    if (!environments.has(options.env)) {
      throw new Error(`Environment "${options.env}" does not exist`);
    }

    if (options.service != null && !services.has(options.service)) {
      throw new Error(`Service "${options.service}" does not exist`);
    }

    assertValidReferences(ast, variables);

    const allEnvVars = convertToEnvVars(ast);

    async function resolveVariableValue(
      envVar: EnvVarObject,
    ): Promise<EnvVarObject> {
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

      if (envVar.info.dependencies.length > 0) {
        return envVar;
      }

      if (secrets[options.env]?.[envVar.name] != null) {
        return {
          ...envVar,
          value: [{ type: "string", value: secrets[options.env][envVar.name] }],
        };
      }

      if (envVar.info.askEnvs.includes(options.env) || envVar.info.alwaysAsk) {
        const defaultValue =
          envVar.info.deafultByEnv[options.env] ?? envVar.info.defaultValue;
        const value = await Input.prompt({
          message: `Enter value for ${envVar.name}:`,
          default:
            defaultValue != null ? renderEnvValue(defaultValue) : undefined,
        });

        secrets[options.env][envVar.name] = value;

        return { ...envVar, value: [{ type: "string", value }] };
      }

      if (envVar.info.deafultByEnv[options.env] != null) {
        return generateDependencies({
          ...envVar,
          value: envVar.info.deafultByEnv[options.env],
        });
      }

      if (envVar.info.defaultValue != null) {
        return generateDependencies({
          ...envVar,
          value: envVar.info.defaultValue,
        });
      }

      if (envVar.type === "port") {
        const value = await getAvailablePort();
        if (value == null) {
          throw new Error("Could not find available port");
        }
        secrets[options.env][envVar.name] = value.toString();

        return {
          ...envVar,
          value: [{ type: "string", value: value.toString() }],
        };
      }

      if (envVar.type === "secret") {
        const value = generatePassword(64, true, false);
        secrets[options.env][envVar.name] = value;
        return { ...envVar, value: [{ type: "string", value }] };
      }

      return envVar;
    }

    const unresolvedVars = allEnvVars.filter((envVar) => {
      if (envVar.info.envs != null && !envVar.info.envs.includes(options.env)) {
        return false;
      } else if (
        options.service != null &&
        envVar.info.services != null &&
        !envVar.info.services.includes(options.service)
      ) {
        return false;
      } else {
        return true;
      }
    });
    const envVars = [];
    for (const envVar of unresolvedVars) {
      const resolved = await resolveVariableValue(envVar);
      envVars.push(resolved);
    }

    const dependencyTree = envVars.reduce<Record<string, string[]>>(
      (tree, envVar) => {
        tree[envVar.name] = envVar.info.dependencies;
        return tree;
      },
      {},
    );

    let addedDependency = true;
    while (addedDependency) {
      addedDependency = false;
      for (const dependencies of Object.values(dependencyTree)) {
        for (const dependency of dependencies) {
          const dependentVar = allEnvVars.find(
            (envVar) => envVar.name === dependency,
          );

          if (dependentVar == null) {
            throw new Error(`Missing dependency: ${dependency}`);
          }

          dependencyTree[dependentVar.name] = dependentVar.info.dependencies;
        }
      }
    }

    const dependencyChain = resolveTree(dependencyTree);

    const variablesResolved: Record<string, string> = {};
    const noSubstituteVariableNames = new Set<string>(
      envVars.map((envVar) => envVar.name),
    );
    for (const dependency of dependencyChain) {
      const envVar =
        envVars.find((envVar) => envVar.name === dependency) ??
        allEnvVars.find((envVar) => envVar.name === dependency);
      if (envVar == null) {
        throw new Error(`Missing dependency: ${dependency}`);
      }

      const resolved = await resolveVariableValue(envVar);
      variablesResolved[dependency] = renderEnvValue(
        resolved.value,
        (variable) => {
          if (noSubstituteVariableNames.has(variable)) {
            return null;
          } else {
            return variablesResolved[variable];
          }
        },
      );
    }

    const finalVars = envVars.map(
      (envVar) => [envVar.name, variablesResolved[envVar.name]] as const,
    );

    console.log(
      finalVars.map(([name, value]) => `${name}=${value}`).join("\n"),
    );

    await Deno.writeTextFile(
      options.secretFile,
      JSON.stringify(secrets, null, 2),
    );
  })
  .parse(Deno.args);
