import { Handler } from '@netlify/functions'

// Bluesky search API to find posts with hashtags
async function searchCrypticCluePosts(limit: number = 50, cursor?: string) {
  try {
    const searchUrl = 'https://bsky.social/xrpc/app.bsky.feed.searchPosts'
    const params = new URLSearchParams({
      q: '#crypticclueaday',
      limit: limit.toString()
    })
    
    if (cursor) {
      params.set('cursor', cursor)
    }
    
    const response = await fetch(`${searchUrl}?${params}`)
    
    if (!response.ok) {
      console.error('Search API error:', response.status, response.statusText)
      return { posts: [], cursor: undefined }
    }
    
    const data = await response.json() as any
    
    return {
      posts: data.posts || [],
      cursor: data.cursor
    }
  } catch (error) {
    console.error('Error searching posts:', error)
    return { posts: [], cursor: undefined }
  }
}

export const handler: Handler = async (event, context) => {
  try {
    
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
        
        // Search for posts with hashtag
        const searchResult = await searchCrypticCluePosts(limit, cursor)
        
        return {
          statusCode: 200,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            feed: searchResult.posts.map((post: any) => ({ post: post.uri })),
            cursor: searchResult.cursor
          })
        }
      }
    }

    // Debug endpoint
    if (event.path === '/debug') {
      const searchResult = await searchCrypticCluePosts(10)
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          postCount: searchResult.posts.length,
          message: 'Debug info for feed generator',
          recentPosts: searchResult.posts.slice(0, 3).map((p: any) => ({
            uri: p.uri,
            text: p.record?.text?.slice(0, 100) + '...'
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
          '/debug'
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