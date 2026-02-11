import { Discovery } from '../types/index.js';

interface ArxivEntry {
  id: string;
  title: string;
  summary: string;
  authors: string[];
  published: string;
  updated: string;
  link: string;
  categories: string[];
}

export interface ArxivScanConfig {
  categories?: string[];
  maxResults?: number;
}

export class ArxivScanner {
  private baseUrl = 'http://export.arxiv.org/api/query';

  constructor() {
    console.log('📚 ArXiv Scanner initialized');
  }

  async searchByKeywords(keywords: string[], maxResults: number = 20): Promise<Discovery[]> {
    console.log(`📚 Searching ArXiv for: ${keywords.join(', ')}`);

    const discoveries: Discovery[] = [];

    for (const keyword of keywords) {
      try {
        const searchQuery = encodeURIComponent(`all:${keyword}`);
        const url = `${this.baseUrl}?search_query=${searchQuery}&start=0&max_results=${maxResults}&sortBy=submittedDate&sortOrder=descending`;

        const response = await fetch(url);
        const xmlText = await response.text();

        const entries = this.parseArxivXML(xmlText);

        for (const entry of entries) {
          discoveries.push({
            source: 'arxiv',
            sourceId: entry.id,
            url: entry.link,
            title: entry.title,
            description: entry.summary.substring(0, 500),
            metadata: {
              authors: entry.authors,
              published: entry.published,
              updated: entry.updated,
              categories: entry.categories,
              matchedKeyword: keyword,
            },
          });
        }

        console.log(`   ✅ Keyword "${keyword}": ${entries.length} papers`);

        await this.sleep(3000);

      } catch (error: any) {
        console.error(`   ❌ Error searching "${keyword}":`, error.message);
      }
    }

    console.log(`📚 ArXiv search complete: ${discoveries.length} papers found`);
    return discoveries;
  }

  async scanCategories(config: ArxivScanConfig = {}): Promise<Discovery[]> {
    const categories = config.categories || ['cs.AI', 'cs.SE', 'cs.LG'];
    const maxResults = config.maxResults || 10;

    console.log(`📚 Scanning ArXiv categories: ${categories.join(', ')}`);

    const discoveries: Discovery[] = [];

    for (const category of categories) {
      try {
        const searchQuery = encodeURIComponent(`cat:${category}`);
        const url = `${this.baseUrl}?search_query=${searchQuery}&start=0&max_results=${maxResults}&sortBy=submittedDate&sortOrder=descending`;

        const response = await fetch(url);
        const xmlText = await response.text();

        const entries = this.parseArxivXML(xmlText);

        for (const entry of entries) {
          discoveries.push({
            source: 'arxiv_category',
            sourceId: entry.id,
            url: entry.link,
            title: entry.title,
            description: entry.summary.substring(0, 500),
            metadata: {
              authors: entry.authors,
              published: entry.published,
              updated: entry.updated,
              categories: entry.categories,
              primaryCategory: category,
            },
          });
        }

        console.log(`   ✅ Category "${category}": ${entries.length} papers`);

        await this.sleep(3000);

      } catch (error: any) {
        console.error(`   ❌ Error scanning "${category}":`, error.message);
      }
    }

    console.log(`📚 Category scan complete: ${discoveries.length} papers found`);
    return discoveries;
  }

  private parseArxivXML(xmlText: string): ArxivEntry[] {
    const entries: ArxivEntry[] = [];

    const entryMatches = xmlText.match(/<entry>[\s\S]*?<\/entry>/g) || [];

    for (const entryXml of entryMatches) {
      try {
        const entry: ArxivEntry = {
          id: this.extractTag(entryXml, 'id'),
          title: this.extractTag(entryXml, 'title').replace(/\s+/g, ' ').trim(),
          summary: this.extractTag(entryXml, 'summary').replace(/\s+/g, ' ').trim(),
          authors: this.extractAuthors(entryXml),
          published: this.extractTag(entryXml, 'published'),
          updated: this.extractTag(entryXml, 'updated'),
          link: this.extractLink(entryXml),
          categories: this.extractCategories(entryXml),
        };

        entries.push(entry);
      } catch (error) {
        continue;
      }
    }

    return entries;
  }

  private extractTag(xml: string, tag: string): string {
    const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`));
    return match ? match[1] : '';
  }

  private extractAuthors(xml: string): string[] {
    const authorMatches = xml.match(/<author>[\s\S]*?<\/author>/g) || [];
    return authorMatches.map(author => {
      const name = this.extractTag(author, 'name');
      return name;
    });
  }

  private extractLink(xml: string): string {
    const match = xml.match(/<link[^>]*href="([^"]*)"[^>]*title="pdf"/);
    if (match) return match[1];
    
    const altMatch = xml.match(/<id>([^<]*)<\/id>/);
    return altMatch ? altMatch[1] : '';
  }

  private extractCategories(xml: string): string[] {
    const catMatches = xml.match(/<category[^>]*term="([^"]*)"/g) || [];
    return catMatches.map(cat => {
      const match = cat.match(/term="([^"]*)"/);
      return match ? match[1] : '';
    }).filter(Boolean);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
