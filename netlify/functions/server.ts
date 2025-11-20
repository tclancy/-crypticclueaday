import { Handler } from '@netlify/functions'
import { neon } from '@netlify/neon'

// Database setup
const sql = neon()

// Initialize database schema
async function initializeDatabase() {
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS posts (
        uri TEXT PRIMARY KEY,
        cid TEXT NOT NULL,
        indexed_at TIMESTAMP DEFAULT NOW(),
        text TEXT,
        author_did TEXT,
        created_at TIMESTAMP
      )
    `
    
    await sql`
      CREATE INDEX IF NOT EXISTS idx_posts_indexed_at ON posts(indexed_at DESC)
    `
    
    console.log('Database initialized')
  } catch (error) {
    console.error('Database initialization error:', error)
  }
}

// Get posts for feed from database
async function getPostsFromDatabase(limit: number = 50, cursor?: string) {
  try {
    let query = sql`
      SELECT uri, cid, indexed_at 
      FROM posts 
      WHERE text ILIKE '%#crypticclueaday%'
    `
    
    if (cursor) {
      const cursorDate = new Date(parseInt(cursor, 10))
      query = sql`
        SELECT uri, cid, indexed_at 
        FROM posts 
        WHERE text ILIKE '%#crypticclueaday%'
        AND indexed_at < ${cursorDate}
      `
    }
    
    const posts = await sql`
      ${query}
      ORDER BY indexed_at DESC 
      LIMIT ${limit}
    `
    
    let nextCursor: string | undefined
    if (posts.length === limit) {
      const lastPost = posts[posts.length - 1]
      nextCursor = new Date(lastPost.indexed_at).getTime().toString()
    }
    
    return { posts, cursor: nextCursor }
  } catch (error) {
    console.error('Database query error:', error)
    return { posts: [], cursor: undefined }
  }
}

export const handler: Handler = async (event, context) => {
  try {
    // Initialize database on first call
    await initializeDatabase()
    
    // Handle basic feed endpoints
    if (event.path === '/.well-known/did.json') {
      const hostname = process.env.FEEDGEN_HOSTNAME || 'example.com'
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          "@context": ["https://www.w3.org/ns/did/v1"],
          "id": `did:web:${hostname}`,
          "service": [{
            "id": "#bsky_fg",
            "type": "BskyFeedGenerator", 
            "serviceEndpoint": `https://${hostname}`
          }]
        })
      }
    }

    if (event.path === '/xrpc/app.bsky.feed.describeFeedGenerator') {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          did: `did:web:${process.env.FEEDGEN_HOSTNAME}`,
          feeds: [{
            uri: `at://${process.env.FEEDGEN_PUBLISHER_DID}/app.bsky.feed.generator/crypticclueaday`,
            cid: "bafyreidykglsfhoixmivffc5uwhcgshx4j465xwqntbmu43nb2dzqwfvae"
          }]
        })
      }
    }

    if (event.path === '/xrpc/app.bsky.feed.getFeedSkeleton') {
      const feed = event.queryStringParameters?.feed
      if (feed?.includes('crypticclueaday')) {
        // Parse query parameters
        const limit = parseInt(event.queryStringParameters?.limit || '50', 10)
        const cursor = event.queryStringParameters?.cursor
        
        // Get posts from database
        const result = await getPostsFromDatabase(limit, cursor)
        
        return {
          statusCode: 200,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            feed: result.posts.map((post: any) => ({ post: post.uri })),
            cursor: result.cursor
          })
        }
      }
    }

    // Add post endpoint (for manual posting)
    if (event.path === '/add-post' && event.httpMethod === 'POST') {
      try {
        const body = JSON.parse(event.body || '{}')
        const { uri, cid, text, author_did } = body
        
        if (!uri || !cid || !text) {
          return {
            statusCode: 400,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: 'Missing required fields: uri, cid, text' })
          }
        }
        
        await sql`
          INSERT INTO posts (uri, cid, text, author_did, created_at)
          VALUES (${uri}, ${cid}, ${text}, ${author_did || null}, NOW())
          ON CONFLICT (uri) DO NOTHING
        `
        
        return {
          statusCode: 200,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ success: true, message: 'Post added' })
        }
      } catch (error) {
        console.error('Add post error:', error)
        return {
          statusCode: 500,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'Failed to add post' })
        }
      }
    }

    // Debug endpoint
    if (event.path === '/debug') {
      const dbResult = await getPostsFromDatabase(10)
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          postCount: dbResult.posts.length,
          message: 'Debug info for feed generator',
          recentPosts: dbResult.posts.slice(0, 3).map((p: any) => ({
            uri: p.uri,
            text: p.text?.slice(0, 100) + '...',
            indexed_at: p.indexed_at
          }))
        })
      }
    }

    // Default response
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Cryptic Clue a Day Feed Generator',
        endpoints: [
          '/.well-known/did.json',
          '/xrpc/app.bsky.feed.describeFeedGenerator',
          '/xrpc/app.bsky.feed.getFeedSkeleton',
          '/debug',
          '/add-post (POST)'
        ]
      })
    }

  } catch (error) {
    console.error('Function error:', error)
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        error: 'Internal server error',
        details: error instanceof Error ? error.message : String(error)
      })
    }
  }
}