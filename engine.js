(function (root) {
  'use strict';
  var NEG = { START_RECORD: 0, START_FIELD: 1, IN_FIELD: 2, IN_QUOTED: 3, QUOTE_IN_QUOTED: 4 };

  // Lenient reader: the same state machine as Python's csv module (excel dialect, strict off),
  // plus a list of everything that breaks the RFC 4180 grammar, with physical line numbers.
  function parse(text, delim) {
    delim = delim || ',';
    var rows = [], issues = [], i = 0, n = text.length, line = 1;
    var state = NEG.START_RECORD, fields = [], cur = '', rowLine = 1, bom = false;
    var cnt = { crlf: 0, lf: 0, cr: 0 }, firstBare = 0, firstCtl = null, nonAscii = 0;
    if (text.charCodeAt(0) === 0xFEFF) { bom = true; }
    function note(sev, code, ln, msg) { issues.push({ sev: sev, code: code, line: ln, msg: msg }); }
    function emit() { rows.push({ fields: fields, line: rowLine, endLine: line }); fields = []; cur = ''; }
    function saveField() { fields.push(cur); cur = ''; }
    function ctlCheck(c) {
      var k = c.charCodeAt(0);
      if (k < 0x20 || k === 0x7F) { if (!firstCtl) firstCtl = { line: line, code: k }; }
      else if (k > 0x7E) nonAscii++;
    }
    function terminator() { // returns terminator length at i (CRLF, LF or CR)
      if (text[i] === '\r' && text[i + 1] === '\n') return 2;
      return 1;
    }
    var strayLine = 0, afterQuoteLine = 0, strayCount = 0, afterCount = 0, quotedOpenLine = 0;
    while (i < n) {
      var c = text[i];
      var isNL = c === '\n' || c === '\r';
      if (state === NEG.START_RECORD) {
        rowLine = line;
        if (isNL) { var tl = terminator(); countTerm(tl, c); emit(); i += tl; line++; continue; }
        state = NEG.START_FIELD;
      }
      if (state === NEG.START_FIELD) {
        if (isNL) { var t2 = terminator(); countTerm(t2, c); saveField(); emit(); i += t2; line++; state = NEG.START_RECORD; continue; }
        if (c === '"') { state = NEG.IN_QUOTED; quotedOpenLine = line; i++; continue; }
        if (c === delim) { saveField(); i++; continue; }
        ctlCheck(c); cur += c; state = NEG.IN_FIELD; i++; continue;
      }
      if (state === NEG.IN_FIELD) {
        if (isNL) { var t3 = terminator(); countTerm(t3, c); saveField(); emit(); i += t3; line++; state = NEG.START_RECORD; continue; }
        if (c === delim) { saveField(); state = NEG.START_FIELD; i++; continue; }
        if (c === '"') { strayCount++; if (!strayLine) strayLine = line; }
        ctlCheck(c); cur += c; i++; continue;
      }
      if (state === NEG.IN_QUOTED) {
        if (c === '"') { state = NEG.QUOTE_IN_QUOTED; i++; continue; }
        if (!isNL) ctlCheck(c);
        cur += c; i++; if (c === '\n' || (c === '\r' && text[i] !== '\n')) line++; else if (c === '\r' && text[i] === '\n') { cur += '\n'; i++; line++; }
        continue;
      }
      if (state === NEG.QUOTE_IN_QUOTED) {
        if (c === '"') { cur += '"'; state = NEG.IN_QUOTED; i++; continue; }
        if (c === delim) { saveField(); state = NEG.START_FIELD; i++; continue; }
        if (isNL) { var t4 = terminator(); countTerm(t4, c); saveField(); emit(); i += t4; line++; state = NEG.START_RECORD; continue; }
        afterCount++; if (!afterQuoteLine) afterQuoteLine = line;
        ctlCheck(c); cur += c; state = NEG.IN_FIELD; i++; continue;
      }
    }
    function countTerm(len, ch) { if (len === 2) cnt.crlf++; else if (ch === '\n') { cnt.lf++; if (!firstBare) firstBare = line; } else { cnt.cr++; if (!firstBare) firstBare = line; } }
    var unterminated = false;
    if (state === NEG.IN_QUOTED) { unterminated = true; saveField(); emit(); }
    else if (state === NEG.QUOTE_IN_QUOTED || state === NEG.IN_FIELD || state === NEG.START_FIELD) { saveField(); emit(); }

    if (unterminated) note('error', 'unterminated', quotedOpenLine, 'The quote opened on line ' + quotedOpenLine + ' is never closed, so everything from there to the end of the file became one field. Look for a stray " or a missing closing quote.');
    if (strayCount) note('error', 'stray-quote', strayLine, strayCount + ' double quote' + (strayCount > 1 ? 's' : '') + ' inside a field that does not start with a quote (first on line ' + strayLine + '). RFC 4180 rule 5: a field with quotes in it must be wrapped in quotes, with each inner quote doubled.');
    if (afterCount) note('error', 'after-quote', afterQuoteLine, 'Text right after a closing quote on line ' + afterQuoteLine + (afterCount > 1 ? ' (' + afterCount + ' places)' : '') + '. Typical cause: a quote inside a quoted field that was not doubled ("") or a space before the comma.');
    if (cnt.lf + cnt.cr > 0) note('error', 'linebreak', firstBare, 'Line breaks that are not CRLF (' + cnt.lf + ' LF, ' + cnt.cr + ' CR' + (cnt.crlf ? ', ' + cnt.crlf + ' CRLF' : '') + '; first on line ' + firstBare + '). RFC 4180 says CRLF; nearly every tool accepts LF, so this rarely matters.');
    if (firstCtl) note('error', 'control', firstCtl.line, 'Control character 0x' + (firstCtl.code < 16 ? '0' : '') + firstCtl.code.toString(16) + ' on line ' + firstCtl.line + ' is outside the RFC 4180 TEXTDATA range (a tab, for example, is not allowed).');
    if (bom) note('note', 'bom', 1, 'The file starts with a byte order mark. The first column name will carry an invisible character in tools that do not strip it.');
    if (nonAscii) note('note', 'non-ascii', 0, nonAscii + ' non-ASCII characters. RFC 4180 describes US-ASCII; other character sets are allowed through the charset parameter, so make sure the receiver reads the same encoding.');

    // shape checks on the lenient result
    var head = null, headCount = 0, blanks = [];
    rows.forEach(function (r) {
      if (r.fields.length === 0) { blanks.push(r.line); return; }
      if (head === null) { head = r; headCount = r.fields.length; }
    });
    var ragged = [];
    rows.forEach(function (r) { if (r.fields.length && r.fields.length !== headCount) ragged.push(r); });
    if (blanks.length) note('warn', 'blank', blanks[0], 'Blank line' + (blanks.length > 1 ? 's' : '') + ' at line ' + blanks.slice(0, 5).join(', ') + (blanks.length > 5 ? ', ...' : '') + '. The RFC grammar reads a blank line as a record with one empty field; Python csv and many importers skip it.');
    if (ragged.length) note('warn', 'ragged', ragged[0].line, ragged.length + ' row' + (ragged.length > 1 ? 's have' : ' has') + ' a different number of fields than the first row (' + headCount + '): ' + ragged.slice(0, 5).map(function (r) { return 'line ' + r.line + ' has ' + r.fields.length; }).join(', ') + (ragged.length > 5 ? ', ...' : '') + '. RFC 4180 rule 4: every line should have the same number of fields.');
    var hasErr = issues.some(function (x) { return x.sev === 'error'; });
    return { rows: rows, issues: issues, columns: headCount, rfcSyntaxOk: !hasErr, delimiter: delim };
  }

  function guessDelimiter(text) {
    var best = ',', bestScore = -1, cands = [',', ';', '\t', '|'];
    cands.forEach(function (d) {
      var p = parse(text, d), rows = p.rows.filter(function (r) { return r.fields.length; });
      if (!rows.length) return;
      var width = rows[0].fields.length; if (width < 2) return;
      var same = rows.filter(function (r) { return r.fields.length === width; }).length;
      var score = (same / rows.length) * 1000 + width;
      if (p.issues.some(function (x) { return x.code === 'unterminated'; })) score -= 500;
      if (score > bestScore) { bestScore = score; best = d; }
    });
    return best;
  }
  var api = { parse: parse, guessDelimiter: guessDelimiter };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.CsvWhy = api;
})(typeof window !== 'undefined' ? window : this);
