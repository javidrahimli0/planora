import { Router } from 'express';
import multer from 'multer';
import { authenticate } from '../middleware/auth.middleware';
import {
  getEvents,
  getEvent,
  getEventParticipants,
  createEvent,
  updateEventParticipation,
  updateEvent,
  deleteEvent,
} from '../controllers/event.controller';
import { exportICS, importICS } from '../controllers/ics.controller';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// All routes are protected
router.use(authenticate);

router.get('/',        getEvents);
router.get('/export/ics', exportICS);
router.get('/:id',     getEvent);
router.get('/:id/participants', getEventParticipants);
router.post('/',       createEvent);
router.put('/:id',     updateEvent);
router.patch('/:id/participation', updateEventParticipation);
router.delete('/:id',  deleteEvent);
router.post('/import/ics', upload.single('file'), importICS);

export default router;
