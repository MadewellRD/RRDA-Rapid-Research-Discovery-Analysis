import { Discovery } from '../types/index.js';

interface RedditPost {
  data: {
    id: string;
    title: string;
    url: string;
    selftext?: string;
    author: string;
    created_utc: number;
    score: number;
    num_comments: number;
    subreddit: string;
    permalink: string;
    is_self: boolean;
  };
}

interface RedditResponse {
  data: {
    children: RedditPost[];
  };
}

export interface RedditScanConfig {
  subreddits?: string[];
  minScore?: number;
  timeFilter?: 'hour' | 'day' | 'week' | 'month' | 'year' | 'all';
}

export class RedditScanner {
  private baseUrl = 'https://www.reddit.com';

  constructor() {
    console.log('🔴 Reddit Scanner initialized');
  }

  async scanSubreddits(config: RedditScanConfig = {}): Promise<Discovery[]> {
    const subreddits = config.subreddits || ['programming', 'machinelearning', 'artificial', 'startups'];
    const minScore = config.minScore || 10;
    const timeFilter = config.timeFilter || 'day';

    console.log(`🔴 Scanning Reddit: r/${subreddits.join(', r/')}`);

    const discoveries: Discovery[] = [];

    for (const subreddit of subreddits) {
      try {
        const url = `${this.baseUrl}/r/${subreddit}/top.json?t=${timeFilter}&limit=25`;
        const response = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; RDA-Intelligence/1.0; +https://madewellrd.com)',
            'Accept': 'application/json',
          },
        });

        // Check if response is actually JSON
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
          console.log(`   ⚠️  r/${subreddit}: Reddit returned HTML (rate limited or blocked)`);
          await this.sleep(5000); // Wait longer before next request
          continue;
        }

        const data = await response.json() as RedditResponse;

        if (data.data && data.data.children) {
          for (const post of data.data.children) {
            if (post.data.score < minScore) continue;
            
            if (post.data.is_self && post.data.score < 50) continue;

            discoveries.push({
              source: 'reddit',
              sourceId: post.data.id,
              url: post.data.is_self 
                ? `${this.baseUrl}${post.data.permalink}`
                : post.data.url,
              title: post.data.title,
              description: post.data.selftext?.substring(0, 500),
              upvotes: post.data.score,
              comments: post.data.num_comments,
              metadata: {
                subreddit: post.data.subreddit,
                author: post.data.author,
                createdAt: new Date(post.data.created_utc * 1000),
                permalink: `${this.baseUrl}${post.data.permalink}`,
                isSelfPost: post.data.is_self,
              },
            });
          }
        }

        const count = discoveries.filter(d => d.metadata?.subreddit === subreddit).length;
        console.log(`   ✅ r/${subreddit}: ${count} posts`);

        await this.sleep(3000); // Longer delay to be polite

      } catch (error: any) {
        console.error(`   ❌ Error scanning r/${subreddit}:`, error.message);
        await this.sleep(5000);
      }
    }

    console.log(`🔴 Reddit scan complete: ${discoveries.length} posts found`);
    return discoveries;
  }

  async searchByKeywords(keywords: string[], minScore: number = 10): Promise<Discovery[]> {
    console.log(`🔍 Searching Reddit for: ${keywords.join(', ')}`);

    const discoveries: Discovery[] = [];
    const seenIds = new Set<string>();

    for (const keyword of keywords) {
      try {
        const query = encodeURIComponent(keyword);
        const url = `${this.baseUrl}/search.json?q=${query}&sort=relevance&t=month&limit=20`;
        
        const response = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; RDA-Intelligence/1.0; +https://madewellrd.com)',
            'Accept': 'application/json',
          },
        });

        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
          console.log(`   ⚠️  Search "${keyword}": Reddit returned HTML (rate limited)`);
          await this.sleep(5000);
          continue;
        }

        const data = await response.json() as RedditResponse;

        if (data.data && data.data.children) {
          for (const post of data.data.children) {
            if (seenIds.has(post.data.id)) continue;
            if (post.data.score < minScore) continue;

            seenIds.add(post.data.id);

            discoveries.push({
              source: 'reddit_search',
              sourceId: post.data.id,
              url: post.data.is_self
                ? `${this.baseUrl}${post.data.permalink}`
                : post.data.url,
              title: post.data.title,
              description: post.data.selftext?.substring(0, 500),
              upvotes: post.data.score,
              comments: post.data.num_comments,
              metadata: {
                subreddit: post.data.subreddit,
                author: post.data.author,
                createdAt: new Date(post.data.created_utc * 1000),
                permalink: `${this.baseUrl}${post.data.permalink}`,
                matchedKeyword: keyword,
              },
            });
          }
        }

        const count = discoveries.filter(d => d.metadata?.matchedKeyword === keyword).length;
        console.log(`   ✅ Keyword "${keyword}": ${count} results`);

        await this.sleep(3000);

      } catch (error: any) {
        console.error(`   ❌ Error searching "${keyword}":`, error.message);
        await this.sleep(5000);
      }
    }

    console.log(`🔍 Search complete: ${discoveries.length} unique posts found`);
    return discoveries;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
