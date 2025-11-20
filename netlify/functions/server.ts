import { Handler } from '@netlify/functions'
import { MemoryDatabase } from '../../src/db/memory'

// Simple in-memory storage (resets on each cold start)
let memoryDb: MemoryDatabase | null = null

const getDatabase = () => {
  if (!memoryDb) {
    memoryDb = new MemoryDatabase()
  }
  return memoryDb
}

export const handler: Handler = async (event, context) => {
  try {
    const db = getDatabase()
    
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
        // Return empty feed for now (will populate as firehose data comes in)
        return {
          statusCode: 200,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            feed: []
          })
        }
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
          '/xrpc/app.bsky.feed.getFeedSkeleton'
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