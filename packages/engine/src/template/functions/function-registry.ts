const knownTemplateFunctions = new Set<string>([
  "site.store.get", "site.store.set", "site.store.add", "site.store.delete",
  "site.store.setinmap", "site.store.deleteinmap", "return",
  "hugo.ismultilingual", "hugo.ismultihost", "hugo.workingdir", "hugo.version",
  "hugo.isproduction", "hugo.isextended", "hugo.isserver", "hugo.isdevelopment", "i18n",
  "resources.get", "resources.getmatch", "resources.match", "resources.bytype",
  "resources.concat", "resources.fromstring", "resources.executeastemplate",
  "resources.minify", "minify", "resources.fingerprint", "fingerprint",
  "resources.copy", "images.resize", "resize", "css.sass",
  "partial", "partialcached", "templates.exists", "errorf", "warnf",
  "safehtml", "safehtmlattr", "safejs", "safeurl", "safecss", "htmlescape",
  "htmlunescape", "time.format", "path.base", "title",
  "where", "sort", "after", "last", "uniq", "group", "plainify", "cond",
  "dict", "slice", "append", "merge", "isset", "index", "delimit", "in", "split",
  "add", "sub", "mul", "div", "mod", "newscratch", "encoding.jsonify", "jsonify",
  "crypto.sha1", "md5", "urls.parse", "urls.joinpath", "strings.contains",
  "strings.hasprefix", "strings.trimprefix", "strings.trimsuffix", "urlize",
  "humanize", "lower", "upper", "trim", "replace", "replacere", "truncate",
  "markdownify", "relurl", "absurl", "abslangurl", "rellangurl", "urlquery",
  "default", "len", "dateformat", "print", "printf", "eq", "ne", "lt", "le",
  "gt", "ge", "not", "and", "or",
]);

export const isKnownTemplateFunction = (name: string): boolean => knownTemplateFunctions.has(name);
