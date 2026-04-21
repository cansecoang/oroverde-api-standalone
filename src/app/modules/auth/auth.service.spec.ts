import { BadRequestException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { TenantStatus } from '../../common/enums/tenant-status.enum';
import * as bcrypt from 'bcrypt';

// ── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('bcrypt');
const bcryptMock = bcrypt as jest.Mocked<typeof bcrypt>;

// ── Factories ────────────────────────────────────────────────────────────────

function makeRepoMock() {
  const qb = {
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    getOne: jest.fn(),
  };
  return {
    findOne: jest.fn(),
    find: jest.fn(),
    save: jest.fn().mockImplementation((entity) => Promise.resolve(entity)),
    createQueryBuilder: jest.fn().mockReturnValue(qb),
    __qb: qb, // expose for assertions
  };
}

function makeUsersServiceMock() {
  return { findByEmail: jest.fn() };
}

function makeMailerMock() {
  return { sendMail: jest.fn().mockResolvedValue(true) };
}

function makeSessionServiceMock() {
  return { purgeUserSessions: jest.fn().mockResolvedValue(1) };
}

// ── Fixtures ─────────────────────────────────────────────────────────────────

const USER_ID = '11111111-1111-1111-1111-111111111111';

const ACTIVE_USER = {
  id: USER_ID,
  email: 'test@example.com',
  firstName: 'Test',
  lastName: 'User',
  isActive: true,
  password_hash: '$2b$10$hashedpassword',
  mustChangePassword: false,
  globalRole: 'user',
  organizationId: 'org-1',
  activationToken: null,
  activationTokenExpiry: null,
  resetCode: null,
  resetCodeExpiry: null,
  resetToken: null,
  resetTokenExpiry: null,
};

const INACTIVE_USER = {
  ...ACTIVE_USER,
  id: '22222222-2222-2222-2222-222222222222',
  isActive: false,
  activationToken: 'valid-token',
  activationTokenExpiry: new Date(Date.now() + 24 * 60 * 60 * 1000), // +24h
};

const TENANT_ACTIVE = {
  id: 'tenant-1',
  name: 'Workspace One',
  slug: 'workspace-one',
  status: TenantStatus.ACTIVE,
  logoUrl: null,
  location: null,
  description: null,
  createdAt: new Date('2026-01-01'),
};

const TENANT_SUSPENDED = {
  ...TENANT_ACTIVE,
  id: 'tenant-2',
  name: 'Workspace Two',
  slug: 'workspace-two',
  status: TenantStatus.SUSPENDED,
};

// ── Test Suite ────────────────────────────────────────────────────────────────

describe('AuthService', () => {
  let service: AuthService;
  let usersService: ReturnType<typeof makeUsersServiceMock>;
  let usersRepo: ReturnType<typeof makeRepoMock>;
  let tenantMemberRepo: ReturnType<typeof makeRepoMock>;
  let tenantRepo: ReturnType<typeof makeRepoMock>;
  let mailer: ReturnType<typeof makeMailerMock>;
  let sessionService: ReturnType<typeof makeSessionServiceMock>;

  beforeEach(() => {
    usersService = makeUsersServiceMock();
    usersRepo = makeRepoMock();
    tenantMemberRepo = makeRepoMock();
    tenantRepo = makeRepoMock();
    mailer = makeMailerMock();
    sessionService = makeSessionServiceMock();

    service = new AuthService(
      usersService as any,
      usersRepo as any,
      tenantMemberRepo as any,
      tenantRepo as any,
      mailer as any,
      sessionService as any,   // DT-005
    );
  });

  afterEach(() => jest.clearAllMocks());

  // ═══════════════════════════════════════════════════════════════════════════
  // activateAccount
  // ═══════════════════════════════════════════════════════════════════════════

  describe('activateAccount', () => {
    it('should activate a valid, non-expired token', async () => {
      usersRepo.findOne.mockResolvedValue({ ...INACTIVE_USER });

      const result = await service.activateAccount('valid-token');

      expect(result).toEqual({ message: 'Account activated successfully.' });
      expect(usersRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          isActive: true,
          activationToken: null,
          activationTokenExpiry: null,
        }),
      );
    });

    it('should throw BadRequestException for unknown token', async () => {
      usersRepo.findOne.mockResolvedValue(null);

      await expect(service.activateAccount('invalid'))
        .rejects.toThrow(BadRequestException);
      expect(usersRepo.save).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException for expired token', async () => {
      const expired = {
        ...INACTIVE_USER,
        activationTokenExpiry: new Date(Date.now() - 1000), // past
      };
      usersRepo.findOne.mockResolvedValue(expired);

      await expect(service.activateAccount('valid-token'))
        .rejects.toThrow('This activation link has expired');
      expect(usersRepo.save).not.toHaveBeenCalled();
    });

    it('should activate even if activationTokenExpiry is null (legacy tokens)', async () => {
      const legacy = {
        ...INACTIVE_USER,
        activationTokenExpiry: null,
      };
      usersRepo.findOne.mockResolvedValue(legacy);

      const result = await service.activateAccount('valid-token');
      expect(result.message).toBe('Account activated successfully.');
      expect(usersRepo.save).toHaveBeenCalled();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // validateUser
  // ═══════════════════════════════════════════════════════════════════════════

  describe('validateUser', () => {
    it('should return user without password_hash on valid credentials', async () => {
      usersService.findByEmail.mockResolvedValue({ ...ACTIVE_USER });
      bcryptMock.compare.mockResolvedValue(true as never);

      const result = await service.validateUser('test@example.com', 'correct');

      expect(result).toBeDefined();
      expect(result.email).toBe('test@example.com');
      expect(result).not.toHaveProperty('password_hash');
    });

    it('should return null if user not found', async () => {
      usersService.findByEmail.mockResolvedValue(null);

      const result = await service.validateUser('none@example.com', 'pass');
      expect(result).toBeNull();
    });

    it('should return null if password_hash is missing', async () => {
      usersService.findByEmail.mockResolvedValue({ ...ACTIVE_USER, password_hash: null });

      const result = await service.validateUser('test@example.com', 'pass');
      expect(result).toBeNull();
    });

    it('should return null on incorrect password', async () => {
      usersService.findByEmail.mockResolvedValue({ ...ACTIVE_USER });
      bcryptMock.compare.mockResolvedValue(false as never);

      const result = await service.validateUser('test@example.com', 'wrong');
      expect(result).toBeNull();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // changePassword
  // ═══════════════════════════════════════════════════════════════════════════

  describe('changePassword', () => {
    it('should change password and clear mustChangePassword flag', async () => {
      usersRepo.findOne.mockResolvedValue({
        id: USER_ID,
        password_hash: '$2b$10$old',
        mustChangePassword: true,
      });
      bcryptMock.compare.mockResolvedValue(true as never);
      bcryptMock.genSalt.mockResolvedValue('salt' as never);
      bcryptMock.hash.mockResolvedValue('$2b$10$newhash' as never);

      const result = await service.changePassword(USER_ID, 'oldpass', 'newpassword123');

      expect(result).toEqual({ message: 'Password updated successfully' });
      expect(usersRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          password_hash: '$2b$10$newhash',
          mustChangePassword: false,
        }),
      );
    });

    it('should throw if user not found', async () => {
      usersRepo.findOne.mockResolvedValue(null);

      await expect(service.changePassword(USER_ID, 'old', 'newpass123'))
        .rejects.toThrow('User not found');
    });

    it('should throw if current password is incorrect', async () => {
      usersRepo.findOne.mockResolvedValue({ id: USER_ID, password_hash: '$hash' });
      bcryptMock.compare.mockResolvedValue(false as never);

      await expect(service.changePassword(USER_ID, 'wrong', 'newpass123'))
        .rejects.toThrow('Current password is incorrect');
    });

    it('should throw if new password is shorter than 8 characters', async () => {
      usersRepo.findOne.mockResolvedValue({ id: USER_ID, password_hash: '$hash' });
      bcryptMock.compare.mockResolvedValue(true as never);

      await expect(service.changePassword(USER_ID, 'old', 'short'))
        .rejects.toThrow('at least 8 characters');
    });

    // DT-005: Session invalidation on password change
    it('should call purgeUserSessions after successful password change', async () => {
      usersRepo.findOne.mockResolvedValue({
        id: USER_ID,
        password_hash: '$2b$10$old',
        mustChangePassword: false,
      });
      bcryptMock.compare.mockResolvedValue(true as never);
      bcryptMock.genSalt.mockResolvedValue('salt' as never);
      bcryptMock.hash.mockResolvedValue('$2b$10$newhash' as never);

      await service.changePassword(USER_ID, 'oldpass', 'newpassword123');

      expect(sessionService.purgeUserSessions).toHaveBeenCalledTimes(1);
      expect(sessionService.purgeUserSessions).toHaveBeenCalledWith(USER_ID);
    });

    it('should not throw if purgeUserSessions fails (best-effort)', async () => {
      usersRepo.findOne.mockResolvedValue({
        id: USER_ID,
        password_hash: '$2b$10$old',
        mustChangePassword: false,
      });
      bcryptMock.compare.mockResolvedValue(true as never);
      bcryptMock.genSalt.mockResolvedValue('salt' as never);
      bcryptMock.hash.mockResolvedValue('$2b$10$newhash' as never);
      sessionService.purgeUserSessions.mockRejectedValue(new Error('Redis unavailable'));

      await expect(
        service.changePassword(USER_ID, 'oldpass', 'newpassword123'),
      ).resolves.toEqual({ message: 'Password updated successfully' });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // forgotPassword
  // ═══════════════════════════════════════════════════════════════════════════

  describe('forgotPassword', () => {
    it('should generate code, save hashed code, and send email for existing user', async () => {
      usersRepo.findOne.mockResolvedValue({ ...ACTIVE_USER });
      bcryptMock.hash.mockResolvedValue('$hashed_code' as never);

      const result = await service.forgotPassword('test@example.com');

      expect(result.message).toContain('reset code has been sent');
      expect(usersRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          resetCode: '$hashed_code',
          resetToken: null,
          resetTokenExpiry: null,
        }),
      );
      expect(mailer.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'test@example.com',
          subject: expect.stringContaining('Password Reset'),
        }),
      );
    });

    it('should set resetCodeExpiry to ~15 minutes from now', async () => {
      usersRepo.findOne.mockResolvedValue({ ...ACTIVE_USER });
      bcryptMock.hash.mockResolvedValue('$hashed_code' as never);

      const before = Date.now();
      await service.forgotPassword('test@example.com');

      const savedUser = usersRepo.save.mock.calls[0][0];
      const expiryMs = savedUser.resetCodeExpiry.getTime();
      // should be ~15 minutes from now (allow 5s tolerance)
      expect(expiryMs).toBeGreaterThanOrEqual(before + 14 * 60 * 1000);
      expect(expiryMs).toBeLessThanOrEqual(before + 16 * 60 * 1000);
    });

    it('should return success even for non-existing email (prevent enumeration)', async () => {
      usersRepo.findOne.mockResolvedValue(null);

      const result = await service.forgotPassword('noone@example.com');

      expect(result.message).toContain('reset code has been sent');
      expect(usersRepo.save).not.toHaveBeenCalled();
      expect(mailer.sendMail).not.toHaveBeenCalled();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // verifyResetCode
  // ═══════════════════════════════════════════════════════════════════════════

  describe('verifyResetCode', () => {
    it('should return a resetToken for a valid code', async () => {
      usersRepo.__qb.getOne.mockResolvedValue({
        ...ACTIVE_USER,
        resetCode: '$hashed_code',
        resetCodeExpiry: new Date(Date.now() + 10 * 60 * 1000), // future
      });
      bcryptMock.compare.mockResolvedValue(true as never);

      const result = await service.verifyResetCode('test@example.com', '123456');

      expect(result).toHaveProperty('resetToken');
      expect(typeof result.resetToken).toBe('string');
      expect(usersRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          resetCode: null,
          resetCodeExpiry: null,
          resetToken: expect.any(String),
        }),
      );
    });

    it('should set resetTokenExpiry to ~10 minutes from now', async () => {
      usersRepo.__qb.getOne.mockResolvedValue({
        ...ACTIVE_USER,
        resetCode: '$hashed_code',
        resetCodeExpiry: new Date(Date.now() + 10 * 60 * 1000),
      });
      bcryptMock.compare.mockResolvedValue(true as never);

      const before = Date.now();
      await service.verifyResetCode('test@example.com', '123456');

      const saved = usersRepo.save.mock.calls[0][0];
      const expiryMs = saved.resetTokenExpiry.getTime();
      expect(expiryMs).toBeGreaterThanOrEqual(before + 9 * 60 * 1000);
      expect(expiryMs).toBeLessThanOrEqual(before + 11 * 60 * 1000);
    });

    it('should throw if user not found', async () => {
      usersRepo.__qb.getOne.mockResolvedValue(null);

      await expect(service.verifyResetCode('none@example.com', '123456'))
        .rejects.toThrow('Invalid or expired reset code');
    });

    it('should throw if resetCode is null', async () => {
      usersRepo.__qb.getOne.mockResolvedValue({ ...ACTIVE_USER, resetCode: null });

      await expect(service.verifyResetCode('test@example.com', '123456'))
        .rejects.toThrow('Invalid or expired reset code');
    });

    it('should throw if code is expired', async () => {
      usersRepo.__qb.getOne.mockResolvedValue({
        ...ACTIVE_USER,
        resetCode: '$hashed_code',
        resetCodeExpiry: new Date(Date.now() - 1000), // past
      });

      await expect(service.verifyResetCode('test@example.com', '123456'))
        .rejects.toThrow('Reset code has expired');
    });

    it('should throw if code does not match', async () => {
      usersRepo.__qb.getOne.mockResolvedValue({
        ...ACTIVE_USER,
        resetCode: '$hashed_code',
        resetCodeExpiry: new Date(Date.now() + 10 * 60 * 1000),
      });
      bcryptMock.compare.mockResolvedValue(false as never);

      await expect(service.verifyResetCode('test@example.com', '000000'))
        .rejects.toThrow('Invalid or expired reset code');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // resetPassword
  // ═══════════════════════════════════════════════════════════════════════════

  describe('resetPassword', () => {
    it('should reset password and clear reset fields', async () => {
      usersRepo.__qb.getOne.mockResolvedValue({
        ...ACTIVE_USER,
        resetToken: 'valid-reset-token',
        resetTokenExpiry: new Date(Date.now() + 5 * 60 * 1000),
        mustChangePassword: true,
      });
      bcryptMock.genSalt.mockResolvedValue('salt' as never);
      bcryptMock.hash.mockResolvedValue('$newHash' as never);

      const result = await service.resetPassword('valid-reset-token', 'newpassword123');

      expect(result).toEqual({ message: 'Password has been reset successfully.' });
      expect(usersRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          password_hash: '$newHash',
          resetToken: null,
          resetTokenExpiry: null,
          mustChangePassword: false,
        }),
      );
    });

    it('should throw if reset token not found', async () => {
      usersRepo.__qb.getOne.mockResolvedValue(null);

      await expect(service.resetPassword('bad-token', 'newpass123'))
        .rejects.toThrow('Invalid or expired reset token');
    });

    it('should throw if reset token is expired', async () => {
      usersRepo.__qb.getOne.mockResolvedValue({
        ...ACTIVE_USER,
        resetToken: 'expired-token',
        resetTokenExpiry: new Date(Date.now() - 1000),
      });

      await expect(service.resetPassword('expired-token', 'newpass123'))
        .rejects.toThrow('Reset token has expired');
    });

    it('should throw if new password is too short', async () => {
      usersRepo.__qb.getOne.mockResolvedValue({
        ...ACTIVE_USER,
        resetToken: 'valid-token',
        resetTokenExpiry: new Date(Date.now() + 5 * 60 * 1000),
      });

      await expect(service.resetPassword('valid-token', 'short'))
        .rejects.toThrow('at least 8 characters');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // findUserById
  // ═══════════════════════════════════════════════════════════════════════════

  describe('findUserById', () => {
    it('should return user when found', async () => {
      usersRepo.findOne.mockResolvedValue({ ...ACTIVE_USER });

      const result = await service.findUserById(USER_ID);
      expect(result).toBeDefined();
      expect(result.id).toBe(USER_ID);
      expect(usersRepo.findOne).toHaveBeenCalledWith({ where: { id: USER_ID } });
    });

    it('should return null when user not found', async () => {
      usersRepo.findOne.mockResolvedValue(null);

      const result = await service.findUserById('nonexistent');
      expect(result).toBeNull();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // getMyWorkspaces
  // ═══════════════════════════════════════════════════════════════════════════

  describe('getMyWorkspaces', () => {
    it('should return all ACTIVE tenants for super_admin', async () => {
      tenantRepo.find.mockResolvedValue([TENANT_ACTIVE]);

      const result = await service.getMyWorkspaces(USER_ID, 'super_admin');

      expect(result).toHaveLength(1);
      expect(result[0].slug).toBe('workspace-one');
      expect(tenantRepo.find).toHaveBeenCalledWith({
        where: { status: TenantStatus.ACTIVE },
        order: { createdAt: 'ASC' },
      });
      // should NOT touch tenantMemberRepo
      expect(tenantMemberRepo.find).not.toHaveBeenCalled();
    });

    it('should return only member tenants for regular user', async () => {
      tenantMemberRepo.find.mockResolvedValue([
        { userId: USER_ID, tenant: TENANT_ACTIVE },
        { userId: USER_ID, tenant: TENANT_SUSPENDED },
      ]);

      const result = await service.getMyWorkspaces(USER_ID, 'user');

      expect(result).toHaveLength(1); // only ACTIVE tenant
      expect(result[0].slug).toBe('workspace-one');
      expect(tenantMemberRepo.find).toHaveBeenCalledWith({
        where: { userId: USER_ID },
        relations: ['tenant'],
      });
    });

    it('should return empty array when user has no memberships', async () => {
      tenantMemberRepo.find.mockResolvedValue([]);

      const result = await service.getMyWorkspaces(USER_ID, 'user');
      expect(result).toHaveLength(0);
    });

    it('should filter out memberships with null tenant (orphaned records)', async () => {
      tenantMemberRepo.find.mockResolvedValue([
        { userId: USER_ID, tenant: null },
        { userId: USER_ID, tenant: TENANT_ACTIVE },
      ]);

      const result = await service.getMyWorkspaces(USER_ID, 'user');
      expect(result).toHaveLength(1);
    });

    it('should map tenant fields to WorkspaceDto shape', async () => {
      tenantRepo.find.mockResolvedValue([TENANT_ACTIVE]);

      const result = await service.getMyWorkspaces(USER_ID, 'super_admin');

      expect(result[0]).toEqual({
        id: TENANT_ACTIVE.id,
        name: TENANT_ACTIVE.name,
        slug: TENANT_ACTIVE.slug,
        status: TENANT_ACTIVE.status,
        logoUrl: TENANT_ACTIVE.logoUrl,
        location: TENANT_ACTIVE.location,
        description: TENANT_ACTIVE.description,
        createdAt: TENANT_ACTIVE.createdAt,
      });
    });
  });
});
