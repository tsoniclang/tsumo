import { basename, isAbsolute, join, resolve } from "node:path";

import { fileExists, readTextFile, writeTextFile } from "../fs.js";
import { replaceText, substringCount } from "../utils/strings.js";
import { humanizeSlug, slugify } from "../utils/text.js";
import { pathContainsOrEquals } from "../utils/paths.js";
import { createTsumoError } from "../diagnostics.js";

const defaultArchetype = (): string => `---
title: "{{ .Title }}"
date: "{{ .Date }}"
draft: true
description: ""
tags: []
categories: []
---

Write your post here.
`;

export const newContent = (siteDir: string, contentPathRaw: string, creationTime?: Date): string => {
  const dir = resolve(siteDir);
  const contentDir = resolve(dir, "content");

  const rel = replaceText(contentPathRaw.trim(), "\\", "/");
  if (rel === "" || isAbsolute(rel)) {
    throw createTsumoError("TSUMO_SCAFFOLD_CONTENT_PATH_INVALID", `Content path must be relative to the site's content directory: ${contentPathRaw}`);
  }
  const withExt = rel.toLowerCase().endsWith(".md") ? rel : rel + ".md";
  const dest = resolve(contentDir, withExt);
  if (!pathContainsOrEquals(contentDir, dest) || dest === contentDir) {
    throw createTsumoError("TSUMO_SCAFFOLD_CONTENT_PATH_ESCAPES_ROOT", `Content path escapes the site's content directory: ${contentPathRaw}`, dest);
  }

  if (fileExists(dest)) throw createTsumoError("TSUMO_SCAFFOLD_CONTENT_EXISTS", `File already exists: ${dest}`, dest);

  const archetypePath = join(dir, "archetypes", "default.md");
  const template = fileExists(archetypePath) ? readTextFile(archetypePath) : defaultArchetype();

  const baseName = basename(withExt);
  const fileName = baseName !== "" ? baseName : withExt;
  const slug = slugify(fileName.toLowerCase().endsWith(".md") ? substringCount(fileName, 0, fileName.length - 3) : fileName);
  const title = humanizeSlug(slug);
  const date = (creationTime ?? new Date()).toISOString();

  let content = template;
  content = replaceText(content, "{{ .Title }}", title);
  content = replaceText(content, "{{ .Date }}", date);

  writeTextFile(dest, content);
  return dest;
};
