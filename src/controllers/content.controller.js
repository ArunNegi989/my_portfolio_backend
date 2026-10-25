// Generic request handlers built on the collection/singleton services.

const ApiError = require("../utils/ApiError");

/** Handlers for a singleton (profile, home, settings). */
function singletonHandlers(service, notSeededMessage) {
  return {
    async get(_req, res) {
      const data = await service.get();
      if (!data) throw ApiError.notFound(notSeededMessage);
      res.json({ data });
    },
    async put(req, res) {
      res.json({ data: await service.put(req.valid.body, req.auth.user) });
    },
  };
}

/** Admin CRUD handlers for a collection keyed by the frontend `id`. */
function collectionHandlers(service) {
  return {
    async create(req, res) {
      res.status(201).json({ data: await service.create(req.valid.body, req.auth.user) });
    },
    async update(req, res) {
      res.json({ data: await service.update(req.valid.params.id, req.valid.body, req.auth.user) });
    },
    async remove(req, res) {
      await service.remove(req.valid.params.id, req.auth.user);
      res.status(204).end();
    },
    async replaceAll(req, res) {
      res.json({ data: await service.replaceAll(req.valid.body.items, req.auth.user) });
    },
  };
}

module.exports = { singletonHandlers, collectionHandlers };
