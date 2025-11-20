// Simple in-memory storage for serverless environments
export interface Post {
  uri: string
  cid: string
  indexedAt: string
}

export class MemoryDatabase {
  private posts: Post[] = []

  async insertPost(post: Post): Promise<void> {
    this.posts.push(post)
    // Keep only last 1000 posts to prevent memory issues
    if (this.posts.length > 1000) {
      this.posts = this.posts.slice(-1000)
    }
  }

  async getPostsByHashtag(hashtag: string, limit: number = 50): Promise<Post[]> {
    // In a real implementation, you'd filter by hashtag
    // For now, return recent posts
    return this.posts
      .slice(-limit)
      .reverse() // Most recent first
  }

  async deletePost(uri: string): Promise<void> {
    this.posts = this.posts.filter(p => p.uri !== uri)
  }
}

export const createMemoryDb = (): MemoryDatabase => {
  return new MemoryDatabase()
}