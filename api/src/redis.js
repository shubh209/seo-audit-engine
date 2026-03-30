import Redis from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

const redis = new Redis(process.env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableAutoPipelining: true
});

redis.on('connect', () => console.log('Connected to Upstash Redis'));
redis.on('error', (err) => console.error('Redis error:', err));

export default redis;