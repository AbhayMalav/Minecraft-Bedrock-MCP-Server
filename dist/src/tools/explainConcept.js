"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleExplainConcept = handleExplainConcept;
const db_js_1 = require("../db.js");
function handleExplainConcept(db, concept) {
    if (!concept || concept.trim().length === 0) {
        return JSON.stringify({ error: "Concept must not be empty." });
    }
    const results = (0, db_js_1.searchFts)(db, concept.trim(), 2);
    if (results.length === 0) {
        return JSON.stringify({
            message: `No documentation found for concept: "${concept}".`,
        });
    }
    return JSON.stringify(results.map((r) => ({
        title: r.title,
        url: r.url,
        label: r.label,
        explanation: r.content.slice(0, 1500),
    })), null, 2);
}
