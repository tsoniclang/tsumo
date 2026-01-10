---
title: "Hello World"
date: "2026-01-09T00:00:00Z"
draft: false
description: "An end-to-end demo of tsumo with GFM markdown."
tags: ["hello", "tsumo", "gfm"]
categories: ["meta"]
---

This site is built by `tsumo`, a Hugo-inspired engine written in Tsonic TypeScript.

<!--more-->

## Features

- [x] Front matter (YAML/TOML/JSON)
- [x] Markdown → HTML (Markdig + GFM extensions)
- [x] Hugo-style `layouts/` + `static/`
- [x] `build` + `server` commands

## Tables

| Feature | Status |
| --- | --- |
| Tables | ✅ |
| Task lists | ✅ |
| Strikethrough | ✅ |

## Strikethrough + autolinks

Try ~~old~~ new.

https://tsonic.dev

```bash
tsumo build
tsumo server
```
