import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import {
  getNotifications,
  getNotificationPreferences,
  getUnreadCount,
  markAllNotificationsRead,
  markNotificationRead,
  updateNotificationPreference,
} from '../controllers/notification.controller';

const router = Router();

router.use(authenticate);

router.get('/', getNotifications);
router.get('/unread-count', getUnreadCount);
router.get('/preferences', getNotificationPreferences);
router.put('/preferences', updateNotificationPreference);
router.post('/mark-all-read', markAllNotificationsRead);
router.post('/:id/read', markNotificationRead);

export default router;
