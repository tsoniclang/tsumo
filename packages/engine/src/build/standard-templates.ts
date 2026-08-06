import { BuildEnvironment } from "../env.js";
import { selectTemplate } from "./layout.js";

export class StandardTemplates {
  base: string | undefined;
  home: string;
  list: string;
  single: string;

  constructor(base: string | undefined, home: string, list: string, single: string) {
    this.base = base;
    this.home = home;
    this.list = list;
    this.single = single;
  }
}

export const selectStandardTemplates = (environment: BuildEnvironment): StandardTemplates => {
  const baseCandidates = ["_default/baseof.html", "baseof.html"];
  const homeCandidates = ["index.html", "home.html", "_default/home.html", "_default/list.html", "list.html"];
  const listCandidates = ["list.html", "_default/list.html"];
  const singleCandidates = ["single.html", "_default/single.html"];
  const list = selectTemplate(environment, listCandidates) ?? listCandidates[0]!;
  return new StandardTemplates(
    selectTemplate(environment, baseCandidates),
    selectTemplate(environment, homeCandidates) ?? list,
    list,
    selectTemplate(environment, singleCandidates) ?? singleCandidates[0]!,
  );
};
