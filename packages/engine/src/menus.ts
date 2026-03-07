import { MenuEntry } from "./models.ts";

// Sort menu entries by weight
export const sortMenuEntries = (entries: MenuEntry[]): MenuEntry[] => {
  return [...entries].sort((a: MenuEntry, b: MenuEntry) => a.weight - b.weight);
};

// Build parent/children hierarchy from flat entries array
// Returns only top-level entries (children are nested in parent.children)
export const buildMenuHierarchy = (entries: MenuEntry[]): MenuEntry[] => {
  const topLevel: MenuEntry[] = [];
  const byIdentifier = new Map<string, MenuEntry>();

  // Build identifier index
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]!;
    const id = entry.identifier !== "" ? entry.identifier : entry.name;
    if (id !== "") {
      byIdentifier.set(id, entry);
    }
  }

  // Assign children to parents
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]!;
    if (entry.parent === "") {
      topLevel.push(entry);
    } else {
      const parentEntry = byIdentifier.get(entry.parent);
      if (parentEntry !== undefined) {
        parentEntry.children = [...parentEntry.children, entry].sort((a: MenuEntry, b: MenuEntry) => a.weight - b.weight);
      } else {
        topLevel.push(entry);
      }
    }
  }

  return sortMenuEntries(topLevel);
};

// Find a menu entry by identifier, searching recursively through children
export const findMenuEntryByIdentifier = (entries: MenuEntry[], identifier: string): MenuEntry | undefined => {
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]!;
    const entryId = entry.identifier !== "" ? entry.identifier : entry.name;
    if (entryId === identifier) return entry;
    // Search children recursively
    const found = findMenuEntryByIdentifier(entry.children, identifier);
    if (found !== undefined) return found;
  }
  return undefined;
};

// Add entry to parent's children array in sorted order
export const addChildToParent = (parent: MenuEntry, child: MenuEntry): void => {
  parent.children = [...parent.children, child].sort((a: MenuEntry, b: MenuEntry) => a.weight - b.weight);
};

// Add entry to top-level menu in sorted order
export const addToTopLevel = (entries: MenuEntry[], entry: MenuEntry): MenuEntry[] => {
  return [...entries, entry].sort((a: MenuEntry, b: MenuEntry) => a.weight - b.weight);
};

// Helper to collect entries recursively into a list
const collectFlatEntries = (list: MenuEntry[], result: MenuEntry[]): void => {
  for (let i = 0; i < list.length; i++) {
    const entry = list[i]!;
    // Recursively collect children first
    if (entry.children.length > 0) {
      collectFlatEntries(entry.children, result);
    }
    // Clear children array since we're flattening
    entry.children = [];
    result.push(entry);
  }
};

// Flatten a hierarchical menu into a flat list (children are cleared)
// This extracts all entries recursively and returns them as a flat array
export const flattenMenuEntries = (entries: MenuEntry[]): MenuEntry[] => {
  const result: MenuEntry[] = [];
  collectFlatEntries(entries, result);
  return result;
};
