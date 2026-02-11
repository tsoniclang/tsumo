import { DateTime, Exception } from "@tsonic/dotnet/System.js";
import { Path } from "@tsonic/dotnet/System.IO.js";
import type { char } from "@tsonic/core/types.js";

import { fileExists, readTextFile, writeTextFile } from "../fs.ts";
import { replaceText } from "../utils/strings.ts";
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
  const dir = Path.GetFullPath(siteDir);
  const contentDir = Path.Combine(dir, "content");

  const slash: char = "/";
  const rel = contentPathRaw.TrimStart(slash).Trim();
  const withExt = rel.ToLowerInvariant().EndsWith(".md") ? rel : rel + ".md";
  const dest = Path.Combine(contentDir, withExt.Replace(slash, Path.DirectorySeparatorChar));

  if (fileExists(dest)) throw new Exception(`File already exists: ${dest}`);

  const archetypePath = Path.Combine(dir, "archetypes", "default.md");
  const template = fileExists(archetypePath) ? readTextFile(archetypePath) : defaultArchetype();

  const fileName = Path.GetFileName(withExt) ?? withExt;
  const slug = slugify(
    fileName.ToLowerInvariant().EndsWith(".md") ? fileName.Substring(0, fileName.Length - 3) : fileName
  );
  const title = humanizeSlug(slug);
  const date = DateTime.UtcNow.ToString("O");

  let content = template;
  content = replaceText(content, "{{ .Title }}", title);
  content = replaceText(content, "{{ .Date }}", date);

  writeTextFile(dest, content);
  return dest;
};

