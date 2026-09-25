// Samjho Admin - Official-Source Fetcher Foundation (MICRO 8).
// Pilot: PIB only. No AI refinement, no auto-publish, no database,
// no Google Search as a content source.
//
// Flow: RSS/Feed -> title+link+date -> official URL -> fetch HTML -> extract raw.
// Raw (raw_text/raw_html) stays separate from future refined_content ("").
// Failures never create fake/partial articles. Only official pib.gov.in URLs.

(function (root, factory) {
  if (typeof module === "object" && module.exports) { module.exports = factory(); }
  else { root.SamjhoSourceFetcher = factory(); }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var PIB_ORIGIN = "https://pib.gov.in";
  var MIN_RAW_CHARS = 80;

  var FAILURE_CODES = {
    FEED_NOT_CONFIGURED: "FEED_NOT_CONFIGURED",
    FEED_FETCH_FAILED: "FEED_FETCH_FAILED",
    ARTICLE_FETCH_FAILED: "ARTICLE_FETCH_FAILED",
    CONTENT_EXTRACTION_FAILED: "CONTENT_EXTRACTION_FAILED"
  };

  function fail(code, message, extra) {
    return Object.assign({ ok: false, code: code, message: message }, extra || {});
  }

  function text(v) { return String(v == null ? "" : v); }

  function isOfficialUrl(url) {
    if (typeof url !== "string") return false;
    var v = url.trim();
    return v === PIB_ORIGIN || v === PIB_ORIGIN + "/" || v.indexOf(PIB_ORIGIN + "/") === 0;
  }

  // Feed detection: no network. Empty feed_url => FEED_NOT_CONFIGURED.
  function detectFeed(source) {
    var feedUrl = source && typeof source.feed_url === "string" ? source.feed_url.trim() : "";
    if (!feedUrl) {
      return { ok: false, code: FAILURE_CODES.FEED_NOT_CONFIGURED,
        message: "Feed URL is not configured. Add the exact official feed URL before fetching.",
        feedUrl: "" };
    }
    return { ok: true, code: "FEED_CONFIGURED", message: "Feed URL is configured.", feedUrl: feedUrl };
  }

  function decodeEntities(s) {
    return String(s)
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
      .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
      .replace(/&amp;/g, "&");
  }

  function pickTag(block, names) {
    for (var i = 0; i < names.length; i++) {
      var re = new RegExp("<" + names[i] + "[^>]*>([\\s\\S]*?)</" + names[i] + "\\s*>", "i");
      var m = block.match(re);
      if (m) return decodeEntities(m[1]).trim();
    }
    return "";
  }

  function pickLink(block) {
    var m = block.match(/<link[^>]*>([\s\S]*?)<\/link\s*>/i);
    if (m && decodeEntities(m[1]).trim()) return decodeEntities(m[1]).trim();
    var h = block.match(/<link[^>]*href=["']([^"']+)["'][^>]*\/?>/i);
    if (h) return decodeEntities(h[1]).trim();
    var g = block.match(/<guid[^>]*>([\s\S]*?)<\/guid\s*>/i);
    if (g && /^https?:\/\//i.test(decodeEntities(g[1]).trim())) return decodeEntities(g[1]).trim();
    return "";
  }
  function parseFeedItems(xml) {
    if (typeof xml !== "string" || !xml.trim()) {
      return fail(FAILURE_CODES.FEED_FETCH_FAILED, "Feed fetch failed: empty feed body.", { items: [] });
    }
    var blocks = [];
    var re = /<(item|entry)[\s>][\s\S]*?<\/\1\s*>/gi;
    var m;
    while ((m = re.exec(xml)) !== null) blocks.push(m[0]);
    if (!blocks.length) {
      return fail(FAILURE_CODES.FEED_FETCH_FAILED, "Feed fetch failed: no feed items found.", { items: [] });
    }
    var items = blocks.map(function (b) {
      return { title: pickTag(b, ["title"]), link: pickLink(b),
        date: pickTag(b, ["pubDate", "published", "updated", "dc:date"]) };
    }).filter(function (it) { return it.title && it.link; });
    if (!items.length) {
      return fail(FAILURE_CODES.FEED_FETCH_FAILED, "Feed fetch failed: no usable title/link.", { items: [] });
    }
    return { ok: true, items: items };
  }

  // DYNAMIC SOURCE DATE: extract the publication date from the individual
  // official PIB announcement/press-release HTML page. Never invents a date:
  // returns "" when the page provides none (caller keeps field empty for
  // manual review; NEVER substitutes today's date).
  var MONTHS = { jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
    jul: "07", aug: "08", sep: "09", sept: "09", oct: "10", nov: "11", dec: "12" };

  function pad2(n) { return (n < 10 ? "0" : "") + n; }

  function normalizeSourceDate(value) {
    var s = text(value).trim();
    if (!s) return "";
    var m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return m[1] + "-" + m[2] + "-" + m[3];
    // DD MMM YYYY  (18 Sep 2026, 18-SEP-2026, 18 Sep, 2026)
    m = s.match(/(\d{1,2})[\s\-\/.]+([A-Za-z]{3,9})[\s,\-\/.]+(\d{4})/);
    if (m) {
      var mon = MONTHS[m[2].toLowerCase().slice(0, 4)] || MONTHS[m[2].toLowerCase().slice(0, 3)];
      if (mon) return m[3] + "-" + mon + "-" + pad2(parseInt(m[1], 10));
    }
    // DD/MM/YYYY or DD-MM-YYYY (Indian source: day first)
    m = s.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/);
    if (m) {
      var d = parseInt(m[1], 10);
      var mo = parseInt(m[2], 10);
      if (d >= 1 && d <= 31 && mo >= 1 && mo <= 12) {
        return m[3] + "-" + pad2(mo) + "-" + pad2(d);
      }
      return "";
    }
    // RFC / long dates ("Thu, 18 Sep 2026 ...", "September 18, 2026")
    var t = Date.parse(s);
    if (!isNaN(t)) {
      var dt = new Date(t);
      return dt.getUTCFullYear() + "-" + pad2(dt.getUTCMonth() + 1) + "-" + pad2(dt.getUTCDate());
    }
    return "";
  }

  function extractSourceDate(html) {
    var src = String(html || "");
    if (!src.trim()) return "";
    // 1) Meta / structured date tags on the official page.
    var metas = [
      /<meta[^>]+property=["']article:published_time["'][^>]*content=["']([^"']+)["']/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]*property=["']article:published_time["']/i,
      /<meta[^>]+itemprop=["']datePublished["'][^>]*content=["']([^"']+)["']/i,
      /<meta[^>]+name=["'](?:publish-date|PublishDate|DC\.date|dcterms\.date|date)["'][^>]*content=["']([^"']+)["']/i
    ];
    for (var i = 0; i < metas.length; i++) {
      var mm = src.match(metas[i]);
      if (mm) {
        var norm = normalizeSourceDate(decodeEntities(mm[1]));
        if (norm) return norm;
      }
    }
    // 2) PIB visible release-date patterns ("Posted On: 18 SEP 2026 ...").
    var pats = [
      /posted\s+on\s*:?\s*(\d{1,2}\s+[A-Za-z]{3,9}\s*,?\s*\d{4})/i,
      /(?:release|press release|publication)\s+date\s*:?\s*(\d{1,2}[\s\-\/.]+[A-Za-z]{3,9}[\s,\-\/.]+\d{4}|\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{4}|\d{4}-\d{2}-\d{2})/i,
      /(?:dated?|dt\.?)\s*:?\s*(\d{1,2}\s+[A-Za-z]{3,9}\s*,?\s*\d{4}|\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{4})/i
    ];
    for (var p = 0; p < pats.length; p++) {
      var pm = src.match(pats[p]);
      if (pm) {
        var norm2 = normalizeSourceDate(decodeEntities(pm[1]));
        if (norm2) return norm2;
      }
    }
    return "";
  }

  function stripTags(html) {
    var t = String(html || "")
      .replace(/<script[\s\S]*?<\/script\s*>/gi, " ")
      .replace(/<style[\s\S]*?<\/style\s*>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript\s*>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<\/(p|div|h1|h2|h3|h4|li|tr|br)[^>]*>/gi, "\n")
      .replace(/<[^>]+>/g, " ");
    t = decodeEntities(t).replace(/[ \t\xa0]+/g, " ").replace(/\n\s*\n\s*\n+/g, "\n\n").trim();
    return t;
  }

  function extractMainHtml(html) {
    var src = String(html || "");
    var m = src.match(/<article[\s\S]*?<\/article\s*>/i);
    if (m && stripTags(m[0]).length >= MIN_RAW_CHARS) return m[0];
    m = src.match(/<main[\s\S]*?<\/main\s*>/i);
    if (m && stripTags(m[0]).length >= MIN_RAW_CHARS) return m[0];
    var cands = src.match(/<(div|section)[^>]*>([\s\S]*?)<\/\1\s*>/gi) || [];
    var best = "", bestLen = 0;
    for (var i = 0; i < cands.length; i++) {
      var len = stripTags(cands[i]).length;
      if (len > bestLen) { bestLen = len; best = cands[i]; }
    }
    if (best && bestLen >= MIN_RAW_CHARS) return best;
    return src;
  }

  // Extract raw announcement. Short/empty pages FAIL (no partial content).
  function extractRawAnnouncement(html, url) {
    if (typeof html !== "string" || !html.trim()) {
      return fail(FAILURE_CODES.CONTENT_EXTRACTION_FAILED, "Content extraction failed: empty HTML.", { url: url || "" });
    }
    var mainHtml = extractMainHtml(html);
    var rawText = stripTags(mainHtml);
    if (!rawText || rawText.length < MIN_RAW_CHARS) {
      return fail(FAILURE_CODES.CONTENT_EXTRACTION_FAILED,
        "Content extraction failed: no usable announcement text.", { url: url || "" });
    }
    return { ok: true, raw_text: rawText, raw_html: String(mainHtml).trim(), url: url || "",
      page_date: extractSourceDate(html) };
  }

  // Map success into EXISTING Content Inbox shape as RAW (refined stays "").
  // Date precedence: page-extracted official date -> feed date -> "" (empty
  // for manual review). NEVER today's date, NEVER invented.
  function toInboxItem(opts) {
    opts = opts || {};
    var feedItem = opts.feedItem || {};
    var raw = opts.raw || {};
    var source = opts.source || {};
    var officialUrl = feedItem.link || raw.url || "";
    var pageDate = normalizeSourceDate(raw.page_date || "");
    var feedDate = normalizeSourceDate(feedItem.date || "");
    return {
      title: feedItem.title || "",
      category: "government",
      raw_content: raw.raw_text || "",
      raw_html: raw.raw_html || "",
      refined_content: "",
      source_id: source.id || "",
      source_name: source.source_name || "",
      source_url: officialUrl,
      source_published_date: pageDate || feedDate || "",
      admin_notes: "Fetched raw from official source (PIB). No AI refinement applied.",
      status: "draft",
      added_at: new Date().toISOString().slice(0, 10)
    };
  }

  function isValidInboxItem(item) {
    return Boolean(item && typeof item.title === "string" && item.title.trim() &&
      typeof item.raw_content === "string" && item.raw_content.trim().length >= MIN_RAW_CHARS &&
      typeof item.source_url === "string" && isOfficialUrl(item.source_url));
  }
  function fetchSource(source, fetchFn, options) {
    options = options || {};
    var limit = options.limit && options.limit > 0 ? Math.floor(options.limit) : 10;
    var det = detectFeed(source);
    if (!det.ok) {
      return Promise.resolve({ ok: false, code: det.code, message: det.message,
        results: [], failures: [{ code: det.code, message: det.message, url: "" }] });
    }
    if (typeof fetchFn !== "function") {
      var msg = "Feed fetch failed: no fetch function provided.";
      return Promise.resolve({ ok: false, code: FAILURE_CODES.FEED_FETCH_FAILED,
        message: msg, results: [], failures: [{ code: FAILURE_CODES.FEED_FETCH_FAILED, message: msg, url: det.feedUrl }] });
    }
    function getText(url) {
      var out;
      try { out = fetchFn(url); } catch (e) { return Promise.reject(e); }
      return Promise.resolve(out).then(function (res) {
        if (typeof res === "string") return res;
        if (res && typeof res.text === "function") return res.text();
        return String(res == null ? "" : res);
      });
    }
    return getText(det.feedUrl).then(function (xml) {
      var parsed = parseFeedItems(xml);
      if (!parsed.ok) {
        return { ok: false, code: parsed.code, message: parsed.message,
          results: [], failures: [{ code: parsed.code, message: parsed.message, url: det.feedUrl }] };
      }
      var items = parsed.items.slice(0, limit);
      var chain = Promise.resolve({ results: [], failures: [] });
      items.forEach(function (feedItem) {
        chain = chain.then(function (acc) {
          if (!isOfficialUrl(feedItem.link)) {
            acc.failures.push({ code: FAILURE_CODES.ARTICLE_FETCH_FAILED,
              message: "Article fetch failed: non-official URL skipped (" + feedItem.link + ").",
              url: feedItem.link, title: feedItem.title });
            return acc;
          }
          return getText(feedItem.link).then(function (html) {
            var ex = extractRawAnnouncement(html, feedItem.link);
            if (!ex.ok) {
              acc.failures.push({ code: ex.code, message: ex.message, url: feedItem.link, title: feedItem.title });
              return acc;
            }
            var inboxItem = toInboxItem({ feedItem: feedItem, raw: ex, source: source });
            if (!isValidInboxItem(inboxItem)) {
              acc.failures.push({ code: FAILURE_CODES.CONTENT_EXTRACTION_FAILED,
                message: "Content extraction failed: validation failed.", url: feedItem.link, title: feedItem.title });
              return acc;
            }
            acc.results.push(inboxItem);
            return acc;
          }, function (err) {
            acc.failures.push({ code: FAILURE_CODES.ARTICLE_FETCH_FAILED,
              message: "Article fetch failed: " + (err && err.message ? err.message : String(err)),
              url: feedItem.link, title: feedItem.title });
            return acc;
          });
        });
      });
      return chain.then(function (acc) {
        return { ok: acc.results.length > 0,
          code: acc.results.length > 0 ? "OK" : (acc.failures.length ? acc.failures[0].code : FAILURE_CODES.FEED_FETCH_FAILED),
          message: acc.results.length > 0 ? acc.results.length + " announcement(s) extracted as RAW." : "No announcements extracted.",
          results: acc.results, failures: acc.failures };
      });
    }).catch(function (err) {
      var m2 = "Feed fetch failed: " + (err && err.message ? err.message : String(err));
      return { ok: false, code: FAILURE_CODES.FEED_FETCH_FAILED, message: m2,
        results: [], failures: [{ code: FAILURE_CODES.FEED_FETCH_FAILED, message: m2, url: det.feedUrl }] };
    });
  }

  return {
    PIB_ORIGIN: PIB_ORIGIN,
    FAILURE_CODES: FAILURE_CODES,
    detectFeed: detectFeed,
    parseFeedItems: parseFeedItems,
    extractRawAnnouncement: extractRawAnnouncement,
    extractSourceDate: extractSourceDate,
    normalizeSourceDate: normalizeSourceDate,
    toInboxItem: toInboxItem,
    isValidInboxItem: isValidInboxItem,
    isOfficialUrl: isOfficialUrl,
    fetchSource: fetchSource
  };
});


