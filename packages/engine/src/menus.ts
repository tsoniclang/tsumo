import { Dictionary, List } from "@tsonic/dotnet/System.Collections.Generic.js";
import { MenuEntry } from "./models.ts";

// Sort menu entries by weight
export const sortMenuEntries = (entries: MenuEntry[]): MenuEntry[] => {
  const copy = new List<MenuEntry>();
  for (let i = 0; i < entries.length; i++) copy.add(entries[i]!);
  copy.sort((a: MenuEntry, b: MenuEntry) => a.weight - b.weight);
  return copy.toArray();
};

// Build parent/children hierarchy from flat entries array
// Returns only top-level entries (children are nested in parent.children)
export const buildMenuHierarchy = (entries: MenuEntry[]): MenuEntry[] => {
  const topLevel = new List<MenuEntry>();
  const byIdentifier = new Dictionary<string, MenuEntry>();

  // Build identifier index
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]!;
    const id = entry.identifier !== "" ? entry.identifier : entry.name;
    if (id !== "") {
      byIdentifier.remove(id);
      byIdentifier.add(id, entry);
    }
  }

  // Assign children to parents
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]!;
    if (entry.parent === "") {
      topLevel.add(entry);
    } else {
      let parentEntry: MenuEntry = entries[0]!;
      const found = byIdentifier.tryGetValue(entry.parent, parentEntry);
      if (found) {
        const children = new List<MenuEntry>();
        for (let j = 0; j < parentEntry.children.length; j++) children.add(parentEntry.children[j]!);
        children.add(entry);
        children.sort((a: MenuEntry, b: MenuEntry) => a.weight - b.weight);
        parentEntry.children = children.toArray();
      } else {
        topLevel.add(entry);
      }
    }
  }

  return sortMenuEntries(topLevel.toArray());
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
  const newChildren = new List<MenuEntry>();
  for (let i = 0; i < parent.children.length; i++) newChildren.add(parent.children[i]!);
  newChildren.add(child);
  newChildren.sort((a: MenuEntry, b: MenuEntry) => a.weight - b.weight);
  parent.children = newChildren.toArray();
};

// Add entry to top-level menu in sorted order
export const addToTopLevel = (entries: MenuEntry[], entry: MenuEntry): MenuEntry[] => {
  const newEntries = new List<MenuEntry>();
  for (let i = 0; i < entries.length; i++) newEntries.add(entries[i]!);
  newEntries.add(entry);
  newEntries.sort((a: MenuEntry, b: MenuEntry) => a.weight - b.weight);
  return newEntries.toArray();
};

// Helper to collect entries recursively into a list
const collectFlatEntries = (list: MenuEntry[], result: List<MenuEntry>): void => {
  for (let i = 0; i < list.length; i++) {
    const entry = list[i]!;
    // Recursively collect children first
    if (entry.children.length > 0) {
      collectFlatEntries(entry.children, result);
    }
    // Clear children array since we're flattening
    const emptyChildren: MenuEntry[] = [];
    entry.children = emptyChildren;
    result.add(entry);
  }
};

// Flatten a hierarchical menu into a flat list (children are cleared)
// This extracts all entries recursively and returns them as a flat array
export const flattenMenuEntries = (entries: MenuEntry[]): MenuEntry[] => {
  const result = new List<MenuEntry>();
  collectFlatEntries(entries, result);
  return result.toArray();
};
