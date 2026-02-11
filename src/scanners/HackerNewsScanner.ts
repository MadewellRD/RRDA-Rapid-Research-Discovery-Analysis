import { Discovery } from '../types/index.js';

interface HNItem {
  id: number;
  type: string;
  by?: string;
  time: number;
  text?: string;
  title?: string;
  url?: string;
  score?: number;
  descendants?: number;
}

interface HNSearchResult {
  hits: Array<{
    objectID: string;
    title: string;
    url?: string;
    story_text?: string;
    points: number;
    num_comments: number;
    author: string;
    created_at: string;
    _tags: string[];
  }>;
}

export interface HackerNewsScanConfig {
  minScore?: number;
  maxAge?: number;
  includeShowHN?: boolean;
  includeAskHN?: boolean;
}

export class HackerNewsScanner {
  private baseUrl = 'https://hacker-news.firebaseio.com/v0';
  private algoliaUrl = 'https://hn.algolia.com/api/v1';

  constructor() {
    console.log('📰 Hacker News Scanner initialized');
  }

  async scanFrontPage(config: HackerNewsScanConfig = {}): Promise<Discovery[]> {
    console.log('📰 Scanning Hacker News front page...');

    const minScore = config.minScore || 10;
    const discoveries: Discovery[] = [];

    try {
      const topStoriesRes = await fetch(`${this.baseUrl}/topstories.json`);
      const topStories = await topStoriesRes.json() as number[];

      const storyPromises = topStories.slice(0, 30).map(id => this.getItem(id));
      const stories = await Promise.all(storyPromises);

      for (const story of stories) {
        if (!story || !story.title) continue;
        if (story.score && story.score < minScore) continue;

        if (story.url) {
          discoveries.push(this.storyToDiscovery(story));
        }
      }

      console.log(`   ✅ Found ${discoveries.length} front page stories (score >= ${minScore})`);

    } catch (error: any) {
      console.error('   ❌ Error scanning front page:', error.message);
    }

    return discoveries;
  }

  async searchByKeywords(keywords: string[], minScore: number = 10): Promise<Discovery[]> {
    console.log(`🔍 Searching Hacker News for: ${keywords.join(', ')}`);

    const discoveries: Discovery[] = [];
    const seenIds = new Set<string>();

    for (const keyword of keywords) {
      try {
        const searchUrl = `${this.algoliaUrl}/search?query=${encodeURIComponent(keyword)}&tags=story&hitsPerPage=20`;
        const response = await fetch(searchUrl);
        const data = await response.json() as HNSearchResult;

        for (const hit of data.hits) {
          if (seenIds.has(hit.objectID)) continue;
          if (hit.points < minScore) continue;
          if (!hit.url) continue;

          seenIds.add(hit.objectID);

          discoveries.push({
            source: 'hackernews',
            sourceId: hit.objectID,
            url: hit.url,
            title: hit.title,
            description: hit.story_text || undefined,
            upvotes: hit.points,
            comments: hit.num_comments,
            metadata: {
              author: hit.author,
              createdAt: new Date(hit.created_at),
              matchedKeyword: keyword,
              storyUrl: `https://news.ycombinator.com/item?id=${hit.objectID}`,
              tags: hit._tags,
            },
          });
        }

        console.log(`   ✅ Keyword "${keyword}": ${data.hits.length} results`);
        await this.sleep(1000);

      } catch (error: any) {
        console.error(`   ❌ Error searching "${keyword}":`, error.message);
      }
    }

    console.log(`🔍 Search complete: ${discoveries.length} unique stories found`);
    return discoveries;
  }

  async scanShowHN(minScore: number = 10): Promise<Discovery[]> {
    console.log('🚀 Scanning "Show HN" posts...');

    const discoveries: Discovery[] = [];

    try {
      const searchUrl = `${this.algoliaUrl}/search?query=&tags=show_hn&hitsPerPage=30`;
      const response = await fetch(searchUrl);
      const data = await response.json() as HNSearchResult;

      for (const hit of data.hits) {
        if (hit.points < minScore) continue;

        discoveries.push({
          source: 'hackernews_show',
          sourceId: hit.objectID,
          url: hit.url || `https://news.ycombinator.com/item?id=${hit.objectID}`,
          title: hit.title,
          description: hit.story_text || undefined,
          upvotes: hit.points,
          comments: hit.num_comments,
          metadata: {
            author: hit.author,
            createdAt: new Date(hit.created_at),
            storyUrl: `https://news.ycombinator.com/item?id=${hit.objectID}`,
            isShowHN: true,
          },
        });
      }

      console.log(`   ✅ Found ${discoveries.length} Show HN posts (score >= ${minScore})`);

    } catch (error: any) {
      console.error('   ❌ Error scanning Show HN:', error.message);
    }

    return discoveries;
  }

  async scanTrending(keywords: string[]): Promise<Discovery[]> {
    console.log('📈 Scanning trending HN topics...');

    const discoveries: Discovery[] = [];
    const oneDayAgo = Math.floor(Date.now() / 1000) - (24 * 60 * 60);

    for (const keyword of keywords) {
      try {
        const searchUrl = `${this.algoliaUrl}/search?query=${encodeURIComponent(keyword)}&tags=story&numericFilters=created_at_i>${oneDayAgo}&hitsPerPage=10`;
        const response = await fetch(searchUrl);
        const data = await response.json() as HNSearchResult;

        for (const hit of data.hits) {
          if (!hit.url) continue;

          discoveries.push({
            source: 'hackernews_trending',
            sourceId: hit.objectID,
            url: hit.url,
            title: hit.title,
            description: hit.story_text || undefined,
            upvotes: hit.points,
            comments: hit.num_comments,
            metadata: {
              author: hit.author,
              createdAt: new Date(hit.created_at),
              matchedKeyword: keyword,
              storyUrl: `https://news.ycombinator.com/item?id=${hit.objectID}`,
              ageHours: Math.floor((Date.now() - new Date(hit.created_at).getTime()) / (1000 * 60 * 60)),
            },
          });
        }

        console.log(`   ✅ Trending "${keyword}": ${data.hits.length} results`);
        await this.sleep(1000);

      } catch (error: any) {
        console.error(`   ❌ Error scanning trending "${keyword}":`, error.message);
      }
    }

    console.log(`📈 Trending scan complete: ${discoveries.length} stories found`);
    return discoveries;
  }

  private async getItem(id: number): Promise<HNItem | null> {
    try {
      const response = await fetch(`${this.baseUrl}/item/${id}.json`);
      return await response.json() as HNItem;
    } catch (error) {
      return null;
    }
  }

  private storyToDiscovery(story: HNItem): Discovery {
    return {
      source: 'hackernews',
      sourceId: story.id.toString(),
      url: story.url!,
      title: story.title!,
      description: story.text,
      upvotes: story.score,
      comments: story.descendants,
      metadata: {
        author: story.by,
        createdAt: new Date(story.time * 1000),
        storyUrl: `https://news.ycombinator.com/item?id=${story.id}`,
      },
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
