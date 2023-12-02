import { Command } from "https://deno.land/x/cliffy@v1.0.0-rc.3/command/mod.ts";
import { isPresent } from "https://esm.sh/ts-extras@0.11.0";

import { EnvValue, parser, parseValueWithVariables } from "./parser.ts";
import {
  assertValidReferences,
  convertToEnvVars,
  EnvVarObject,
  extractEnvironmentsVariablesAndServices,
  renderEnvValue,
} from "./utils.ts";
import { loadSecrets, writeSecrets } from "./secrets.ts";
import { resolveDependencies } from "./resolve.ts";

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
    await loadSecrets(options.secretFile, options.env);

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

    function matchesEnvAndService(envVar: EnvVarObject) {
      const services = new Set([
        ...envVar.info.services,
        ...envVar.info.reflections?.map((r) => r.service).filter(isPresent) ??
          [],
      ]);
      if (envVar.info.envs != null && !envVar.info.envs.includes(options.env)) {
        return false;
      } else if (
        options.service != null &&
        !services.has(options.service)
      ) {
        return false;
      } else {
        return true;
      }
    }

    const unresolvedVars = allEnvVars.filter((envVar) =>
      matchesEnvAndService(envVar)
    );
    const envVars = await resolveDependencies(
      allEnvVars,
      {},
      unresolvedVars.map((v) => v.name),
      options.env,
    );

    const varsToRender: Array<[string, string]> = [];
    for (const envVar of allEnvVars) {
      const reflectedVars: EnvVarObject[] =
        envVar.info.reflections?.map((reflection) => {
          return {
            ...envVar,
            name: `${reflection.prefix}_${envVar.name}`,
            value: [{
              type: "variable",
              variable: envVar.name,
            }],
            info: {
              ...envVar.info,
              services: reflection.service != null
                ? [reflection.service]
                : [...envVar.info.services],
              reflections: undefined,
              dependencies: [],
            },
          };
        }) ?? [];

      const resolvedValue = envVars.resolved[envVar.name];

      const modifiedEnvVar: EnvVarObject = {
        ...envVar,
        value: resolvedValue != null
          ? parseValueWithVariables(envVars.resolved[envVar.name])
          : [],
        info: {
          ...envVar.info,
          reflections: undefined,
        },
      };

      for (const toRender of [modifiedEnvVar, ...reflectedVars]) {
        if (matchesEnvAndService(toRender)) {
          varsToRender.push([
            toRender.name,
            renderEnvValue(
              toRender.value,
            ),
          ]);
        }
      }
    }

    const existingVars = new Set(varsToRender.map(([name]) => name));
    function renderVar(value: EnvValue): string {
      return renderEnvValue(value, (variable) => {
        if (existingVars.has(variable)) {
          return null;
        } else {
          const value = parseValueWithVariables(envVars.resolved[variable]);
          return renderVar(value);
        }
      });
    }
    const finalVars = varsToRender.map(([name, value]) => {
      const envValue = parseValueWithVariables(value);
      const newValue = renderVar(envValue);
      return [name, newValue];
    });

    console.log(
      finalVars.map(([name, value]) => `${name}=${value}`).join("\n"),
    );

    await writeSecrets(options.secretFile, options.env);
  })
  .parse(Deno.args);
