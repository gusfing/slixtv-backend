const { handleStandaloneRequest } = require('./standalone_router');

module.exports = async (req, res) => {
  // If request has a body stream, buffer it for handlers
  if (['POST', 'PUT', 'PATCH'].includes(req.method) && !req.body) {
    const buffers = [];
    for await (const chunk of req) {
      buffers.push(chunk);
    }
    const data = Buffer.concat(buffers).toString();
    try {
      req.body = JSON.parse(data);
    } catch (e) {
      req.body = data;
    }
  }

  // Handle request autonomously with SlixTV database
  const handled = handleStandaloneRequest(req, res);
  if (!handled) {
    res.status(404).json({
      success: false,
      message: "Not found on SlixTV server"
    });
  }
};
