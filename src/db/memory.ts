// Simple in-memory storage for serverless environments
export interface Post {
  uri: string
  cid: string
  indexedAt: string
  text?: string
}

export class MemoryDatabase {
  private posts: Post[] = []

  async insertPost(post: Post): Promise<void> {
    // Check if post already exists
    const exists = this.posts.find(p => p.uri === post.uri)
    if (exists) return

    this.posts.push(post)
    
    // Keep only last 500 posts to prevent memory issues
    if (this.posts.length > 500) {
      this.posts = this.posts.slice(-500)
    }
  }

  async getPostsForFeed(limit: number = 50, cursor?: string): Promise<{ posts: Post[], cursor?: string }> {
    let filteredPosts = this.posts
    
    // Apply cursor filtering if provided
    if (cursor) {
      const cursorTime = parseInt(cursor, 10)
      filteredPosts = this.posts.filter(post => {
        const postTime = new Date(post.indexedAt).getTime()
        return postTime < cursorTime
      })
    }
    
    // Sort by most recent first and limit
    const sortedPosts = filteredPosts
      .sort((a, b) => new Date(b.indexedAt).getTime() - new Date(a.indexedAt).getTime())
      .slice(0, limit)
    
    // Generate next cursor
    let nextCursor: string | undefined
    const last = sortedPosts.at(-1)
    if (last) {
      nextCursor = new Date(last.indexedAt).getTime().toString(10)
    }
    
    return {
      posts: sortedPosts,
      cursor: nextCursor
    }
  }

  async deletePost(uri: string): Promise<void> {
    this.posts = this.posts.filter(p => p.uri !== uri)
  }

  getPostCount(): number {
    return this.posts.length
  }
}

export const createMemoryDb = (): MemoryDatabase => {
  return new MemoryDatabase()
}