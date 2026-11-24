/**
 * One error shape for every failed planner operation. Screens show `message`, forms read
 * `fieldErrors()`, and `code` says what went wrong (same codes the old server used).
 */
export class AppError extends Error {
  constructor({ status = 400, code = 'UNKNOWN', message, details = [] }) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  /** Everything runs on the device, so nothing can fail for lack of a connection. */
  get isNetworkError() {
    return false;
  }

  /** Field-level messages keyed by field name, for forms. */
  fieldErrors() {
    return Object.fromEntries(this.details.map((detail) => [detail.path.split('.').pop(), detail.message]));
  }
}

export const badRequest = (message, code = 'BAD_REQUEST', details) => new AppError({ status: 400, code, message, details });
export const notFound = (message, code = 'NOT_FOUND') => new AppError({ status: 404, code, message });
export const conflict = (message, code = 'CONFLICT') => new AppError({ status: 409, code, message });
export const unprocessable = (message, code = 'UNPROCESSABLE') => new AppError({ status: 422, code, message });

/** A validation problem tied to one form field. */
export const invalidField = (field, message) => badRequest(message, 'VALIDATION_ERROR', [{ path: field, message }]);

export function toAppError(error) {
  if (error instanceof AppError) return error;
  if (__DEV__) console.error(error);
  return new AppError({ status: 500, code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' });
}
