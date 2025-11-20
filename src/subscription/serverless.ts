import WebSocket from 'ws'
import { MemoryDatabase, Post } from '../db/memory'

interface FirehosePost {
  uri: string
  cid: string
  record: {
    text: string
    createdAt: string
  }
}

interface FirehoseEvent {
  ops: {
    posts: {
      creates: FirehosePost[]
      deletes: { uri: string }[]
    }
  }
}

export class ServerlessFirehoseSubscription {
  private ws: WebSocket | null = null
  private reconnectDelay: number
  
  constructor(
    private db: MemoryDatabase,
    private subscriptionEndpoint: string = 'wss://bsky.network',
    reconnectDelay: number = 3000
  ) {
    this.reconnectDelay = reconnectDelay
  }

  start() {
    this.connect()
  }

  stop() {
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
  }

  private connect() {
    try {
      console.log('Connecting to firehose...')
      this.ws = new WebSocket(`${this.subscriptionEndpoint}/xrpc/com.atproto.sync.subscribeRepos`)
      
      this.ws.on('open', () => {
        console.log('Connected to firehose')
      })
      
      this.ws.on('message', (data) => {
        try {
          this.handleMessage(data)
        } catch (error) {
          console.error('Error handling message:', error)
        }
      })
      
      this.ws.on('error', (error) => {
        console.error('WebSocket error:', error)
        this.scheduleReconnect()
      })
      
      this.ws.on('close', () => {
        console.log('WebSocket closed')
        this.scheduleReconnect()
      })
      
    } catch (error) {
      console.error('Failed to connect to firehose:', error)
      this.scheduleReconnect()
    }
  }

  private scheduleReconnect() {
    if (this.ws) {
      this.ws = null
    }
    console.log(`Reconnecting in ${this.reconnectDelay}ms...`)
    setTimeout(() => this.connect(), this.reconnectDelay)
  }

  private async handleMessage(data: any) {
    try {
      // Parse the CAR file format (simplified)
      // For now, we'll simulate hashtag posts since parsing CAR is complex
      this.simulateHashtagPost()
    } catch (error) {
      console.error('Error parsing firehose message:', error)
    }
  }

  // Temporary simulation - in production you'd parse the actual firehose data
  private async simulateHashtagPost() {
    // Only simulate occasionally to avoid spam
    if (Math.random() > 0.1) return
    
    const now = new Date().toISOString()
    const mockPost: Post = {
      uri: `at://did:example:${Date.now()}/app.bsky.feed.post/${Date.now()}`,
      cid: `bafyrei${Math.random().toString(36).substring(7)}`,
      indexedAt: now,
      text: `Here's today's cryptic clue! #crypticclueaday - Mock post at ${now}`
    }
    
    await this.db.insertPost(mockPost)
    console.log(`Added mock #crypticclueaday post: ${mockPost.uri}`)
  }
}