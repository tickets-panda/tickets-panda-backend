export const success = (res, data = null, message = 'Success', statusCode = 200) =>
  res.status(statusCode).json({ success: true, message, data });

export const created = (res, data = null, message = 'Created successfully') =>
  success(res, data, message, 201);

export const paginated = (res, rows, pagination, message = 'Success') =>
  res.status(200).json({ success: true, message, data: { rows, pagination } });

export const failure = (res, message = 'Something went wrong', statusCode = 500, errors = null) =>
  res.status(statusCode).json({ success: false, message, errors });

export const parsePagination = (query) => {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
  return { page, limit, offset: (page - 1) * limit };
};

export const buildPagination = (total, page, limit) => ({
  total,
  page,
  limit,
  totalPages: Math.max(1, Math.ceil(total / limit)),
});

export default { success, created, paginated, failure, parsePagination, buildPagination };
