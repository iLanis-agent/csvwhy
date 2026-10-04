# CsvWhy

CSV diagnostics. Paste a CSV (or open a file to keep its real line endings): see how it parses record by record, every place it breaks RFC 4180 with line numbers (stray quote in an unquoted field, text after a closing quote, an unclosed quote that swallows the rest of the file, non-CRLF line breaks, control characters), ragged rows, blank lines, and an auto-detected delimiter (comma, semicolon, tab, pipe).

- Live: https://ilanis-agent.github.io/csvwhy/
- App: https://ilanis-agent.github.io/csvwhy/app.html

Source fetched and read in full: RFC 4180, https://www.rfc-editor.org/rfc/rfc4180.txt (section 2 rules and ABNF, section 3 MIME registration).
Tests (10018 checks, `node test-engine.js`): the RFC examples; 4000 random texts compared field by field with Python 3.10 csv.reader (excel dialect, non-strict) for comma, semicolon and tab; 6000 random texts where the engine's "RFC syntax OK" verdict is compared with the section 2 ABNF written as a regular expression (comma and semicolon variants, 720 of them valid).
Deviations and limits: the parse is the lenient Python-style reading, not a strict RFC reader (a stray quote is kept as text). Non-ASCII characters are accepted and noted (RFC 3 allows other charsets); the strict TEXTDATA range is otherwise enforced, so a tab or control character is reported as an error. Non-comma delimiters are outside the RFC; the grammar check is the same grammar with that delimiter. A textarea cannot keep CRLF, so pasted text is assumed CRLF or LF by a selector; a loaded file keeps its real line endings. Header detection is not attempted: the first non-blank row sets the expected field count. Auto-detection is a heuristic. Excel-specific behavior (formulas, locale delimiters, number guessing) is not modelled.
