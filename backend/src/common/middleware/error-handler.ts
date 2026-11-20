import type { NextFunction, Request, Response } from 'express';
import mongoose from 'mongoose';
import type { Logger } from 'pino';
import { AppError } from '../errors/app-error.js';

interface ErrorBody {
  code: string;
  message: string;
  details?: { path: string; message: string }[];
  stack?: string;
}

interface HttpParserError {
  type?: string;
  status?: number;
}

function isMongoDuplicateKey(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 11000;
}

function classify(error: unknown): { status: number; body: ErrorBody } {
  if (error instanceof AppError) {
    return {
      status: error.statusCode,
      body: { code: error.code, message: error.message, ...(error.details ? { details: error.details } : {}) },
    };
  }
  const parserError = error as HttpParserError;
  if (parserError?.type === 'entity.parse.failed') {
    return { status: 400, body: { code: 'MALFORMED_JSON', message: 'The request body is not valid JSON' } };
  }
  if (parserError?.type === 'entity.too.large') {
    return { status: 413, body: { code: 'PAYLOAD_TOO_LARGE', message: 'The request body is too large' } };
  }
  if (error instanceof mongoose.Error.CastError) {
    return { status: 400, body: { code: 'INVALID_ID', message: 'An identifier in the request is not valid' } };
  }
  if (isMongoDuplicateKey(error)) {
    return { status: 409, body: { code: 'DUPLICATE', message: 'That record already exists' } };
  }
  return { status: 500, body: { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' } };
}

/** Converts any thrown error into the standard error envelope. Never leaks stacks outside development. */
export function createErrorHandler(logger: Logger, exposeStack: boolean) {
  return (error: unknown, _req: Request, res: Response, _next: NextFunction): void => {
    const { status, body } = classify(error);
    const requestId = res.locals.requestId ?? 'unknown';
    if (status >= 500) {
      logger.error({ err: error, requestId }, 'Unhandled error');
      if (exposeStack && error instanceof Error && error.stack) body.stack = error.stack;
    } else {
      logger.debug({ code: body.code, status, requestId }, 'Request rejected');
    }
    if (res.headersSent) return;
    res.status(status).json({ success: false, error: { ...body, requestId } });
  };
}

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({
    success: false,
    error: { code: 'ROUTE_NOT_FOUND', message: 'No such endpoint', requestId: res.locals.requestId },
  });
}
