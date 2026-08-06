import { createTsumoError } from "./diagnostics.js";
import { MenuEntry } from "./models.js";
import { compareText } from "./utils/strings.js";

const menuEntryIdentity = (entry: MenuEntry): string =>
  entry.identifier.trim() !== "" ? entry.identifier.trim() : entry.name.trim();

const compareMenuEntries = (left: MenuEntry, right: MenuEntry): number => {
  if (left.weight !== right.weight) return left.weight - right.weight;
  const identity = compareText(menuEntryIdentity(left), menuEntryIdentity(right));
  if (identity !== 0) return identity;
  const name = compareText(left.name, right.name);
  return name !== 0 ? name : compareText(left.url, right.url);
};

const sortHierarchy = (entries: MenuEntry[]): MenuEntry[] => {
  entries.sort((left: MenuEntry, right: MenuEntry) => compareMenuEntries(left, right));
  for (let index = 0; index < entries.length; index++) {
    const entry = entries[index]!;
    entry.children = sortHierarchy(entry.children);
  }
  return entries;
};

const assertAcyclicParents = (entries: MenuEntry[], byIdentity: Map<string, MenuEntry>): void => {
  for (let index = 0; index < entries.length; index++) {
    const visited = new Map<string, boolean>();
    let current = entries[index]!;
    while (current.parent.trim() !== "") {
      const identity = menuEntryIdentity(current);
      if (visited.has(identity)) {
        throw createTsumoError("TSUMO_MENU_PARENT_CYCLE", `Menu parent cycle includes '${identity}'`);
      }
      visited.set(identity, true);
      const parent = byIdentity.get(current.parent.trim());
      if (parent === undefined) {
        throw createTsumoError(
          "TSUMO_MENU_PARENT_NOT_FOUND",
          `Menu entry '${identity}' names missing parent '${current.parent}'`,
        );
      }
      current = parent;
    }
  }
};

export const buildMenuHierarchy = (entries: MenuEntry[]): MenuEntry[] => {
  const byIdentity = new Map<string, MenuEntry>();
  for (let index = 0; index < entries.length; index++) {
    const entry = entries[index]!;
    entry.children = [];
    const identity = menuEntryIdentity(entry);
    if (identity === "") {
      throw createTsumoError("TSUMO_MENU_IDENTITY_REQUIRED", "Every menu entry requires an identifier or name");
    }
    if (byIdentity.has(identity)) {
      throw createTsumoError("TSUMO_MENU_IDENTITY_DUPLICATE", `Duplicate menu entry identity: ${identity}`);
    }
    byIdentity.set(identity, entry);
  }
  assertAcyclicParents(entries, byIdentity);

  const topLevel: MenuEntry[] = [];
  for (let index = 0; index < entries.length; index++) {
    const entry = entries[index]!;
    const parentName = entry.parent.trim();
    if (parentName === "") {
      topLevel.push(entry);
    } else {
      const parent = byIdentity.get(parentName);
      if (parent === undefined) {
        throw createTsumoError(
          "TSUMO_MENU_PARENT_NOT_FOUND",
          `Menu entry '${menuEntryIdentity(entry)}' names missing parent '${parentName}'`,
        );
      }
      parent.children.push(entry);
    }
  }
  return sortHierarchy(topLevel);
};

const appendFlatMenuEntries = (entries: MenuEntry[], result: MenuEntry[]): void => {
  for (let index = 0; index < entries.length; index++) {
    const entry = entries[index]!;
    const clone = new MenuEntry(
      entry.name,
      entry.url,
      entry.pageRef,
      entry.title,
      entry.weight,
      entry.parent,
      entry.identifier,
      entry.pre,
      entry.post,
      entry.menu,
      entry.Params,
    );
    clone.page = entry.page;
    result.push(clone);
    appendFlatMenuEntries(entry.children, result);
  }
};

export const flattenMenuEntries = (entries: MenuEntry[]): MenuEntry[] => {
  const result: MenuEntry[] = [];
  appendFlatMenuEntries(entries, result);
  return result;
};
