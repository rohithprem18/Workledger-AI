/**
 * Typed failures the API knows how to answer with.
 *
 * Anything thrown that is not an `AppError` is treated as a defect: it is
 * logged in full and answered with a generic 500, because an unexpected error's
 * message is as likely to leak internals as to help the caller.
 */
export class AppError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

/** The caller asked for something that does not exist. */
export class NotFoundError extends AppError {
  constructor(entity: string, id?: string) {
    super(id ? `${entity} not found: ${id}` : `${entity} not found`, 404, 'NOT_FOUND');
  }
}

/**
 * The request was well-formed but violates a domain rule — billing unapproved
 * hours, editing an approved worklog, double-booking a contractor. These are
 * expected outcomes and their messages are written to be shown to a user.
 */
export class BusinessRuleError extends AppError {
  constructor(message: string) {
    super(message, 409, 'BUSINESS_RULE_VIOLATION');
  }
}

/** The request body or query failed validation. */
export class ValidationError extends AppError {
  constructor(
    message: string,
    readonly details?: unknown,
  ) {
    super(message, 400, 'VALIDATION_FAILED');
  }
}

/** No credentials, or credentials that are not valid. */
export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

/** Authenticated, but lacking the permission this endpoint requires. */
export class ForbiddenError extends AppError {
  constructor(permission?: string) {
    super(
      permission ? `This action requires the ${permission} permission` : 'Access denied',
      403,
      'FORBIDDEN',
    );
  }
}

/** Too many attempts; used by the login rate limiter. */
export class RateLimitError extends AppError {
  constructor(message = 'Too many attempts. Try again shortly.') {
    super(message, 429, 'RATE_LIMITED');
  }
}
