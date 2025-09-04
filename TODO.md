# Backend Interview Challenge - Implementation Plan

## Overview
Implement a sync-enabled task management API with offline functionality, conflict resolution, and robust error handling.

## Implementation Steps

### 1. Task Service Implementation (src/services/taskService.ts)
- [x] Implement `createTask` method
  - Generate UUID for task
  - Set default values (completed: false, is_deleted: false)
  - Set sync_status to 'pending'
  - Insert into database
  - Add to sync queue
- [x] Implement `updateTask` method
  - Check if task exists
  - Update task in database
  - Update updated_at timestamp
  - Set sync_status to 'pending'
  - Add to sync queue
- [x] Implement `deleteTask` method
  - Check if task exists
  - Set is_deleted to true
  - Update updated_at timestamp
  - Set sync_status to 'pending'
  - Add to sync queue
- [x] Implement `getTask` method
  - Query database for task by id
  - Return null if not found or is_deleted is true
- [x] Implement `getAllTasks` method
  - Query database for all tasks where is_deleted = false
  - Return array of tasks
- [x] Implement `getTasksNeedingSync` method
  - Get all tasks with sync_status = 'pending' or 'error'

### 2. Sync Service Implementation (src/services/syncService.ts)
- [x] Implement `sync` method
  - Get all items from sync queue
  - Group items by batch (use SYNC_BATCH_SIZE from env)
  - Process each batch
  - Handle success/failure for each item
  - Update sync status in database
  - Return sync result summary
- [x] Implement `addToSyncQueue` method
  - Create sync queue item
  - Store serialized task data
  - Insert into sync_queue table
- [x] Implement `processBatch` method
  - Prepare batch request
  - Send to server
  - Handle response
  - Apply conflict resolution if needed
- [x] Implement `resolveConflict` method
  - Compare updated_at timestamps
  - Return the more recent version
  - Log conflict resolution decision
- [x] Implement `updateSyncStatus` method
  - Update sync_status field
  - Update server_id if provided
  - Update last_synced_at timestamp
  - Remove from sync queue if successful
- [x] Implement `handleSyncError` method
  - Increment retry count
  - Store error message
  - If retry count exceeds limit, mark as permanent failure

### 3. Task Routes Implementation (src/routes/tasks.ts)
- [x] Implement POST /tasks endpoint
  - Validate request body (title required)
  - Call taskService.createTask()
  - Return 201 with created task
- [x] Implement PUT /tasks/:id endpoint
  - Validate request body
  - Call taskService.updateTask()
  - Handle not found case (404)
  - Return updated task
- [x] Implement DELETE /tasks/:id endpoint
  - Call taskService.deleteTask()
  - Handle not found case (404)
  - Return 204 No Content

### 4. Sync Routes Implementation (src/routes/sync.ts)
- [x] Implement POST /sync endpoint
  - Check connectivity first
  - Call syncService.sync()
  - Return sync result
- [x] Implement GET /status endpoint
  - Get pending sync count
  - Get last sync timestamp
  - Check connectivity
  - Return status summary
- [x] Implement POST /batch endpoint
  - Handle batch sync requests from clients
  - Process items and return results

### 5. Testing and Validation
- [x] Run tests (`npm test`)
- [x] Fix any failing tests
- [ ] Run linting (`npm run lint`)
- [ ] Fix any linting issues
- [ ] Run typecheck (`npm run typecheck`)
- [ ] Fix any TypeScript errors

### 6. Documentation and Submission
- [ ] Update README with implementation approach
- [ ] Document assumptions made
- [ ] Create new branch for submission
- [ ] Push changes to branch
- [ ] Create pull request
- [ ] Invite PearlThoughtsHR to repository

### 7. Deployment Preparation
- [ ] Prepare deployment instructions
- [ ] Consider cloud deployment options
- [ ] Prepare screencast explanation

## Notes
- Work efficiently and focus on core functionality
- Implement robust error handling
- Follow existing code patterns and conventions
- Test thoroughly before submission
