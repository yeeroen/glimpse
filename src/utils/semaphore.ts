/**
 * A simple counting semaphore with a bounded waiting queue.
 *
 * - At most `maxConcurrency` tasks run simultaneously.
 * - Up to `maxQueue` tasks wait in line for a slot.
 * - Any task that arrives when the queue is full is rejected immediately.
 *
 * No external dependencies — just Promises.
 */
export class Semaphore {
    private running = 0;
    private readonly queue: Array<() => void> = [];
    private readonly maxConcurrency: number;
    private readonly maxQueue: number;

    constructor(maxConcurrency: number, maxQueue: number) {
        this.maxConcurrency = maxConcurrency;
        this.maxQueue = maxQueue;
    }

    /**
     * Acquire a slot. Resolves when a slot is available.
     * Throws if the queue is already full.
     */
    acquire(): Promise<void> {
        if (this.running < this.maxConcurrency) {
            this.running++;
            return Promise.resolve();
        }

        if (this.queue.length >= this.maxQueue) {
            return Promise.reject(new Error('Too many requests — server is at capacity'));
        }

        return new Promise<void>((resolve) => {
            this.queue.push(() => {
                this.running++;
                resolve();
            });
        });
    }

    /**
     * Release a slot, allowing the next queued task (if any) to proceed.
     */
    release(): void {
        const next = this.queue.shift();
        if (next) {
            next();
        } else {
            this.running--;
        }
    }

    /** Number of tasks currently executing. */
    get active(): number {
        return this.running;
    }

    /** Number of tasks waiting in the queue. */
    get pending(): number {
        return this.queue.length;
    }
}
