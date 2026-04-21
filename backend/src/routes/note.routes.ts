import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import {
	createNote,
	deleteNote,
	getNote,
	getNotes,
	getNoteShares,
	shareNoteToWorkspace,
	unshareNoteFromWorkspace,
	updateNote,
} from '../controllers/note.controller';

const router = Router();

router.use(authenticate);

router.get('/', getNotes);
router.get('/:id/shares', getNoteShares);
router.post('/:id/shares', shareNoteToWorkspace);
router.delete('/:id/shares/:workspaceId', unshareNoteFromWorkspace);
router.get('/:id', getNote);
router.post('/', createNote);
router.put('/:id', updateNote);
router.delete('/:id', deleteNote);

export default router;
