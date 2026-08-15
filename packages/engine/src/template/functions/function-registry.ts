const knownTemplateFunctions = new Set<string>([
  "site.store.get", "site.store.set", "site.store.add", "site.store.delete",
  "site.store.setinmap", "site.store.deleteinmap", "return",
  "hugo.ismultilingual", "hugo.ismultihost", "hugo.workingdir", "hugo.version",
  "hugo.isproduction", "hugo.isextended", "hugo.isserver", "hugo.isdevelopment", "hugo.generator", "hugo.environment",
  "now.year", "now.format", "getenv", "fileexists", "i18n",
  "resources.get", "resources.getmatch", "resources.match", "resources.bytype",
  "resources.concat", "resources.fromstring", "resources.executeastemplate",
  "resources.minify", "minify", "resources.fingerprint", "fingerprint",
  "resources.copy", "images.resize", "resize", "css.sass", "css.build", "js.build",
  "partial", "partialcached", "templates.exists", "templates.defer", "errorf", "warnf",
  "safehtml", "safehtmlattr", "safejs", "safeurl", "safecss", "htmlescape",
  "htmlunescape", "time", "time.astime", "time.format", "path.base", "path.ext", "path.join", "title", "unmarshal",
  "where", "sort", "after", "first", "last", "uniq", "complement", "group", "plainify", "cond",
  "dict", "slice", "append", "merge", "isset", "index", "delimit", "in", "split",
  "add", "sub", "mul", "div", "mod", "ceil", "newscratch", "encoding.jsonify", "jsonify",
  "crypto.sha1", "md5", "urls.parse", "urls.joinpath", "strings.contains", "strings.repeat",
  "strings.hasprefix", "strings.hassuffix", "strings.trimprefix", "strings.trimsuffix", "strings.trim", "urlize",
  "anchorize", "emojify", "humanize", "lower", "upper", "trim", "chomp", "replace", "replacere",
  "findre", "findresubmatch", "truncate",
  "markdownify", "relurl", "absurl", "abslangurl", "rellangurl", "urlquery", "querify",
  "default", "len", "int", "string", "dateformat", "print", "printf", "eq", "ne", "lt", "le",
  "gt", "ge", "not", "and", "or",
  "reflect.ismap", "reflect.isslice", "union",
]);

export const isKnownTemplateFunction = (name: string): boolean => knownTemplateFunctions.has(name);

export const canonicalTemplateFunctionName = (name: string): string => {
  if (name === "collections.where") return "where";
  if (name === "collections.sort") return "sort";
  if (name === "collections.after") return "after";
  if (name === "collections.first") return "first";
  if (name === "collections.last") return "last";
  if (name === "collections.uniq") return "uniq";
  if (name === "collections.dictionary") return "dict";
  if (name === "collections.slice") return "slice";
  if (name === "collections.append") return "append";
  if (name === "collections.merge") return "merge";
  if (name === "collections.isset") return "isset";
  if (name === "collections.index") return "index";
  if (name === "collections.delimit") return "delimit";
  if (name === "collections.in") return "in";
  if (name === "collections.querify") return "querify";
  if (name === "collections.union") return "union";
  if (name === "collections.complement") return "complement";
  if (name === "compare.default") return "default";
  if (name === "compare.conditional") return "cond";
  if (name === "compare.eq") return "eq";
  if (name === "compare.ne") return "ne";
  if (name === "compare.lt") return "lt";
  if (name === "compare.le") return "le";
  if (name === "compare.gt") return "gt";
  if (name === "compare.ge") return "ge";
  if (name === "math.add") return "add";
  if (name === "math.sub") return "sub";
  if (name === "math.mul") return "mul";
  if (name === "math.div") return "div";
  if (name === "math.mod") return "mod";
  if (name === "math.ceil") return "ceil";
  if (name === "tocss") return "css.sass";
  if (name === "resources.tocss") return "css.sass";
  if (name === "transform.markdownify") return "markdownify";
  if (name === "transform.plainify") return "plainify";
  if (name === "transform.unmarshal") return "unmarshal";
  if (name === "transform.htmlescape") return "htmlescape";
  if (name === "partials.include") return "partial";
  if (name === "partials.includecached") return "partialcached";
  if (name === "lang.translate") return "i18n";
  if (name === "t") return "i18n";
  if (name === "fmt.print") return "print";
  if (name === "fmt.printf") return "printf";
  if (name === "fmt.errorf") return "errorf";
  if (name === "fmt.warnf") return "warnf";
  if (name === "crypto.md5") return "md5";
  if (name === "inflect.humanize") return "humanize";
  if (name === "urls.relurl") return "relurl";
  if (name === "urls.absurl") return "absurl";
  if (name === "urls.abslangurl") return "abslangurl";
  if (name === "safe.html") return "safehtml";
  if (name === "safe.htmlattr") return "safehtmlattr";
  if (name === "safe.js") return "safejs";
  if (name === "safe.url") return "safeurl";
  if (name === "safe.css") return "safecss";
  if (name === "strings.chomp") return "chomp";
  if (name === "strings.replace") return "replace";
  if (name === "strings.replacere") return "replacere";
  if (name === "strings.findre") return "findre";
  if (name === "strings.findresubmatch") return "findresubmatch";
  if (name === "strings.tolower") return "lower";
  if (name === "strings.toupper") return "upper";
  if (name === "hasprefix") return "strings.hasprefix";
  return name;
};
