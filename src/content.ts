import * as parser from "fast-xml-parser";
import * as he from 'he';
import * as cheerio from 'cheerio';
import { URL } from "url";
import { isString, isArray } from "util";

function order(attr: any) {
    if (!attr) {
        return -2;
    }
    if (attr.rel === 'alternate') {
        return 1;
    } else if (!attr.rel) {
        return 0;
    } else {
        return -1;
    }
}

function parseLink(link: any) {
    let ans;
    if (isString(link)) {
        ans = link;
    } else if (isArray(link) && link.length > 0) {
        ans = link.reduce((a, b) => order(a.__attr) > order(b.__attr) ? a : b).__attr.href;
    } else if (link.__attr) {
        ans = link.__attr.href;
    }
    return ans;
}

function extractText(content: any) {
    let ans;
    if (isString(content)) {
        ans = content;
    } else if (isString(content.__text)) {
        ans = content.__text;
    } else if (isString(content.__cdata)) {
        ans = content.__cdata;
    }
    return ans;
}

export class Entry {
    constructor(
        public title: string,
        public content: string,
        public date: number,
        public link: string,
        public read: boolean,
    ) {}

    static fromDOM(dom: any, baseURL: string): Entry {
        let title;
        if (dom.title) {
            title = extractText(dom.title);
        }
        if (!isString(title)) {
            throw new Error("Feed Format Error: Entry Missing Title");
        }
        title = he.decode(title);

        let content;
        if (dom.content) {
            content = extractText(dom.content);
        } else if (dom["content:encoded"]) {
            content = extractText(dom["content:encoded"]);
        } else if (dom.description) {
            content = extractText(dom.description);
        } else if (dom.summary) {
            content = extractText(dom.summary);
        }
        if (!isString(content)) {
            throw new Error("Feed Format Error: Entry Missing Content");
        }
        content = he.decode(content);
        const $ = cheerio.load(content);
        $('a').each((_, ele) => {
            const $ele = $(ele);
            const href = $ele.attr('href');
            if (href) {
                $ele.attr('href', new URL(href, baseURL).href);
            }
        });
        $('img').each((_, ele) => {
            const $ele = $(ele);
            const src = $ele.attr('src');
            if (src) {
                $ele.attr('src', new URL(src, baseURL).href);
            }
        });
        content = he.decode($.html());

        let date;
        if (dom.published) {
            date = dom.published;
        } else if (dom.pubDate) {
            date = dom.pubDate;
        } else if (dom.updated) {
            date = dom.updated;
        } else if (dom["dc:date"]) {
            date = dom["dc:date"];
        }
        if (!isString(date)) {
            throw new Error("Feed Format Error: Entry Missing Date");
        }
        date = new Date(date).getTime();

        let link;
        if (dom.link) {
            link = parseLink(dom.link);
        } else if (dom.source) {
            link = dom.source;
        }
        if (!isString(link)) {
            throw new Error("Feed Format Error: Entry Missing Link");
        }
        link = new URL(link, baseURL).href;

        return new Entry(title, content, date, link, false);
    }
}

export class Content {
    constructor(
        public link: string,
        public title: string,
        public entries: Entry[],
        public ok: boolean = true,
    ) {}

    static fromXML(xml: string): Content {
        const dom = parser.parse(xml, {
            attributeNamePrefix: "",
            attrNodeName: "__attr",
            textNodeName: "__text",
            cdataTagName: "__cdata",
            ignoreAttributes: false,
            parseAttributeValue: true,
        });
        let feed;
        if (dom.rss) {
            if (dom.rss.channel) {
                feed = dom.rss.channel;
            } else if (dom.rss.feed) {
                feed = dom.rss.feed;
            }
        } else if (dom.channel) {
            feed = dom.channel;
        } else if (dom.feed) {
            feed = dom.feed;
        } else if (dom["rdf:RDF"]) {
            feed = dom["rdf:RDF"];
        }
        if (!feed) {
            throw new Error('Feed Format Error');
        }

        let title;
        if (feed.title) {
            title = extractText(feed.title);
        } else if (feed.channel && feed.channel.title) {
            title = extractText(feed.channel.title);
        }
        if (!isString(title)) {
            throw new Error('Feed Format Error: Missing Title');
        }
        title = he.decode(title);

        let link: any;
        if (feed.link) {
            link = parseLink(feed.link);
        } else if (feed.channel && feed.channel.link) {
            link = parseLink(feed.channel.link);
        }
        if (!isString(link)) {
            throw new Error('Feed Format Error: Missing Link');
        }
        if (!link.match(/^https?:\/\//)) {
            if (link.match(/^\/\//)) {
                link = 'http:' + link;
            } else {
                link = 'http://' + link;
            }
        }

        let items: any;
        if (feed.item) {
            items = feed.item;
        } else if (feed.entry) {
            items = feed.entry;
        }
        if (!items) {
            throw new Error('Feed Format Error');
        }

        const entries: Entry[] = items.map((item: any) => Entry.fromDOM(item, link));
        return new Content(link, title, entries);
    }
}

export class Summary {
    constructor(
        public link: string,
        public title: string,
        public catelog: string[],
        public ok: boolean = true,
    ) {}
}
