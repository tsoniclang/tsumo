import { DateTime } from "@tsonic/dotnet/System.js";
import { StringBuilder } from "@tsonic/dotnet/System.Text.js";
import { PageContext, SiteConfig } from "./models.ts";
import { escapeHtml } from "./utils/html.ts";
import { replaceText } from "./utils/strings.ts";
import { ensureTrailingSlash } from "./utils/text.ts";

const toAbsoluteUrl = (baseURL: string, relPermalink: string): string => {
  const base = ensureTrailingSlash(baseURL);
  if (base === "") return relPermalink;
  if (relPermalink === "/") return base;
  const rel = relPermalink.StartsWith("/") ? relPermalink.Substring(1) : relPermalink;
  return base + rel;
};

const escapeXml = (value: string): string => escapeHtml(value);

const wrapCdata = (raw: string): string => "<![CDATA[" + replaceText(raw, "]]>", "]]]]><![CDATA[>") + "]]>";

export const renderRss = (config: SiteConfig, pages: PageContext[]): string => {
  const now = DateTime.UtcNow;
  const sb = new StringBuilder();
  sb.Append("<?xml version=\"1.0\" encoding=\"utf-8\"?>\n");
  sb.Append("<rss version=\"2.0\" xmlns:content=\"http://purl.org/rss/1.0/modules/content/\">\n");
  sb.Append("<channel>\n");
  sb.Append("<title>");
  sb.Append(escapeXml(config.title));
  sb.Append("</title>\n");
  sb.Append("<link>");
  sb.Append(escapeXml(toAbsoluteUrl(config.baseURL, "/")));
  sb.Append("</link>\n");
  sb.Append("<description>");
  sb.Append(escapeXml(config.title));
  sb.Append("</description>\n");
  sb.Append("<language>");
  sb.Append(escapeXml(config.languageCode));
  sb.Append("</language>\n");
  sb.Append("<lastBuildDate>");
  sb.Append(now.ToString("r"));
  sb.Append("</lastBuildDate>\n");
  sb.Append("<generator>tsumo</generator>\n");

  for (let i = 0; i < pages.Length; i++) {
    const p = pages[i]!;
    const link = toAbsoluteUrl(config.baseURL, p.relPermalink);
    let parsed: DateTime = DateTime.MinValue;
    const ok = DateTime.TryParse(p.date, parsed);
    const pub = ok ? parsed : now;

    sb.Append("<item>\n");
    sb.Append("<title>");
    sb.Append(escapeXml(p.title));
    sb.Append("</title>\n");
    sb.Append("<link>");
    sb.Append(escapeXml(link));
    sb.Append("</link>\n");
    sb.Append("<guid isPermaLink=\"true\">");
    sb.Append(escapeXml(link));
    sb.Append("</guid>\n");
    sb.Append("<pubDate>");
    sb.Append(pub.ToString("r"));
    sb.Append("</pubDate>\n");
    sb.Append("<description>");
    sb.Append(wrapCdata(p.summary.value));
    sb.Append("</description>\n");
    sb.Append("<content:encoded>");
    sb.Append(wrapCdata(p.content.value));
    sb.Append("</content:encoded>\n");
    sb.Append("</item>\n");
  }

  sb.Append("</channel>\n");
  sb.Append("</rss>\n");
  return sb.ToString();
};

export const renderSitemap = (config: SiteConfig, relPermalinks: string[]): string => {
  const now = DateTime.UtcNow.ToString("O");
  const sb = new StringBuilder();
  sb.Append("<?xml version=\"1.0\" encoding=\"utf-8\"?>\n");
  sb.Append("<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">\n");
  for (let i = 0; i < relPermalinks.Length; i++) {
    const rel = relPermalinks[i]!;
    const loc = toAbsoluteUrl(config.baseURL, rel);
    sb.Append("<url>");
    sb.Append("<loc>");
    sb.Append(escapeXml(loc));
    sb.Append("</loc>");
    sb.Append("<lastmod>");
    sb.Append(now);
    sb.Append("</lastmod>");
    sb.Append("</url>\n");
  }
  sb.Append("</urlset>\n");
  return sb.ToString();
};

export const renderRobotsTxt = (config: SiteConfig): string => {
  const base = ensureTrailingSlash(config.baseURL);
  const sitemapUrl = base === "" ? "/sitemap.xml" : base + "sitemap.xml";
  return `User-agent: *\nAllow: /\nSitemap: ${sitemapUrl}\n`;
};
