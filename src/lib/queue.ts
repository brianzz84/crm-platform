import { Queue } from 'bullmq'
import IORedis from 'ioredis'

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'

// Singleton Redis — dipakai worker (butuh maxRetriesPerRequest: null)
let _redis: IORedis | null = null
export function getRedis(): IORedis {
  if (!_redis) {
    _redis = new IORedis(REDIS_URL, { maxRetriesPerRequest: null })
  }
  return _redis
}

// BullMQ Queue config — pakai URL string agar bisa dipakai dari Next.js route juga
export const QUEUE_SAPAAN = 'sapaan'

const _queues: Record<string, Queue> = {}
export function getQueue(name: string): Queue {
  if (!_queues[name]) {
    _queues[name] = new Queue(name, {
      connection: { url: REDIS_URL },
    })
  }
  return _queues[name]
}

export function getSapaanQueue(): Queue {
  return getQueue(QUEUE_SAPAAN)
}
