import { v4 as uuidv4 } from 'uuid';
import { Task } from '../types';
import { Database } from '../db/database';

export class TaskService {
  constructor(private db: Database) {}

  async createTask(taskData: Partial<Task>): Promise<Task> {
    const id = uuidv4();
    const now = new Date();

    const task: Task = {
      id,
      title: taskData.title!,
      description: taskData.description,
      completed: false,
      created_at: now,
      updated_at: now,
      is_deleted: false,
      sync_status: 'pending',
      server_id: undefined,
      last_synced_at: undefined
    };

    // Insert into database
    await this.db.run(
      `INSERT INTO tasks (id, title, description, completed, created_at, updated_at, is_deleted, sync_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [task.id, task.title, task.description || null, task.completed ? 1 : 0,
       task.created_at.toISOString(), task.updated_at.toISOString(),
       task.is_deleted ? 1 : 0, task.sync_status]
    );

    // Add to sync queue
    await this.addToSyncQueue(task.id, 'create', task);

    return task;
  }

  async updateTask(id: string, updates: Partial<Task>): Promise<Task | null> {
    // Check if task exists
    const existingTask = await this.getTask(id);
    if (!existingTask) {
      return null;
    }

    const now = new Date();
    const updatedTask: Task = {
      ...existingTask,
      ...updates,
      updated_at: now,
      sync_status: 'pending'
    };

    // Update in database
    await this.db.run(
      `UPDATE tasks SET
        title = ?, description = ?, completed = ?, updated_at = ?, sync_status = ?
       WHERE id = ?`,
      [updatedTask.title, updatedTask.description || null, updatedTask.completed ? 1 : 0,
       updatedTask.updated_at.toISOString(), updatedTask.sync_status, id]
    );

    // Add to sync queue
    await this.addToSyncQueue(id, 'update', updatedTask);

    return updatedTask;
  }

  async deleteTask(id: string): Promise<boolean> {
    // Check if task exists
    const existingTask = await this.getTask(id);
    if (!existingTask) {
      return false;
    }

    const now = new Date();

    // Soft delete in database
    await this.db.run(
      `UPDATE tasks SET is_deleted = 1, updated_at = ?, sync_status = ? WHERE id = ?`,
      [now.toISOString(), 'pending', id]
    );

    // Add to sync queue
    const deletedTask = { ...existingTask, is_deleted: true, updated_at: now, sync_status: 'pending' as const };
    await this.addToSyncQueue(id, 'delete', deletedTask);

    return true;
  }

  async getTask(id: string): Promise<Task | null> {
    const row = await this.db.get(
      `SELECT id, title, description, completed, created_at, updated_at, is_deleted, sync_status, server_id, last_synced_at
       FROM tasks WHERE id = ? AND is_deleted = 0`,
      [id]
    );

    if (!row) {
      return null;
    }

    return {
      id: row.id,
      title: row.title,
      description: row.description,
      completed: Boolean(row.completed),
      created_at: new Date(row.created_at),
      updated_at: new Date(row.updated_at),
      is_deleted: Boolean(row.is_deleted),
      sync_status: row.sync_status,
      server_id: row.server_id,
      last_synced_at: row.last_synced_at ? new Date(row.last_synced_at) : undefined
    };
  }

  async getAllTasks(): Promise<Task[]> {
    const rows = await this.db.all(
      `SELECT id, title, description, completed, created_at, updated_at, is_deleted, sync_status, server_id, last_synced_at
       FROM tasks WHERE is_deleted = 0 ORDER BY created_at DESC`
    );

    return rows.map(row => ({
      id: row.id,
      title: row.title,
      description: row.description,
      completed: Boolean(row.completed),
      created_at: new Date(row.created_at),
      updated_at: new Date(row.updated_at),
      is_deleted: Boolean(row.is_deleted),
      sync_status: row.sync_status,
      server_id: row.server_id,
      last_synced_at: row.last_synced_at ? new Date(row.last_synced_at) : undefined
    }));
  }

  async getTasksNeedingSync(): Promise<Task[]> {
    const rows = await this.db.all(
      `SELECT id, title, description, completed, created_at, updated_at, is_deleted, sync_status, server_id, last_synced_at
       FROM tasks WHERE sync_status IN ('pending', 'error') ORDER BY updated_at ASC`
    );

    return rows.map(row => ({
      id: row.id,
      title: row.title,
      description: row.description,
      completed: Boolean(row.completed),
      created_at: new Date(row.created_at),
      updated_at: new Date(row.updated_at),
      is_deleted: Boolean(row.is_deleted),
      sync_status: row.sync_status,
      server_id: row.server_id,
      last_synced_at: row.last_synced_at ? new Date(row.last_synced_at) : undefined
    }));
  }

  private async addToSyncQueue(taskId: string, operation: 'create' | 'update' | 'delete', data: Partial<Task>): Promise<void> {
    const id = uuidv4();
    await this.db.run(
      `INSERT INTO sync_queue (id, task_id, operation, data, created_at, retry_count)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, taskId, operation, JSON.stringify(data), new Date().toISOString(), 0]
    );
  }
}
