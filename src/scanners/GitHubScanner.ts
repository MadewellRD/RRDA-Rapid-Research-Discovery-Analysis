import { Octokit } from '@octokit/rest';
import { Discovery } from '../types/index.js';

export interface GitHubScanConfig {
  trending?: {
    languages?: string[];
    since?: 'daily' | 'weekly' | 'monthly';
  };
  search?: {
    keywords: string[];
    minStars?: number;
  };
}

export class GitHubScanner {
  private octokit: Octokit;
  private accountIndex: number = 0;
  private accounts: Array<{ token: string; username: string }>;

  constructor() {
    // Multi-account support for rate limit distribution
    this.accounts = [
      {
        token: process.env.GITHUB_TOKEN_1!,
        username: process.env.GITHUB_USERNAME_1!,
      },
      {
        token: process.env.GITHUB_TOKEN_2!,
        username: process.env.GITHUB_USERNAME_2!,
      },
    ].filter(account => account.token && account.username);

    if (this.accounts.length === 0) {
      throw new Error('No GitHub tokens configured');
    }

    // Start with first account
    this.octokit = new Octokit({
      auth: this.accounts[0].token,
    });

    console.log(`🐙 GitHub Scanner initialized with ${this.accounts.length} account(s)`);
  }

  /**
   * Rotate to next GitHub account for rate limit distribution
   */
  private rotateAccount(): void {
    this.accountIndex = (this.accountIndex + 1) % this.accounts.length;
    const account = this.accounts[this.accountIndex];
    
    this.octokit = new Octokit({
      auth: account.token,
    });
    
    console.log(`🔄 Rotated to GitHub account: ${account.username}`);
  }

  /**
   * Check rate limit status
   */
  async checkRateLimit(): Promise<{
    remaining: number;
    limit: number;
    reset: Date;
  }> {
    try {
      const { data } = await this.octokit.rateLimit.get();
      
      return {
        remaining: data.rate.remaining,
        limit: data.rate.limit,
        reset: new Date(data.rate.reset * 1000),
      };
    } catch (error) {
      console.error('Rate limit check failed:', error);
      throw error;
    }
  }

  /**
   * Scan GitHub trending repositories
   */
  async scanTrending(config: GitHubScanConfig['trending'] = {}): Promise<Discovery[]> {
    console.log('📊 Scanning GitHub trending repositories...');

    const discoveries: Discovery[] = [];
    const languages = config.languages || ['typescript', 'python', 'javascript', 'rust', 'go'];

    // GitHub doesn't have an official trending API, so we'll use search with recent activity
    // as a proxy for trending
    for (const language of languages) {
      try {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        const query = [
          `language:${language}`,
          `created:>${sevenDaysAgo.toISOString().split('T')[0]}`,
          'stars:>50', // Minimum threshold
        ].join(' ');

        const { data } = await this.octokit.search.repos({
          q: query,
          sort: 'stars',
          order: 'desc',
          per_page: 10,
        });

        for (const repo of data.items) {
          // Skip if owner is null
          if (!repo.owner) continue;

          discoveries.push({
            source: 'github_trending',
            sourceId: repo.id.toString(),
            url: repo.html_url,
            title: repo.full_name,
            description: repo.description || undefined,
            stars: repo.stargazers_count,
            forks: repo.forks_count,
            metadata: {
              language: repo.language,
              topics: repo.topics || [],
              createdAt: repo.created_at,
              updatedAt: repo.updated_at,
              owner: repo.owner.login,
              hasIssues: repo.has_issues,
              openIssues: repo.open_issues_count,
              watchers: repo.watchers_count,
              defaultBranch: repo.default_branch,
            },
          });
        }

        console.log(`   ✅ Found ${data.items.length} trending ${language} repos`);

        // Small delay to be polite
        await this.sleep(1000);

      } catch (error: any) {
        if (error.status === 403) {
          console.log('   ⚠️  Rate limit hit, rotating account...');
          this.rotateAccount();
        } else {
          console.error(`   ❌ Error scanning ${language}:`, error.message);
        }
      }
    }

    console.log(`📊 Trending scan complete: ${discoveries.length} repositories found`);
    return discoveries;
  }

  /**
   * Search GitHub by keywords
   */
  async searchByKeywords(keywords: string[], minStars: number = 10): Promise<Discovery[]> {
    console.log(`🔍 Searching GitHub for keywords: ${keywords.join(', ')}`);

    const discoveries: Discovery[] = [];
    const seenRepos = new Set<string>();

    for (const keyword of keywords) {
      try {
        // Search in repository name, description, and README
        const query = [
          keyword,
          `stars:>=${minStars}`,
          'fork:false', // Exclude forks
        ].join(' ');

        const { data } = await this.octokit.search.repos({
          q: query,
          sort: 'stars',
          order: 'desc',
          per_page: 20,
        });

        for (const repo of data.items) {
          // Skip if owner is null or already seen
          if (!repo.owner) continue;
          if (seenRepos.has(repo.html_url)) continue;
          seenRepos.add(repo.html_url);

          discoveries.push({
            source: 'github_search',
            sourceId: repo.id.toString(),
            url: repo.html_url,
            title: repo.full_name,
            description: repo.description || undefined,
            stars: repo.stargazers_count,
            forks: repo.forks_count,
            metadata: {
              language: repo.language,
              topics: repo.topics || [],
              matchedKeyword: keyword,
              createdAt: repo.created_at,
              updatedAt: repo.updated_at,
              owner: repo.owner.login,
              license: repo.license?.name,
            },
          });
        }

        console.log(`   ✅ Keyword "${keyword}": ${data.items.length} results`);

        await this.sleep(2000); // Be polite with rate limits

      } catch (error: any) {
        if (error.status === 403) {
          console.log('   ⚠️  Rate limit hit, rotating account...');
          this.rotateAccount();
          await this.sleep(5000);
        } else {
          console.error(`   ❌ Error searching "${keyword}":`, error.message);
        }
      }
    }

    console.log(`🔍 Search complete: ${discoveries.length} unique repositories found`);
    return discoveries;
  }

  /**
   * Get detailed repository information
   */
  async getRepoDetails(owner: string, repo: string): Promise<any> {
    try {
      const { data } = await this.octokit.repos.get({
        owner,
        repo,
      });

      return data;
    } catch (error: any) {
      console.error(`❌ Error fetching ${owner}/${repo}:`, error.message);
      throw error;
    }
  }

  /**
   * Get repository README
   */
  async getReadme(owner: string, repo: string): Promise<string | null> {
    try {
      const { data } = await this.octokit.repos.getReadme({
        owner,
        repo,
      });

      // Decode base64 content
      const content = Buffer.from(data.content, 'base64').toString('utf-8');
      return content;
    } catch (error) {
      return null;
    }
  }

  /**
   * Get repository languages breakdown
   */
  async getLanguages(owner: string, repo: string): Promise<Record<string, number>> {
    try {
      const { data } = await this.octokit.repos.listLanguages({
        owner,
        repo,
      });

      return data;
    } catch (error) {
      return {};
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
