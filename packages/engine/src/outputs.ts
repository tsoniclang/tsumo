import { PageContext, SiteConfig } from "./models.ts";
import { escapeHtml } from "./utils/html.ts";
import { replaceText, substringFrom } from "./utils/strings.ts";
import { ensureTrailingSlash } from "./utils/text.ts";

const toAbsoluteUrl = (baseURL: string, relPermalink: string): string => {
  const base = ensureTrailingSlash(baseURL);
  if (base === "") return relPermalink;
  if (relPermalink === "/") return base;
  const rel = relPermalink.startsWith("/") ? substringFrom(relPermalink, 1) : relPermalink;
  return base + rel;
};

const escapeXml = (value: string): string => escapeHtml(value);

const wrapCdata = (raw: string): string => "<![CDATA[" + replaceText(raw, "]]>", "]]]]><![CDATA[>") + "]]>";

const parsePageDate = (value: string, fallback: Date): Date => {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
};

export const renderRss = (config: SiteConfig, pages: PageContext[]): string => {
  const now = new Date();
  const out: string[] = [
    "<?xml version=\"1.0\" encoding=\"utf-8\"?>",
    "<rss version=\"2.0\" xmlns:content=\"http://purl.org/rss/1.0/modules/content/\">",
    "<channel>",
    `<title>${escapeXml(config.title)}</title>`,
    `<link>${escapeXml(toAbsoluteUrl(config.baseURL, "/"))}</link>`,
    `<description>${escapeXml(config.title)}</description>`,
    `<language>${escapeXml(config.languageCode)}</language>`,
    `<lastBuildDate>${now.toISOString()}</lastBuildDate>`,
    "<generator>tsumo</generator>",
  ];

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i]!;
    const link = toAbsoluteUrl(config.baseURL, page.relPermalink);
    const pubDate = parsePageDate(page.date, now).toISOString();

    out.push("<item>");
    out.push(`<title>${escapeXml(page.title)}</title>`);
    out.push(`<link>${escapeXml(link)}</link>`);
    out.push(`<guid isPermaLink="true">${escapeXml(link)}</guid>`);
    out.push(`<pubDate>${pubDate}</pubDate>`);
    out.push(`<description>${wrapCdata(page.summary.value)}</description>`);
    out.push(`<content:encoded>${wrapCdata(page.content.value)}</content:encoded>`);
    out.push("</item>");
  }

  out.push("</channel>");
  out.push("</rss>");
  return out.join("\n") + "\n";
};

export const renderSitemap = (config: SiteConfig, relPermalinks: string[]): string => {
  const now = new Date().toISOString();
  const out: string[] = [
    "<?xml version=\"1.0\" encoding=\"utf-8\"?>",
    "<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">",
  ];

  for (let i = 0; i < relPermalinks.length; i++) {
    const rel = relPermalinks[i]!;
    const loc = toAbsoluteUrl(config.baseURL, rel);
    out.push(`<url><loc>${escapeXml(loc)}</loc><lastmod>${now}</lastmod></url>`);
  }

  out.push("</urlset>");
  return out.join("\n") + "\n";
};

export const renderRobotsTxt = (config: SiteConfig): string => {
  const base = ensureTrailingSlash(config.baseURL);
  const sitemapUrl = base === "" ? "/sitemap.xml" : base + "sitemap.xml";
  return `User-agent: *\nAllow: /\nSitemap: ${sitemapUrl}\n`;
};
