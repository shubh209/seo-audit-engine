import { Queue } from 'bullmq';
import Redis from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

// BullMQ needs its own Redis connection — separate from the cache client
const connection = new Redis(process.env.REDIS_URL, {
  maxRetriesPerRequest: null,
});

const auditQueue = new Queue('seo-audits', {
    connection,
    defaultJobOptions: {
        attempts: 3,               // Retry failed jobs 3 times
        backoff: {
            type: 'exponential',     // Wait longer between each retry
            delay: 5000              // Start with 5 seconds
        },
        removeOnComplete: 100,     // Keep last 100 completed jobs in Redis
        removeOnFail: 50           // Keep last 50 failed jobs for debugging
    }
});

export default auditQueue;