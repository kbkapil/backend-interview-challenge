import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { Task, SyncQueueItem, SyncResult, SyncError, BatchSyncRequest, BatchSyncResponse } from '../types';
import { Database } from '../db/database';
import { TaskService } from './taskService';

export class SyncService {
  private apiUrl: string;
  
  constructor(
    private db: Database,
    private taskService: TaskService,
    apiUrl: string = process.env.API_BASE_URL || 'http://localhost:3000/api'
  ) {
    this.apiUrl = apiUrl;
  }

  async sync(): Promise<SyncResult> {
    // Check connectivity first
    if (!(await this.checkConnectivity())) {
      return {
        success: false,
        synced_items: 0,
        failed_items: 0,
        errors: [{
          task_id: 'connectivity',
          operation: 'connect',
          error: 'Server is not reachable',
          timestamp: new Date()
        }]
      };
    }

    // Get all items from sync queue
    const queueItems = await this.db.all(
      `SELECT id, task_id, operation, data, created_at, retry_count, error_message
       FROM sync_queue ORDER BY created_at ASC`
    ) as SyncQueueItem[];

    if (queueItems.length === 0) {
      return {
        success: true,
        synced_items: 0,
        failed_items: 0,
        errors: []
      };
    }

    const batchSize = parseInt(process.env.SYNC_BATCH_SIZE || '10');
    const batches: SyncQueueItem[][] = [];

    // Group items into batches
    for (let i = 0; i < queueItems.length; i += batchSize) {
      batches.push(queueItems.slice(i, i + batchSize));
    }

    let totalSynced = 0;
    let totalFailed = 0;
    const allErrors: SyncError[] = [];

    // Process each batch
    for (const batch of batches) {
      try {
        await this.processBatch(batch);
        totalSynced += batch.length;
      } catch (error) {
        totalFailed += batch.length;
        // Add batch-level errors
        for (const item of batch) {
          allErrors.push({
            task_id: item.task_id,
            operation: item.operation,
            error: (error as Error).message,
            timestamp: new Date()
          });
        }
      }
    }

    return {
      success: totalFailed === 0,
      synced_items: totalSynced,
      failed_items: totalFailed,
      errors: allErrors
    };
  }

  async addToSyncQueue(taskId: string, operation: 'create' | 'update' | 'delete', data: Partial<Task>): Promise<void> {
    const id = uuidv4();
    await this.db.run(
      `INSERT INTO sync_queue (id, task_id, operation, data, created_at, retry_count)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, taskId, operation, JSON.stringify(data), new Date().toISOString(), 0]
    );
  }

  private async processBatch(items: SyncQueueItem[]): Promise<BatchSyncResponse> {
    const batchRequest: BatchSyncRequest = {
      items: items,
      client_timestamp: new Date()
    };

    try {
      const response = await axios.post<BatchSyncResponse>(
        `${this.apiUrl}/batch`,
        batchRequest,
        { timeout: 30000 }
      );

      // Process each response item
      for (const result of response.data.processed_items) {
        const originalItem = items.find(item => item.task_id === result.client_id);
        if (!originalItem) continue;

        if (result.status === 'success') {
          // Update local task with server data if provided
          if (result.resolved_data) {
            await this.taskService.updateTask(result.client_id, result.resolved_data);
          }
          await this.updateSyncStatus(result.client_id, 'synced', { server_id: result.server_id });
        } else if (result.status === 'conflict') {
          // Handle conflict resolution
          const localTask = await this.taskService.getTask(result.client_id);
          if (localTask && result.resolved_data) {
            const resolvedTask = await this.resolveConflict(localTask, result.resolved_data);
            await this.taskService.updateTask(result.client_id, resolvedTask);
            await this.updateSyncStatus(result.client_id, 'synced', { server_id: result.server_id });
          }
        } else {
          // Handle sync error
          await this.handleSyncError(originalItem, new Error(result.error || 'Unknown sync error'));
        }
      }

      return response.data;
    } catch (error) {
      // Handle network/server errors for all items in batch
      for (const item of items) {
        await this.handleSyncError(item, error as Error);
      }
      throw error;
    }
  }

  private async resolveConflict(localTask: Task, serverTask: Task): Promise<Task> {
    // Last-write-wins strategy: compare updated_at timestamps
    if (localTask.updated_at > serverTask.updated_at) {
      console.log(`Conflict resolved: Local task ${localTask.id} is more recent (${localTask.updated_at} > ${serverTask.updated_at})`);
      return localTask;
    } else {
      console.log(`Conflict resolved: Server task ${serverTask.id} is more recent (${serverTask.updated_at} > ${localTask.updated_at})`);
      return serverTask;
    }
  }

  private async updateSyncStatus(taskId: string, status: 'synced' | 'error', serverData?: Partial<Task>): Promise<void> {
    const now = new Date();

    // Update task sync status
    let updateFields = 'sync_status = ?, last_synced_at = ?';
    let params: any[] = [status, now.toISOString()];

    if (serverData?.server_id) {
      updateFields += ', server_id = ?';
      params.push(serverData.server_id);
    }

    await this.db.run(
      `UPDATE tasks SET ${updateFields} WHERE id = ?`,
      [...params, taskId]
    );

    // Remove from sync queue if successful
    if (status === 'synced') {
      await this.db.run('DELETE FROM sync_queue WHERE task_id = ?', [taskId]);
    }
  }

  private async handleSyncError(item: SyncQueueItem, error: Error): Promise<void> {
    const maxRetries = parseInt(process.env.MAX_SYNC_RETRIES || '3');
    const newRetryCount = item.retry_count + 1;

    if (newRetryCount >= maxRetries) {
      // Mark as permanent failure
      console.error(`Sync failed permanently for task ${item.task_id}: ${error.message}`);
      await this.updateSyncStatus(item.task_id, 'error');
      await this.db.run(
        'DELETE FROM sync_queue WHERE id = ?',
        [item.id]
      );
    } else {
      // Increment retry count and store error
      await this.db.run(
        'UPDATE sync_queue SET retry_count = ?, error_message = ? WHERE id = ?',
        [newRetryCount, error.message, item.id]
      );
      console.warn(`Sync retry ${newRetryCount}/${maxRetries} for task ${item.task_id}: ${error.message}`);
    }
  }

  async checkConnectivity(): Promise<boolean> {
    // TODO: Check if server is reachable
    // 1. Make a simple health check request
    // 2. Return true if successful, false otherwise
    try {
      await axios.get(`${this.apiUrl}/health`, { timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }
}