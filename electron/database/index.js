/**
 * MLocker Desktop Database Subsystem Entrypoint
 */

const migrations = require("./migrations");
const migrator = require("./migrator");
const backup = require("./backup");
const lifecycle = require("./lifecycle");

module.exports = {
  ...migrations,
  ...migrator,
  ...backup,
  ...lifecycle,
};
