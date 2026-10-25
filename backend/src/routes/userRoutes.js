/**
 * Routes for the logged-in user's own account, mounted at /api/v1/users.
 * Every route: requireAuth -> csrfProtection (all are unsafe methods) -> validate -> controller.
 * CSRF runs before validation so a forged request learns nothing from validation messages.
 */
import { Router } from 'express';
import * as userController from '../controllers/userController.js';
import { requireAuth } from '../middleware/auth.js';
import { csrfProtection } from '../middleware/csrf.js';
import { validate } from '../middleware/validate.js';
import { changePasswordBody, deleteMeBody, updateMeBody } from '../validators/userValidators.js';

export const userRouter = Router();

userRouter.use(requireAuth, csrfProtection);

userRouter.patch('/me', validate({ body: updateMeBody }), userController.updateMe);
userRouter.patch(
  '/me/password',
  validate({ body: changePasswordBody }),
  userController.changePassword,
);
userRouter.delete('/me', validate({ body: deleteMeBody }), userController.deleteMe);
