export class AuthExpiredError extends Error {
  constructor(accountLabel: string, cause?: unknown) {
    const causeMsg = cause instanceof Error ? cause.message : cause ? String(cause) : '';
    super(
      `Acesso inválido ou expirado para "${accountLabel}"${causeMsg ? ` — ${causeMsg}` : ''}`,
    );
    this.name = 'AuthExpiredError';
    this.cause = cause;
  }
}

export class InsufficientSpaceError extends Error {
  constructor(requiredBytes: number) {
    super(`No account has enough free space for ${requiredBytes} bytes`);
    this.name = 'InsufficientSpaceError';
  }
}
