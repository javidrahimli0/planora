import nodemailer from 'nodemailer';

interface WorkspaceInviteEmailInput {
  to: string;
  inviterName: string;
  workspaceName: string;
  appUrl: string;
  invitationId: string;
}

interface VerificationCodeEmailInput {
  to: string;
  code: string;
  expiresInMinutes: number;
}

interface PasswordResetEmailInput {
  to: string;
  resetLink: string;
  expiresInMinutes: number;
}

const smtpHost = process.env.SMTP_HOST;
const smtpPort = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 587;
const smtpUser = process.env.SMTP_USER;
const smtpPass = process.env.SMTP_PASS;
const inviteFrom = process.env.INVITE_FROM || 'Planora <no-reply@planora.local>';
const verificationFrom = process.env.VERIFICATION_FROM || inviteFrom;

function canSendEmail() {
  return Boolean(smtpHost && smtpUser && smtpPass);
}

export async function sendWorkspaceInviteEmail(input: WorkspaceInviteEmailInput): Promise<{ sent: boolean; reason?: string }> {
  if (!canSendEmail()) {
    return { sent: false, reason: 'SMTP is not configured.' };
  }

  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpPort === 465,
    auth: {
      user: smtpUser,
      pass: smtpPass,
    },
  });

  const inviteLink = `${input.appUrl.replace(/\/$/, '')}/workspaces?invite=${encodeURIComponent(input.invitationId)}`;

  await transporter.sendMail({
    from: inviteFrom,
    to: input.to,
    subject: `${input.inviterName} invited you to ${input.workspaceName} on Planora`,
    text: [
      `Hello,`,
      '',
      `${input.inviterName} invited you to join the workspace "${input.workspaceName}" on Planora.`,
      '',
      `Open this link to accept or decline:`,
      inviteLink,
      '',
      `If you don't have an account yet, register with this email first.`,
    ].join('\n'),
    html: `
      <p>Hello,</p>
      <p><strong>${input.inviterName}</strong> invited you to join the workspace <strong>${input.workspaceName}</strong> on Planora.</p>
      <p>
        <a href="${inviteLink}" style="display:inline-block;padding:10px 14px;border-radius:8px;background:#2563eb;color:#fff;text-decoration:none;">
          Open invitation
        </a>
      </p>
      <p>If you don't have an account yet, register with this email first.</p>
    `,
  });

  return { sent: true };
}

export async function sendVerificationCodeEmail(input: VerificationCodeEmailInput): Promise<{ sent: boolean; reason?: string }> {
  if (!canSendEmail()) {
    return { sent: false, reason: 'SMTP is not configured.' };
  }

  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpPort === 465,
    auth: {
      user: smtpUser,
      pass: smtpPass,
    },
  });

  await transporter.sendMail({
    from: verificationFrom,
    to: input.to,
    subject: 'Your Planora verification code',
    text: [
      'Welcome to Planora,',
      '',
      `Your verification code is: ${input.code}`,
      '',
      `This code expires in ${input.expiresInMinutes} minutes.`,
      '',
      'If you did not request this, you can ignore this email.',
    ].join('\n'),
    html: `
      <p>Welcome to Planora,</p>
      <p>Your verification code is:</p>
      <p style="font-size:24px;font-weight:700;letter-spacing:4px;margin:8px 0 12px;">${input.code}</p>
      <p>This code expires in <strong>${input.expiresInMinutes} minutes</strong>.</p>
      <p>If you did not request this, you can ignore this email.</p>
    `,
  });

  return { sent: true };
}

export async function sendPasswordResetEmail(input: PasswordResetEmailInput): Promise<{ sent: boolean; reason?: string }> {
  if (!canSendEmail()) {
    return { sent: false, reason: 'SMTP is not configured.' };
  }

  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpPort === 465,
    auth: {
      user: smtpUser,
      pass: smtpPass,
    },
  });

  await transporter.sendMail({
    from: verificationFrom,
    to: input.to,
    subject: 'Reset your Planora password',
    text: [
      'Hello,',
      '',
      'We received a request to reset your Planora password.',
      '',
      `Reset your password here: ${input.resetLink}`,
      '',
      `This link expires in ${input.expiresInMinutes} minutes.`,
      '',
      'If you did not request this, you can ignore this email.',
    ].join('\n'),
    html: `
      <p>Hello,</p>
      <p>We received a request to reset your Planora password.</p>
      <p>
        <a href="${input.resetLink}" style="display:inline-block;padding:10px 14px;border-radius:8px;background:#2563eb;color:#fff;text-decoration:none;">
          Reset password
        </a>
      </p>
      <p>This link expires in <strong>${input.expiresInMinutes} minutes</strong>.</p>
      <p>If you did not request this, you can ignore this email.</p>
    `,
  });

  return { sent: true };
}
