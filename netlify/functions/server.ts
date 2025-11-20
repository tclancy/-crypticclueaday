import { Handler } from '@netlify/functions'
import dotenv from 'dotenv'
import FeedGenerator from '../../src/server'

dotenv.config()

let cachedFeedGenerator: FeedGenerator | null = null

const maybeStr = (val?: string) => {
  if (!val) return undefined
  return val
}

const maybeInt = (val?: string) => {
  if (!val) return undefined
  const int = parseInt(val, 10)
  if (isNaN(int)) return undefined
  return int
}

const createFeedGenerator = async () => {
  if (cachedFeedGenerator) {
    return cachedFeedGenerator
  }

  const hostname = maybeStr(process.env.FEEDGEN_HOSTNAME) ?? 'example.com'
  const serviceDid =
    maybeStr(process.env.FEEDGEN_SERVICE_DID) ?? `did:web:${hostname}`
  
  cachedFeedGenerator = FeedGenerator.create({
    port: 3000, // Not used in serverless
    listenhost: 'localhost', // Not used in serverless
    sqliteLocation: ':memory:', // Always use memory for serverless
    subscriptionEndpoint:
      maybeStr(process.env.FEEDGEN_SUBSCRIPTION_ENDPOINT) ??
      'wss://bsky.network',
    publisherDid:
      maybeStr(process.env.FEEDGEN_PUBLISHER_DID) ?? 'did:example:alice',
    subscriptionReconnectDelay:
      maybeInt(process.env.FEEDGEN_SUBSCRIPTION_RECONNECT_DELAY) ?? 3000,
    hostname,
    serviceDid,
  })

  // Initialize database and start firehose
  await cachedFeedGenerator.db
  cachedFeedGenerator.firehose.run(cachedFeedGenerator.cfg.subscriptionReconnectDelay)

  return cachedFeedGenerator
}

export const handler: Handler = async (event, context) => {
  try {
    const feedGenerator = await createFeedGenerator()
    
    // Build query string properly
    const queryString = event.queryStringParameters 
      ? Object.entries(event.queryStringParameters)
          .filter(([_, value]) => value !== null)
          .map(([key, value]) => `${key}=${encodeURIComponent(value as string)}`)
          .join('&')
      : ''
    
    // Convert Netlify event to Express-like request
    const mockReq = {
      method: event.httpMethod,
      url: event.path + (queryString ? '?' + queryString : ''),
      headers: event.headers,
      body: event.body
    }

    // Create a mock response object
    let responseBody = ''
    let statusCode = 200
    let responseHeaders: Record<string, string> = {}

    const mockRes = {
      status: (code: number) => {
        statusCode = code
        return mockRes
      },
      setHeader: (name: string, value: string) => {
        responseHeaders[name] = value
        return mockRes
      },
      json: (data: any) => {
        responseBody = JSON.stringify(data)
        responseHeaders['Content-Type'] = 'application/json'
        return mockRes
      },
      send: (data: string) => {
        responseBody = data
        return mockRes
      },
      end: (data?: string) => {
        if (data) responseBody = data
        return mockRes
      }
    }

    // Handle the request using the Express app
    return new Promise<any>((resolve) => {
      const expressHandler = feedGenerator.app
      
      // Mock Express request/response cycle
      expressHandler(mockReq as any, mockRes as any, () => {
        resolve({
          statusCode,
          headers: responseHeaders,
          body: responseBody
        })
      })
    })

  } catch (error) {
    console.error('Function error:', error)
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' })
    }
  }
}