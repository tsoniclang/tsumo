import { isAbsolute, relative, sep } from "node:path";

export const pathContainsOrEquals = (root: string, candidate: string): boolean => {
  const rel = relative(root, candidate);
  return rel === "" || (!isAbsolute(rel) && rel !== ".." && !rel.startsWith(`..${sep}`));
};
