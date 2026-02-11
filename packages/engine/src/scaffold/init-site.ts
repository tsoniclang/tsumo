import { DateTime, Exception } from "@tsonic/dotnet/System.js";
import { Directory, Path, SearchOption } from "@tsonic/dotnet/System.IO.js";
import { ensureDir, writeTextFile } from "../fs.ts";
import { humanizeSlug } from "../utils/text.ts";

const ensureEmptyDir = (path: string): void => {
  if (!Directory.Exists(path)) {
    Directory.CreateDirectory(path);
    return;
  }
  const entries = Directory.GetFileSystemEntries(path, "*", SearchOption.TopDirectoryOnly);
  if (entries.Length > 0) {
    throw new Exception(`Directory not empty: ${path}`);
  }
};

const defaultConfigToml = (title: string): string => `baseURL = "http://localhost:1313/"
languageCode = "en-us"
title = "${title}"
`;

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

const baseofHtml = (): string => `<!doctype html>
<html lang="{{ .Site.LanguageCode }}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>{{ .Title }} | {{ .Site.Title }}</title>
    <meta name="description" content="{{ default .Site.Title .Description }}" />
    <link rel="stylesheet" href="{{ relURL "style.css" }}" />
    <link rel="alternate" type="application/rss+xml" href="{{ relURL "/index.xml" }}" title="{{ .Site.Title }}" />
  </head>
  <body>
    {{ partial "header.html" . }}
    <main class="container">
      {{ block "main" . }}{{ end }}
    </main>
    {{ partial "footer.html" . }}
  </body>
</html>
`;

const partialHeader = (): string => `<header class="container">
  <h1><a href="{{ relURL "/" }}">{{ .Site.Title }}</a></h1>
  <nav>
    <a href="{{ relURL "/" }}">Home</a>
    <a href="{{ relURL "/posts/" }}">Posts</a>
    <a href="{{ relURL "/tags/" }}">Tags</a>
    <a href="{{ relURL "/categories/" }}">Categories</a>
  </nav>
</header>
`;

const partialFooter = (): string => `<footer class="container">
  <p class="muted">Built with tsumo</p>
</footer>
`;

const singleHtml = (): string => `{{ define "main" }}
<article>
  <h2>{{ .Title }}</h2>
  <p class="muted">
    {{ dateFormat "Jan 2, 2006" .Date }}
    {{ with .Categories }}
      · Categories:
      {{ range . }}
        <a href="{{ . | urlize | printf "/categories/%s/" | relURL }}">{{ . }}</a>
      {{ end }}
    {{ end }}
    {{ with .Tags }}
      · Tags:
      {{ range . }}
        <a href="{{ . | urlize | printf "/tags/%s/" | relURL }}">{{ . }}</a>
      {{ end }}
    {{ end }}
  </p>
  <div class="content">
    {{ .Content }}
  </div>
</article>
{{ end }}
`;

const listHtml = (): string => `{{ define "main" }}
<section>
  <h2>{{ .Title }}</h2>
  <div class="content">{{ .Content }}</div>
  <ul class="post-list">
    {{ range .Pages }}
      <li>
        <div>
          <a href="{{ .RelPermalink }}">{{ .Title }}</a>
          {{ with .Summary }}<div class="summary">{{ . }}</div>{{ end }}
        </div>
        <span class="muted">{{ dateFormat "Jan 2, 2006" .Date }}</span>
      </li>
    {{ end }}
  </ul>
</section>
{{ end }}
`;

const termsHtml = (): string => `{{ define "main" }}
<section>
  <h2>{{ .Title }}</h2>
  <ul class="post-list">
    {{ range .Pages }}
      <li>
        <a href="{{ .RelPermalink }}">{{ .Title }}</a>
        <span class="muted">{{ len .Pages }}</span>
      </li>
    {{ end }}
  </ul>
</section>
{{ end }}
`;

const taxonomyHtml = (): string => `{{ define "main" }}
<section>
  <h2>{{ .Title }}</h2>
  <ul class="post-list">
    {{ range .Pages }}
      <li>
        <a href="{{ .RelPermalink }}">{{ .Title }}</a>
        <span class="muted">{{ dateFormat "Jan 2, 2006" .Date }}</span>
      </li>
    {{ end }}
  </ul>
</section>
{{ end }}
`;

const indexMd = (): string => `---
title: "Home"
description: "Example site for tsumo."
---

Welcome to your new site.
`;

const helloWorldMd = (): string => `---
title: "Hello World"
date: "${DateTime.UtcNow.ToString("O")}"
draft: false
description: "An end-to-end demo of tsumo with GFM markdown."
tags: ["hello", "tsumo", "gfm"]
categories: ["meta"]
---

This is your first post.

<!--more-->

\`\`\`
tsumo build
tsumo server
\`\`\`
`;

const styleCss = (): string => `:root { color-scheme: light dark; }
body { font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; margin: 0; line-height: 1.5; }
a { color: inherit; }
.container { max-width: 860px; margin: 0 auto; padding: 1.25rem; }
.muted { color: #777; }
nav { display: flex; gap: 1rem; flex-wrap: wrap; }
.post-list { list-style: none; padding: 0; }
.post-list li { display: flex; justify-content: space-between; gap: 1rem; padding: 0.25rem 0; }
.summary { margin-top: 0.25rem; }
.summary p { margin: 0; }
.content pre { padding: 0.75rem 1rem; background: rgba(127,127,127,0.15); overflow: auto; border-radius: 10px; }
`;

export const initSite = (targetDir: string): void => {
  const dir = Path.GetFullPath(targetDir);
  ensureEmptyDir(dir);

  const title = humanizeSlug(Path.GetFileName(dir) ?? "Tsumo Site");

  ensureDir(Path.Combine(dir, "content"));
  ensureDir(Path.Combine(dir, "content", "posts"));
  ensureDir(Path.Combine(dir, "layouts", "_default"));
  ensureDir(Path.Combine(dir, "layouts", "partials"));
  ensureDir(Path.Combine(dir, "static"));
  ensureDir(Path.Combine(dir, "archetypes"));

  writeTextFile(Path.Combine(dir, "hugo.toml"), defaultConfigToml(title));
  writeTextFile(Path.Combine(dir, "archetypes", "default.md"), defaultArchetype());
  writeTextFile(Path.Combine(dir, "layouts", "_default", "baseof.html"), baseofHtml());
  writeTextFile(Path.Combine(dir, "layouts", "_default", "single.html"), singleHtml());
  writeTextFile(Path.Combine(dir, "layouts", "_default", "list.html"), listHtml());
  writeTextFile(Path.Combine(dir, "layouts", "_default", "terms.html"), termsHtml());
  writeTextFile(Path.Combine(dir, "layouts", "_default", "taxonomy.html"), taxonomyHtml());
  writeTextFile(Path.Combine(dir, "layouts", "partials", "header.html"), partialHeader());
  writeTextFile(Path.Combine(dir, "layouts", "partials", "footer.html"), partialFooter());
  writeTextFile(Path.Combine(dir, "static", "style.css"), styleCss());
  writeTextFile(Path.Combine(dir, "content", "_index.md"), indexMd());
  writeTextFile(Path.Combine(dir, "content", "posts", "hello-world.md"), helloWorldMd());
};

