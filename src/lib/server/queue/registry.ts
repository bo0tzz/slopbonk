import { evaluateQueue } from '../policy/queues';
import type { QueueDefinition, Worker } from '.';

export const queues: QueueDefinition<object>[] = [evaluateQueue];

export const workers: Worker<object>[] = [];
