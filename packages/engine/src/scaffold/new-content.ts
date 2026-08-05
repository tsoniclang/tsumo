import { basename, join, resolve } from "node:path";

import { fileExists, readTextFile, writeTextFile } from "../fs.js";
import { replaceText, substringCount, trimStartChar } from "../utils/strings.js";
import { humanizeSlug, slugify } from "../utils/text.js";
import { Exception } from "@tsonic/dotnet/System.js";

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
  const destParts = replaceText(withExt, "\\", "/").split("/");
  let dest = contentDir;
  for (let i = 0; i < destParts.length; i++) dest = join(dest, destParts[i]!);

  if (fileExists(dest)) throw new Exception(`File already exists: ${dest}`);

  const archetypePath = join(dir, "archetypes", "default.md");
  const template = fileExists(archetypePath) ? readTextFile(archetypePath) : defaultArchetype();

  const baseName = basename(withExt);
  const fileName = baseName !== "" ? baseName : withExt;
  const slug = slugify(fileName.toLowerCase().endsWith(".md") ? substringCount(fileName, 0, fileName.length - 3) : fileName);
  const title = humanizeSlug(slug);
  const date = new Date().toISOString();

  let content = template;
  content = replaceText(content, "{{ .Title }}", title);
  content = replaceText(content, "{{ .Date }}", date);

  writeTextFile(dest, content);
  return dest;
};
