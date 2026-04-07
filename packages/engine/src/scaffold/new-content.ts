import { basename, join, resolve } from "@tsonic/nodejs/path.js";

import { fileExists, readTextFile, writeTextFile } from "../fs.ts";
import { replaceText, substringCount, trimStartChar } from "../utils/strings.ts";
import { humanizeSlug, slugify } from "../utils/text.ts";

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

export const newContent = (siteDir: string, contentPathRaw: string): string => {
  const dir = resolve(siteDir);
  const contentDir = join(dir, "content");

  const slash = "/";
  const rel = trimStartChar(contentPathRaw, slash).trim();
  const withExt = rel.toLowerCase().endsWith(".md") ? rel : rel + ".md";
  const dest = join(contentDir, ...replaceText(withExt, "\\", "/").split("/"));

  if (fileExists(dest)) throw new Error(`File already exists: ${dest}`);

  const archetypePath = join(dir, "archetypes", "default.md");
  const template = fileExists(archetypePath) ? readTextFile(archetypePath) : defaultArchetype();

  const fileName = basename(withExt) || withExt;
  const slug = slugify(fileName.toLowerCase().endsWith(".md") ? substringCount(fileName, 0, fileName.length - 3) : fileName);
  const title = humanizeSlug(slug);
  const date = new Date().toISOString();

  let content = template;
  content = replaceText(content, "{{ .Title }}", title);
  content = replaceText(content, "{{ .Date }}", date);

  writeTextFile(dest, content);
  return dest;
};
