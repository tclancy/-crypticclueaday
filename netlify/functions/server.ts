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
    
    // Create separate table for Dover NH posts
    await sql`
      CREATE TABLE IF NOT EXISTS dovernh_posts (
        uri TEXT PRIMARY KEY,
        cid TEXT NOT NULL,
        indexed_at TIMESTAMP DEFAULT NOW(),
        text TEXT,
        author_did TEXT,
        created_at TIMESTAMP
      )
    `
    
    await sql`
      CREATE INDEX IF NOT EXISTS idx_dovernh_posts_indexed_at ON dovernh_posts(indexed_at DESC)
    `
    
    console.log('Database initialized')
  } catch (error) {
    console.error('Database initialization error:', error)
  }
}

// Authenticate with Bluesky and get access token
async function getBlueskyAuth() {
  try {
    const username = process.env.BLUESKY_USERNAME
    const password = process.env.BLUESKY_PASSWORD
    
    if (!username || !password) {
      console.error('Missing Bluesky credentials')
      return null
    }
    
    const response = await fetch('https://bsky.social/xrpc/com.atproto.server.createSession', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identifier: username,
        password: password
      })
    })
    
    if (!response.ok) {
      console.error('Auth failed:', response.status, await response.text())
      return null
    }
    
    const auth = await response.json() as any
    return auth.accessJwt
  } catch (error) {
    console.error('Auth error:', error)
    return null
  }
}

// Check if post matches Dover NH criteria
function matchesDoverNH(text: string): boolean {
  const lowerText = text.toLowerCase()
  
  // Check hashtags
  if (lowerText.includes('#dovernh') || lowerText.includes('#03820')) {
    return true
  }
  
  // Check location references
  const doverPatterns = [
    'dover, nh',
    'dover nh',
    'dover, new hampshire',
    'dover new hampshire',
    'dover n.h.',
    'dover n h',
    '03820'
  ]
  
  return doverPatterns.some(pattern => lowerText.includes(pattern))
}

// Search for and ingest new posts from your account
async function ingestRecentPosts() {
  try {
    const yourDID = process.env.FEEDGEN_PUBLISHER_DID
    if (!yourDID) return
    
    // Get authentication token
    const accessToken = await getBlueskyAuth()
    if (!accessToken) {
      console.log('Failed to authenticate with Bluesky')
      return
    }
    
    // Search for your recent posts with auth
    const response = await fetch(`https://bsky.social/xrpc/app.bsky.feed.getAuthorFeed?actor=${yourDID}&limit=20`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    })
    
    if (!response.ok) {
      console.log('Failed to fetch author feed:', response.status, await response.text())
      return
    }
    
    const data = await response.json() as any
    let crypticCount = 0
    let doverCount = 0
    
    for (const item of data.feed || []) {
      const post = item.post
      const postText = post.record?.text || ''
      
      // Check for cryptic clue posts
      if (postText.includes('#crypticclueaday')) {
        try {
          await sql`
            INSERT INTO posts (uri, cid, text, author_did, created_at)
            VALUES (${post.uri}, ${post.cid}, ${postText}, ${post.author.did}, ${post.record.createdAt})
            ON CONFLICT (uri) DO NOTHING
          `
          crypticCount++
          console.log(`Added cryptic clue: ${postText.slice(0, 50)}...`)
        } catch (insertError) {
          console.error('Insert error for cryptic clue post:', post.uri, insertError)
        }
      }
      
      // Check for Dover NH posts
      if (matchesDoverNH(postText)) {
        try {
          await sql`
            INSERT INTO dovernh_posts (uri, cid, text, author_did, created_at)
            VALUES (${post.uri}, ${post.cid}, ${postText}, ${post.author.did}, ${post.record.createdAt})
            ON CONFLICT (uri) DO NOTHING
          `
          doverCount++
          console.log(`Added Dover NH post: ${postText.slice(0, 50)}...`)
        } catch (insertError) {
          console.error('Insert error for Dover NH post:', post.uri, insertError)
        }
      }
    }
    
    if (crypticCount > 0) {
      console.log(`Added ${crypticCount} new #crypticclueaday posts`)
    }
    if (doverCount > 0) {
      console.log(`Added ${doverCount} new Dover NH posts`)
    }
    if (crypticCount === 0 && doverCount === 0) {
      console.log('No new posts found for either feed')
    }
  } catch (error) {
    console.error('Ingest error:', error)
  }
}

// Get posts for cryptic clue feed from database
async function getCrypticCluePostsFromDatabase(limit: number = 50, cursor?: string) {
  try {
    let posts: any[]
    
    if (cursor) {
      const cursorDate = new Date(parseInt(cursor, 10))
      posts = await sql`
        SELECT uri, cid, indexed_at 
        FROM posts 
        WHERE text ILIKE '%#crypticclueaday%'
        AND indexed_at < ${cursorDate}
        ORDER BY indexed_at DESC 
        LIMIT ${limit}
      `
    } else {
      posts = await sql`
        SELECT uri, cid, indexed_at 
        FROM posts 
        WHERE text ILIKE '%#crypticclueaday%'
        ORDER BY indexed_at DESC 
        LIMIT ${limit}
      `
    }
    
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

// Get posts for Dover NH feed from database
async function getDoverNHPostsFromDatabase(limit: number = 50, cursor?: string) {
  try {
    let posts: any[]
    
    if (cursor) {
      const cursorDate = new Date(parseInt(cursor, 10))
      posts = await sql`
        SELECT uri, cid, indexed_at 
        FROM dovernh_posts 
        WHERE indexed_at < ${cursorDate}
        ORDER BY indexed_at DESC 
        LIMIT ${limit}
      `
    } else {
      posts = await sql`
        SELECT uri, cid, indexed_at 
        FROM dovernh_posts 
        ORDER BY indexed_at DESC 
        LIMIT ${limit}
      `
    }
    
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

export const handler: Handler = async (event) => {
  try {
    // Initialize database on first call
    await initializeDatabase()
    
    // Ingest recent posts whenever feed is accessed
    if (event.path === '/xrpc/app.bsky.feed.getFeedSkeleton' || event.path === '/debug') {
      await ingestRecentPosts()
    }
    
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
          }, {
            uri: `at://${process.env.FEEDGEN_PUBLISHER_DID}/app.bsky.feed.generator/dovernh`,
            cid: "bafyreidykglsfhoixmivffc5uwhcgshx4j465xwqntbmu43nb2dzqwfvae"
          }]
        })
      }
    }

    if (event.path === '/xrpc/app.bsky.feed.getFeedSkeleton') {
      const feed = event.queryStringParameters?.feed
      const limit = parseInt(event.queryStringParameters?.limit || '50', 10)
      const cursor = event.queryStringParameters?.cursor
      
      if (feed?.includes('crypticclueaday')) {
        // Get cryptic clue posts from database
        const result = await getCrypticCluePostsFromDatabase(limit, cursor)
        
        return {
          statusCode: 200,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            feed: result.posts.map((post: any) => ({ post: post.uri })),
            cursor: result.cursor
          })
        }
      }
      
      if (feed?.includes('dovernh')) {
        // Get Dover NH posts from database
        const result = await getDoverNHPostsFromDatabase(limit, cursor)
        
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
      const crypticResult = await getCrypticCluePostsFromDatabase(10)
      const doverResult = await getDoverNHPostsFromDatabase(10)
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          crypticClueCount: crypticResult.posts.length,
          doverNHCount: doverResult.posts.length,
          message: 'Debug info for both feed generators',
          recentCrypticPosts: crypticResult.posts.slice(0, 2).map((p: any) => ({
            uri: p.uri,
            indexed_at: p.indexed_at
          })),
          recentDoverPosts: doverResult.posts.slice(0, 2).map((p: any) => ({
            uri: p.uri,
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
        message: 'Multi-feed Generator: Cryptic Clues & Dover NH',
        feeds: [
          'crypticclueaday',
          'dovernh'
        ],
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