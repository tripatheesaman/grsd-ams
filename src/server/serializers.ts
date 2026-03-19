export function jsonSafe(input: unknown) {
  return JSON.parse(
    JSON.stringify(input, (_k, value) => (typeof value === "bigint" ? value.toString() : value)),
  );
}

export const jsonWithNumber = jsonSafe;
