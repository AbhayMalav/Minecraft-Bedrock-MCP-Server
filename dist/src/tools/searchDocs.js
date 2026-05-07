"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleSearchDocs = handleSearchDocs;
const db_js_1 = require("../db.js");
function handleSearchDocs(db, query, limit = 5) {
    if (!query || query.trim().length === 0) {
        return JSON.stringify({ error: "Query must not be empty." });
    }
    const results = (0, db_js_1.searchFts)(db, query.trim(), limit);
    if (results.length === 0) {
        return JSON.stringify({ message: "No results found.", query });
    }
    return JSON.stringify(results.map((r) => ({
        title: r.title,
        url: r.url,
        label: r.label,
        excerpt: r.content.slice(0, 800),
    })), null, 2);
}
