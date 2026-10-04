'use strict';
var C = require('./engine.js'), cp = require('child_process');
var checks = 0, fails = 0;
function eq(a, b, m) { checks++; if (JSON.stringify(a) !== JSON.stringify(b)) { fails++; if (fails < 15) console.log('FAIL', m, JSON.stringify(a), '!=', JSON.stringify(b)); } }
function fieldsOf(t, d) { return C.parse(t, d).rows.map(function (r) { return r.fields; }); }
function codes(t, d) { return C.parse(t, d).issues.map(function (i) { return i.code; }); }

// RFC 4180 section 2 examples (rfc-editor.org/rfc/rfc4180.txt, read in full)
eq(fieldsOf('aaa,bbb,ccc\r\nzzz,yyy,xxx\r\n'), [['aaa', 'bbb', 'ccc'], ['zzz', 'yyy', 'xxx']], 'rule 1');
eq(fieldsOf('aaa,bbb,ccc\r\nzzz,yyy,xxx'), [['aaa', 'bbb', 'ccc'], ['zzz', 'yyy', 'xxx']], 'rule 2');
eq(C.parse('field_name,field_name,field_name\r\naaa,bbb,ccc\r\nzzz,yyy,xxx\r\n').rfcSyntaxOk, true, 'rule 3 header');
eq(fieldsOf('"aaa","bbb","ccc"\r\nzzz,yyy,xxx'), [['aaa', 'bbb', 'ccc'], ['zzz', 'yyy', 'xxx']], 'rule 5');
eq(fieldsOf('"aaa","b\r\nbb","ccc"\r\nzzz,yyy,xxx'), [['aaa', 'b\r\nbb', 'ccc'], ['zzz', 'yyy', 'xxx']], 'rule 6');
eq(fieldsOf('"aaa","b""bb","ccc"'), [['aaa', 'b"bb', 'ccc']], 'rule 7');
eq(C.parse('"aaa","b""bb","ccc"').rfcSyntaxOk, true, 'rule 7 syntax');
eq(C.parse('a,b"c,d\r\n').rfcSyntaxOk, false, 'rule 5 violated');
eq(codes('a,b"c,d\r\n'), ['stray-quote'], 'stray quote');
eq(codes('a,b\n1,2\n'), ['linebreak'], 'LF only');
eq(codes('a,b\r\n1,2,3\r\n'), ['ragged'], 'ragged');
eq(codes('a,b\r\n\r\n1,2\r\n'), ['blank'], 'blank');
eq(codes('"a" ,b\r\n'), ['after-quote'], 'space after quote');
eq(codes('\uFEFFa,b\r\n').indexOf('bom') >= 0, true, 'bom');
eq(C.guessDelimiter('a;b;c\r\n1;2;3\r\n'), ';', 'guess ;');
eq(C.guessDelimiter('a\tb\r\n1\t2\r\n'), '\t', 'guess tab');
eq(C.guessDelimiter('a,b,c\r\n1,2,3\r\n'), ',', 'guess comma');
eq(C.parse('a,b\r\nx,"y\r\nz\r\n').issues[0].line, 2, 'unterminated line');

// Oracle 1: Python csv.reader (excel dialect, non-strict) on random text
var seed = 777; function rnd() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }
var ALPHA = ['a', 'b', 'c', ' ', ',', ',', '"', '"', '\n', '\r', '\r\n', ';', '\t', '\u00e9', '1', '\u0001', '\u007f'];
function rtext() { var n = Math.floor(rnd() * 24), s = ''; for (var i = 0; i < n; i++) s += ALPHA[Math.floor(rnd() * ALPHA.length)]; return s; }
var cases = [], N = 4000;
for (var k = 0; k < N; k++) cases.push({ text: rtext(), d: rnd() < 0.8 ? ',' : (rnd() < 0.5 ? ';' : '\t') });
var py = JSON.parse(cp.execFileSync('python3', ['oracle.py'], { input: JSON.stringify(cases), maxBuffer: 1 << 28 }).toString());
cases.forEach(function (c, i) {
  eq(fieldsOf(c.text, c.d), py[i], 'python csv ' + JSON.stringify(c));
});

// Oracle 2: the ABNF of RFC 4180 section 2 as a regular expression (comma and semicolon variants)
function abnf(d) {
  var D = d === ',' ? ',' : d;
  var text = '[\\x20\\x21\\x23-\\x2B\\x2D-\\x7E\\u0080-\\uFFFF]'; // TEXTDATA, plus non-ASCII (charset parameter)
  var textD = d === ',' ? text : '[\\x20\\x21\\x23-\\x7E\\u0080-\\uFFFF]'.replace('\\x23-\\x7E', '\\x23-\\x3A\\x3C-\\x7E'); // ';' is 0x3B
  var t = d === ',' ? text : textD;
  var esc = '"(?:' + (d === ',' ? t : '[\\x20\\x21\\x23-\\x7E\\u0080-\\uFFFF]') + '|' + (d === ',' ? ',' : D) + '|\\r|\\n|"")*"';
  var field = '(?:' + esc + '|' + t + '*)';
  return new RegExp('^' + field + '(?:' + (d === ',' ? ',' : D) + field + ')*(?:\\r\\n' + field + '(?:' + (d === ',' ? ',' : D) + field + ')*)*(?:\\r\\n)?$');
}
var RE = { ',': abnf(','), ';': abnf(';') };
var cases2 = [];
for (k = 0; k < 6000; k++) cases2.push({ text: rtext().replace(/\t/g, rnd() < 0.5 ? '\t' : 'a'), d: rnd() < 0.7 ? ',' : ';' });
cases2.forEach(function (c) {
  eq(C.parse(c.text, c.d).rfcSyntaxOk, RE[c.d].test(c.text), 'abnf ' + JSON.stringify(c));
});
var okc = cases2.filter(function (c) { return RE[c.d].test(c.text); }).length; console.log('abnf-valid inputs: ' + okc + ' of ' + cases2.length);
console.log(checks + ' checks, ' + fails + ' failures');
process.exit(fails ? 1 : 0);
