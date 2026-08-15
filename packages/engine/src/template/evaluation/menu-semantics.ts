import { MenuEntry, PageContext } from "../../models.js";
import { trimEndCharacter } from "./serialization.js";

const menuEntryRepresentsPage = (entry: MenuEntry, page: PageContext): boolean => {
  const linkedPage = entry.page;
  if (
    linkedPage !== undefined &&
    trimEndCharacter(linkedPage.relPermalink, "/") === trimEndCharacter(page.relPermalink, "/")
  ) return true;
  if (entry.url === "") return false;
  return trimEndCharacter(entry.url, "/") === trimEndCharacter(page.relPermalink, "/");
};

const menuEntryBelongsToMenu = (entry: MenuEntry, menuName: string): boolean =>
  entry.menu === menuName;

export const isMenuCurrent = (page: PageContext, menuName: string, entry: MenuEntry): boolean =>
  menuEntryBelongsToMenu(entry, menuName) && menuEntryRepresentsPage(entry, page);

export const hasMenuCurrent = (page: PageContext, menuName: string, entry: MenuEntry): boolean => {
  if (!menuEntryBelongsToMenu(entry, menuName)) return false;
  const pending: MenuEntry[] = [];
  for (let index = 0; index < entry.children.length; index++) pending.push(entry.children[index]!);
  while (pending.length > 0) {
    const candidate = pending.pop();
    if (candidate === undefined) break;
    if (menuEntryRepresentsPage(candidate, page)) return true;
    for (let index = 0; index < candidate.children.length; index++) pending.push(candidate.children[index]!);
  }
  return false;
};
