import { checks, literals } from "./rules.mjs";

const classGroups = new Map();
for (const [group, classes] of Object.entries(literals))
  for (const className of classes.split(" ")) classGroups.set(className, group);
const prefixChecks = new Map();
for (const [prefix, group, validators] of checks) {
  if (!prefixChecks.has(prefix)) prefixChecks.set(prefix, []);
  prefixChecks.get(prefix).push([group, validators]);
}

export const parseClass = (className) => {
  let start = 0;
  let brackets = 0;
  let parentheses = 0;
  let slash;
  for (let index = 0; index < className.length; index++) {
    const character = className[index];
    if (!brackets && !parentheses) {
      if (character === ":") start = index + 1;
      if (character === "/") slash = index;
    }
    if (character === "[") brackets++;
    if (character === "]") brackets--;
    if (character === "(") parentheses++;
    if (character === ")") parentheses--;
  }
  let baseClassName = className.slice(start);
  if (baseClassName.endsWith("!")) baseClassName = baseClassName.slice(0, -1);
  else if (baseClassName.startsWith("!")) baseClassName = baseClassName.slice(1);
  // Mantém a posição de / anterior à remoção do ! inicial para compatibilidade.
  return { baseClassName, slash: slash > start ? slash - start : undefined };
};

const lookup = (className) => {
  if (className.startsWith("[") && className.endsWith("]")) {
    const colon = className.indexOf(":");
    return colon > 1 ? "arbitrary.." + className.slice(1, colon) : undefined;
  }
  const positive = className.startsWith("-") ? className.slice(1) : className;
  if (classGroups.has(positive)) return classGroups.get(positive);
  const parts = positive.split("-");
  for (let index = parts.length - 1; index >= 0; index--) {
    const prefix = parts.slice(0, index).join("-");
    const suffix = parts.slice(index).join("-");
    for (const [group, validators] of prefixChecks.get(prefix) ?? [])
      if (validators.some((validate) => validate(suffix))) return group;
  }
};

export const classifyClass = (className) => {
  const { baseClassName, slash } = parseClass(className);
  const group = (slash && lookup(baseClassName.slice(0, slash))) || lookup(baseClassName);
  // Reservas impedem que sintaxes sem cobertura caiam num grupo mais genérico.
  return group === "unknown" ? undefined : group;
};
