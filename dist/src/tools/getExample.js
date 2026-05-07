"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleGetExample = handleGetExample;
const db_js_1 = require("../db.js");
function extractCodeBlocks(content) {
    const regex = /```[\s\S]*?```/g;
    const matches = content.match(regex) || [];
    return matches.slice(0, 3);
}
function handleGetExample(db, topic) {
    if (!topic || topic.trim().length === 0) {
        return JSON.stringify({ error: "Topic must not be empty." });
    }
    const results = (0, db_js_1.searchExamples)(db, topic.trim(), 3);
    if (results.length === 0) {
        return JSON.stringify({
            message: "No code examples found for this topic.",
            topic,
        });
    }
    const output = results.map((r) => ({
        title: r.title,
        url: r.url,
        codeBlocks: extractCodeBlocks(r.content),
    }));
    return JSON.stringify(output, null, 2);
}
