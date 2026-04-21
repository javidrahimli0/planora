import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import {
	cancelInvitation,
	assignWorkspaceOwner,
	removeWorkspaceOwner,
	createWorkspaceMessage,
	createInvitation,
	createWorkspace,
	deleteWorkspace,
	getWorkspaceChatUnreadSummary,
	getMyInvitations,
	getWorkspaceUpcomingEvents,
	getInvitations,
	getWorkspaceMessages,
	getWorkspaceSharedNotes,
	getWorkspaceMembers,
	getWorkspaces,
	markWorkspaceChatsSeen,
	removeWorkspaceMember,
	leaveWorkspace,
	respondToInvitation,
	updateWorkspaceSettings,
} from '../controllers/workspace.controller';

const router = Router();

router.use(authenticate);

router.get('/', getWorkspaces);
router.get('/chat-unread-summary', getWorkspaceChatUnreadSummary);
router.post('/chats/mark-seen', markWorkspaceChatsSeen);
router.post('/', createWorkspace);
router.patch('/:id', updateWorkspaceSettings);
router.delete('/:id', deleteWorkspace);
router.get('/:id/messages', getWorkspaceMessages);
router.post('/:id/messages', createWorkspaceMessage);
router.get('/:id/upcoming-events', getWorkspaceUpcomingEvents);
router.get('/:id/shared-notes', getWorkspaceSharedNotes);
router.get('/invitations/mine', getMyInvitations);
router.delete('/invitations/:invitationId', cancelInvitation);
router.post('/invitations/:invitationId/respond', respondToInvitation);
router.post('/:id/members/:memberUserId/owner', assignWorkspaceOwner);
router.post('/:id/members/:memberUserId/member', removeWorkspaceOwner);
router.delete('/:id/members/:memberUserId', removeWorkspaceMember);
router.delete('/:id/leave', leaveWorkspace);
router.get('/:id/members', getWorkspaceMembers);
router.get('/:id/invitations', getInvitations);
router.post('/:id/invitations', createInvitation);

export default router;
