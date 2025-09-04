import { Router, Request, Response } from 'express';
import { SyncService } from '../services/syncService';
import { TaskService } from '../services/taskService';
import { Database } from '../db/database';

export function createSyncRouter(db: Database): Router {
  const router = Router();
  const taskService = new TaskService(db);
  const syncService = new SyncService(db, taskService);

  // Trigger manual sync
  router.post('/sync', async (_req: Request, res: Response) => {
    try {
      const syncResult = await syncService.sync();
      res.json(syncResult);
    } catch (error) {
      console.error('Error during sync:', error);
      res.status(500).json({
        success: false,
        synced_items: 0,
        failed_items: 0,
        errors: [{
          task_id: 'sync',
          operation: 'sync',
          error: 'Sync operation failed',
          timestamp: new Date()
        }]
      });
    }
  });

  // Check sync status
  router.get('/status', async (_req: Request, res: Response) => {
    try {
      // Get pending sync count
      const pendingItems = await db.all(
        'SELECT COUNT(*) as count FROM sync_queue'
      );
      const pendingSyncCount = pendingItems[0]?.count || 0;

      // Get last sync timestamp
      const lastSyncResult = await db.get(
        'SELECT MAX(last_synced_at) as last_sync FROM tasks WHERE last_synced_at IS NOT NULL'
      );
      const lastSyncTimestamp = lastSyncResult?.last_sync || null;

      // Check connectivity
      const isOnline = await syncService.checkConnectivity();

      res.json({
        pending_sync_count: pendingSyncCount,
        last_sync_timestamp: lastSyncTimestamp,
        is_online: isOnline,
        sync_queue_size: pendingSyncCount
      });
    } catch (error) {
      console.error('Error getting sync status:', error);
      res.status(500).json({ error: 'Failed to get sync status' });
    }
  });

  // Batch sync endpoint (for server-side)
  router.post('/batch', async (req: Request, res: Response) => {
    try {
      const { items, client_timestamp: _client_timestamp } = req.body;

      if (!Array.isArray(items)) {
        return res.status(400).json({ error: 'Invalid items array' });
      }

      // Process each item and prepare response
      const processed_items = [];

      for (const item of items) {
        // Validate item structure
        if (!item.task_id || !item.operation || !item.data) {
          processed_items.push({
            client_id: item.task_id || null,
            server_id: null,
            status: 'error',
            error: 'Invalid item structure'
          });
          continue;
        }

        // Simulate server-side processing and conflict resolution
        // For this challenge, we assume server accepts the item as is
        // In real scenario, server would apply business logic and resolve conflicts

        processed_items.push({
          client_id: item.task_id,
          server_id: `srv_${item.task_id}`, // Simulated server ID
          status: 'success',
          resolved_data: {
            id: `srv_${item.task_id}`,
            title: item.data.title || '',
            description: item.data.description || '',
            completed: item.data.completed || false,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            is_deleted: false
          }
        });
      }

      res.json({ processed_items });
    } catch (error) {
      console.error('Error processing batch sync:', error);
      res.status(500).json({ error: 'Failed to process batch sync' });
    }
  });

  // Health check endpoint
  router.get('/health', async (_req: Request, res: Response) => {
    res.json({ status: 'ok', timestamp: new Date() });
  });

  return router;
}