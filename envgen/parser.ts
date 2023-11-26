export type EnvAst = {
  type: "root";
  symbols: Array<EnvAttribute | EnvInfo | EnvComment>;
};

export type EnvType = "url" | "string" | "port" | "secret";

export type EnvInfo =
  | {
      type: "info-type";
      name: EnvType;
    }
  | {
      type: "info-service";
      services: string[];
    }
  | {
      type: "info-reflect";
      service?: string;
      reflects: string[];
    }
  | {
      type: "info-env";
      env: string[];
    }
  | {
      type: "info-default";
      env?: string;
      default: EnvValue;
    }
  | {
      type: "info-ask";
      env?: string[];
    };

export type EnvAttribute = {
  type: "attribute";
  name: string;
  value: EnvValue;
};

export type EnvValue = Array<
  | {
      type: "string";
      value: string;
    }
  | {
      type: "variable";
      variable: string;
    }
>;

export type EnvComment = {
  type: "comment";
  comment: string;
};

export type KeyValue = {
  name: string;
  value?: string;
  params?: Array<KeyValue>;
};

function parseKeyValue(line: string, separator = "="): KeyValue {
  const separatorIndex = line.indexOf(separator);

  if (separatorIndex === -1) {
    throw new Error(`Invalid line: ${line}`);
  }

  const nameWithParams = line.slice(0, separatorIndex).trim();
  let name, params;
  const hasParams =
    nameWithParams.includes("(") && nameWithParams.endsWith(")");
  if (hasParams) {
    const paramIndex = nameWithParams.indexOf("(");
    const paramsWithoutClosingParenthesis = nameWithParams.slice(
      paramIndex + 1,
      -1,
    );
    const paramsArray = paramsWithoutClosingParenthesis.split(",");
    params = paramsArray.map((param) => parseValueOrKeyValue(param));
    name = nameWithParams.slice(0, paramIndex).trim();
  } else {
    name = nameWithParams;
  }

  const value = line.slice(separatorIndex + 1);

  return { name: name.trim(), value: value.trim(), params };
}

function parseValueOrKeyValue(line: string, separator = "="): KeyValue {
  try {
    return parseKeyValue(line, separator);
  } catch {
    return { name: line.trim() };
  }
}

export function parseValueWithVariables(value: string): EnvValue {
  if (value.startsWith('"') && value.endsWith('"')) {
    value = value.slice(1, -1);
  }

  const variables = value.match(/\$\{[a-zA-Z0-9_]+\}/g);

  if (variables == null) {
    return [{ type: "string", value }];
  }

  const result: EnvValue = [];

  let lastVariableIndex = 0;

  for (const variable of variables) {
    const variableIndex = value.indexOf(variable);

    if (variableIndex > lastVariableIndex) {
      result.push({
        type: "string",
        value: value.slice(lastVariableIndex, variableIndex),
      });
    }

    result.push({
      type: "variable",
      variable: variable.slice(2, -1),
    });

    lastVariableIndex = variableIndex + variable.length;
  }

  if (lastVariableIndex < value.length) {
    result.push({
      type: "string",
      value: value.slice(lastVariableIndex),
    });
  }

  return result;
}

export function parser(envContents: string) {
  const lines = envContents.split("\n");

  const nonEmptyLines = lines.filter((line) => line.trim().length > 0);

  const ast: EnvAst = {
    type: "root",
    symbols: [],
  };

  for (let i = 0; i < nonEmptyLines.length; i++) {
    const line = nonEmptyLines[i];

    if (line.startsWith("#@")) {
      const { name, value, params } = parseValueOrKeyValue(line.slice(2), ":");

      if (name === "string") {
        ast.symbols.push({
          type: "info-type",
          name: "string",
        });
      } else if (name === "url") {
        ast.symbols.push({
          type: "info-type",
          name: "url",
        });
      } else if (name === "port") {
        ast.symbols.push({
          type: "info-type",
          name: "port",
        });
      } else if (name === "secret") {
        ast.symbols.push({
          type: "info-type",
          name: "secret",
        });
      } else if (name === "service") {
        if (value == null) {
          throw new Error("Invalid service value");
        }

        ast.symbols.push({
          type: "info-service",
          services: value.split(",").map((service) => service.trim()),
        });
      } else if (name === "reflect") {
        if (value == null) {
          throw new Error("Invalid reflect value");
        }

        ast.symbols.push({
          type: "info-reflect",
          service: params?.find((p) => p.name === "service")?.value,
          reflects: value.split(",").map((service) => service.trim()),
        });
      } else if (name === "env") {
        if (value == null) {
          throw new Error("Invalid env value");
        }

        ast.symbols.push({
          type: "info-env",
          env: value.split(",").map((env) => env.trim()),
        });
      } else if (name === "default") {
        if (
          params != null &&
          (params.length > 1 || typeof params[0]?.value !== "undefined")
        ) {
          throw new Error("Invalid default parameters");
        }

        if (value == null) {
          throw new Error("Invalid default value");
        }

        ast.symbols.push({
          type: "info-default",
          env: params?.[0].name,
          default: parseValueWithVariables(value),
        });
      } else if (name === "ask") {
        ast.symbols.push({
          type: "info-ask",
          env: value?.split(",").map((env) => env.trim()),
        });
      }
    } else if (line.startsWith("#")) {
      ast.symbols.push({
        type: "comment",
        comment: line.slice(1),
      });
    } else {
      const { name, value, params } = parseKeyValue(line);

      if (params != null) {
        throw new Error("Invalid variable parameters");
      }

      if (value == null) {
        throw new Error("Invalid variable value");
      }

      ast.symbols.push({
        type: "attribute",
        name,
        value: parseValueWithVariables(value),
      });
    }
  }

  return ast;
}
