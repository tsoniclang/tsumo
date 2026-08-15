const openGraphSource = "{{ with .Title }}<meta property=\"og:title\" content=\"{{ . }}\">{{ end }}{{ with .Description }}<meta property=\"og:description\" content=\"{{ . }}\">{{ end }}{{ with .Permalink }}<meta property=\"og:url\" content=\"{{ . }}\">{{ end }}{{ with .Site.Title }}<meta property=\"og:site_name\" content=\"{{ . }}\">{{ end }}";
const twitterCardsSource = "<meta name=\"twitter:card\" content=\"summary\">{{ with .Title }}<meta name=\"twitter:title\" content=\"{{ . }}\">{{ end }}{{ with .Description }}<meta name=\"twitter:description\" content=\"{{ . }}\">{{ end }}";
const schemaSource = "<script type=\"application/ld+json\">{\"@context\":\"https://schema.org\",\"name\":{{ .Title | jsonify | safeJS }},\"url\":{{ .Permalink | jsonify | safeJS }}}</script>";
const paginationSource = "{{ $page := . }}{{ if reflect.IsMap . }}{{ $page = .page }}{{ end }}{{ with $page.Paginator }}{{ if gt .TotalPages 1 }}<nav class=\"pagination\" role=\"navigation\">{{ with .Prev }}<a class=\"pagination__previous\" href=\"{{ .URL }}\">Previous</a>{{ end }}{{ with .Next }}<a class=\"pagination__next\" href=\"{{ .URL }}\">Next</a>{{ end }}</nav>{{ end }}{{ end }}";

export const getEmbeddedTemplateSource = (path: string): string | undefined => {
  const normalized = path.toLowerCase();
  if (normalized === "_internal/opengraph.html") return openGraphSource;
  if (normalized === "_internal/twitter_cards.html") return twitterCardsSource;
  if (normalized === "_internal/schema.html") return schemaSource;
  if (normalized === "_internal/pagination.html") return paginationSource;
  if (normalized === "_internal/disqus.html") return "";
  if (normalized === "_internal/google_analytics.html") return "";
  if (normalized === "partials/opengraph.html" || normalized === "_partials/opengraph.html") return openGraphSource;
  if (normalized === "partials/twitter_cards.html" || normalized === "_partials/twitter_cards.html") return twitterCardsSource;
  if (normalized === "partials/schema.html" || normalized === "_partials/schema.html") return schemaSource;
  if (normalized === "partials/pagination.html" || normalized === "_partials/pagination.html") return paginationSource;
  if (normalized === "partials/disqus.html" || normalized === "_partials/disqus.html") return "";
  if (normalized === "partials/google_analytics.html" || normalized === "_partials/google_analytics.html") return "";
  return undefined;
};
