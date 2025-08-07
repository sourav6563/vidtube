const asyncHandler = (fn) => {
  return async (req, res, next) => {
    try {
      await fn(req, res, next); // run the async function
    } catch (error) {
      next(error); // pass error to Express error handler
    }
  };
};

export { asyncHandler };
