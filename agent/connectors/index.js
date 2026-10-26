"use strict";
// source.type: sqlite | mssql | access | xlsx | csv
function make(type, conf) {
  switch (type) {
    case "sqlite": return require("./sqlite").create(conf);
    case "xlsx": return require("./xlsx").create(conf);
    case "csv": return require("./csv").create(conf);
    case "mssql": case "access": return require("./psdb").create(type, conf);
    default: throw new Error("Unknown database type: " + type);
  }
}
module.exports = { make };
