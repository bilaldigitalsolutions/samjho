// Admin content schema index.
// Central entry point for content types reused across the admin layer.

const { STATUS, STATUS_VALUES, isValidStatus } = require("./status");
const guide = require("./guide");
const question = require("./question");
const source = require("./source");

module.exports = {
  STATUS,
  STATUS_VALUES,
  isValidStatus,
  guide,
  question,
  source,
};
