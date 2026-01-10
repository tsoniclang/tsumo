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
  const rel = relPermalink.startsWith("/") ? relPermalink.substring(1) : relPermalink;
  return base + rel;
};

const escapeXml = (value: string): string => escapeHtml(value);

const wrapCdata = (raw: string): string => "<![CDATA[" + replaceText(raw, "]]>", "]]]]><![CDATA[>") + "]]>";

export const renderRss = (config: SiteConfig, pages: PageContext[]): string => {
  const now = DateTime.utcNow;
  const sb = new StringBuilder();
  sb.append("<?xml version=\"1.0\" encoding=\"utf-8\"?>\n");
  sb.append("<rss version=\"2.0\" xmlns:content=\"http://purl.org/rss/1.0/modules/content/\">\n");
  sb.append("<channel>\n");
  sb.append("<title>");
  sb.append(escapeXml(config.title));
  sb.append("</title>\n");
  sb.append("<link>");
  sb.append(escapeXml(toAbsoluteUrl(config.baseURL, "/")));
  sb.append("</link>\n");
  sb.append("<description>");
  sb.append(escapeXml(config.title));
  sb.append("</description>\n");
  sb.append("<language>");
  sb.append(escapeXml(config.languageCode));
  sb.append("</language>\n");
  sb.append("<lastBuildDate>");
  sb.append(now.toString("r"));
  sb.append("</lastBuildDate>\n");
  sb.append("<generator>tsumo</generator>\n");

  for (let i = 0; i < pages.length; i++) {
    const p = pages[i]!;
    const link = toAbsoluteUrl(config.baseURL, p.relPermalink);
    const parsed: DateTime = DateTime.minValue;
    const ok = DateTime.tryParse(p.date, parsed);
    const pub = ok ? parsed : now;

    sb.append("<item>\n");
    sb.append("<title>");
    sb.append(escapeXml(p.title));
    sb.append("</title>\n");
    sb.append("<link>");
    sb.append(escapeXml(link));
    sb.append("</link>\n");
    sb.append("<guid isPermaLink=\"true\">");
    sb.append(escapeXml(link));
    sb.append("</guid>\n");
    sb.append("<pubDate>");
    sb.append(pub.toString("r"));
    sb.append("</pubDate>\n");
    sb.append("<description>");
    sb.append(wrapCdata(p.summary.value));
    sb.append("</description>\n");
    sb.append("<content:encoded>");
    sb.append(wrapCdata(p.content.value));
    sb.append("</content:encoded>\n");
    sb.append("</item>\n");
  }

  sb.append("</channel>\n");
  sb.append("</rss>\n");
  return sb.toString();
};

export const renderSitemap = (config: SiteConfig, relPermalinks: string[]): string => {
  const now = DateTime.utcNow.toString("O");
  const sb = new StringBuilder();
  sb.append("<?xml version=\"1.0\" encoding=\"utf-8\"?>\n");
  sb.append("<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">\n");
  for (let i = 0; i < relPermalinks.length; i++) {
    const rel = relPermalinks[i]!;
    const loc = toAbsoluteUrl(config.baseURL, rel);
    sb.append("<url>");
    sb.append("<loc>");
    sb.append(escapeXml(loc));
    sb.append("</loc>");
    sb.append("<lastmod>");
    sb.append(now);
    sb.append("</lastmod>");
    sb.append("</url>\n");
  }
  sb.append("</urlset>\n");
  return sb.toString();
};

export const renderRobotsTxt = (config: SiteConfig): string => {
  const base = ensureTrailingSlash(config.baseURL);
  const sitemapUrl = base === "" ? "/sitemap.xml" : base + "sitemap.xml";
  return `User-agent: *\nAllow: /\nSitemap: ${sitemapUrl}\n`;
};
