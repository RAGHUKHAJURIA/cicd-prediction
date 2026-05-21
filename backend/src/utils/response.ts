import { Response } from "express";

interface Pagination {
  page: number;
  limit: number;
  total: number;
}

/** Standard success response wrapper. */
export function successResponse<T>(
  res: Response,
  data: T,
  statusCode = 200,
  message?: string
): Response {
  return res.status(statusCode).json({
    success: true,
    ...(message !== undefined ? { message } : {}),
    data,
    timestamp: new Date().toISOString(),
  });
}

/** Paginated list response wrapper. */
export function paginatedResponse<T>(
  res: Response,
  data: T[],
  pagination: Pagination
): Response {
  const totalPages = Math.ceil(pagination.total / pagination.limit);
  return res.status(200).json({
    success: true,
    data: {
      items: data,
      pagination: {
        page: pagination.page,
        limit: pagination.limit,
        total: pagination.total,
        totalPages,
        hasNext: pagination.page * pagination.limit < pagination.total,
        hasPrev: pagination.page > 1,
      },
    },
    timestamp: new Date().toISOString(),
  });
}
