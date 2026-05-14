/**
 * Pagination middleware helper.
 * Reads ?page=1&limit=20 from query params.
 * Attaches req.pagination = { page, limit, offset }
 */
function paginate(req, res, next) {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
  const offset = (page - 1) * limit;
  req.pagination = { page, limit, offset };
  next();
}

/**
 * Build pagination response envelope.
 */
function paginationMeta(total, page, limit) {
  return {
    page,
    limit,
    total: parseInt(total),
    totalPages: Math.ceil(parseInt(total) / limit),
  };
}

module.exports = { paginate, paginationMeta };
