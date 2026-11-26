import { AppError } from '../../data/errors';

/** One error shape for every failed request, whatever went wrong. */
export class ApiError extends Error {
  constructor({ status = 0, code = 'UNKNOWN', message, details = [], requestId = null }) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.requestId = requestId;
  }

  get isNetworkError() {
    return this.status === 0;
  }

  /** Field-level messages keyed by the last path segment, for forms. */
  fieldErrors() {
    return Object.fromEntries(this.details.map((detail) => [detail.path.split('.').pop(), detail.message]));
  }
}

/**
 * Turns anything thrown into one error screens can show. Planner errors from this device
 * (AppError) already have the same shape and pass through unchanged.
 */
export function toApiError(error) {
  if (error instanceof ApiError || error instanceof AppError) return error;
  const response = error?.response;
  if (!response) {
    const timedOut = error?.code === 'ECONNABORTED';
    return new ApiError({
      code: timedOut ? 'TIMEOUT' : 'NETWORK_ERROR',
      message: timedOut ? 'The server took too long to answer. Try again.' : 'Can’t reach the server. Check your connection and try again.',
    });
  }
  const body = response.data?.error;
  return new ApiError({
    status: response.status,
    code: body?.code ?? 'HTTP_ERROR',
    message: body?.message ?? 'Something went wrong. Please try again.',
    details: body?.details ?? [],
    requestId: body?.requestId ?? null,
  });
}
