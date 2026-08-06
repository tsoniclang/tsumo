import { createTsumoError } from "../diagnostics.js";
import { buildMenuHierarchy, flattenMenuEntries } from "../menus.js";
import { MenuEntry, PageContext, SiteContext } from "../models.js";
import { compareText, trimEndChar, trimStartChar } from "../utils/strings.js";
import { ContentPageSource } from "./content-model.js";

const normalizePageReference = (value: string): string =>
  trimEndChar(trimStartChar(value.trim(), "/"), "/").toLowerCase();

const createPageIndex = (pages: PageContext[]): Map<string, PageContext> => {
  const index = new Map<string, PageContext>();
  for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
    const page = pages[pageIndex]!;
    const key = normalizePageReference(page.relPermalink);
    if (index.has(key)) {
      throw createTsumoError("TSUMO_MENU_PAGE_IDENTITY_CONFLICT", `Multiple pages have route '${page.relPermalink}'`);
    }
    index.set(key, page);
  }
  return index;
};

const resolveMenuPageReferences = (entries: MenuEntry[], pagesByRoute: Map<string, PageContext>): void => {
  for (let index = 0; index < entries.length; index++) {
    const entry = entries[index]!;
    if (entry.pageRef.trim() !== "") {
      const page = pagesByRoute.get(normalizePageReference(entry.pageRef));
      if (page === undefined) {
        const entryIdentity = entry.identifier.trim() !== "" ? entry.identifier : entry.name;
        throw createTsumoError(
          "TSUMO_MENU_PAGE_REF_NOT_FOUND",
          `Menu entry '${entryIdentity}' names missing page '${entry.pageRef}'`,
        );
      }
      entry.page = page;
    }
    resolveMenuPageReferences(entry.children, pagesByRoute);
  }
};

export const configureSiteMenus = (
  pageSources: ContentPageSource[],
  pages: PageContext[],
  site: SiteContext,
): void => {
  if (pageSources.length !== pages.length) {
    throw createTsumoError(
      "TSUMO_MENU_PAGE_ALIGNMENT_INVALID",
      "Content sources and page contexts must remain exactly aligned",
    );
  }

  const frontMatterByMenu = new Map<string, MenuEntry[]>();
  for (let pageIndex = 0; pageIndex < pageSources.length; pageIndex++) {
    const source = pageSources[pageIndex]!;
    const page = pages[pageIndex]!;
    for (let menuIndex = 0; menuIndex < source.menus.length; menuIndex++) {
      const menu = source.menus[menuIndex]!;
      const menuName = menu.menu.trim();
      if (menuName === "") {
        throw createTsumoError("TSUMO_MENU_NAME_REQUIRED", "Front matter menu entries require a menu name", source.sourcePath);
      }
      const entry = new MenuEntry(
        menu.name !== "" ? menu.name : page.title,
        "",
        "",
        menu.title,
        menu.weight,
        menu.parent,
        menu.identifier !== "" ? menu.identifier : page.relPermalink,
        menu.pre,
        menu.post,
        menuName,
      );
      entry.page = page;
      const entries = frontMatterByMenu.get(menuName) ?? [];
      entries.push(entry);
      frontMatterByMenu.set(menuName, entries);
    }
  }

  const menuNames = Array.from(frontMatterByMenu.keys());
  menuNames.sort((left: string, right: string) => compareText(left, right));
  for (let index = 0; index < menuNames.length; index++) {
    const menuName = menuNames[index]!;
    const existing = site.Menus.get(menuName);
    const combined: MenuEntry[] = existing === undefined ? [] : flattenMenuEntries(existing);
    const additions = frontMatterByMenu.get(menuName);
    if (additions === undefined) {
      throw createTsumoError(
        "TSUMO_MENU_CONFIGURATION_INCONSISTENT",
        `Menu '${menuName}' disappeared while its immutable configuration was being resolved`,
      );
    }
    for (let entryIndex = 0; entryIndex < additions.length; entryIndex++) combined.push(additions[entryIndex]!);
    site.Menus.set(menuName, buildMenuHierarchy(combined));
  }

  const pagesByRoute = createPageIndex(pages);
  for (const entries of site.Menus.values()) resolveMenuPageReferences(entries, pagesByRoute);
};
