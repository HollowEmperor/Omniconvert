import assert from 'node:assert/strict';
import test from 'node:test';
import {
  convertDocumentText,
  convertStructuredData,
  parseCsv,
  parseSimpleXml,
  stringifyCsv,
} from './dataConverter';

test('parses and stringifies CSV with quoted commas and numeric coercion', () => {
  const csv = 'name,role,score,active\n"Ada, Lovelace",Engineer,98.5,true\nAlan,Mathematician,100,false';
  const rows = parseCsv(csv);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].name, 'Ada, Lovelace');
  assert.equal(rows[0].score, 98.5);
  assert.equal(rows[0].active, true);

  const reEncoded = stringifyCsv(rows);
  assert.ok(reEncoded.includes('"Ada, Lovelace"'));
  assert.equal(parseCsv(reEncoded).length, 2);
});

test('converts structured data across CSV, JSON, YAML, XML, and HTML', () => {
  const csv = 'id,format,size\n1,pdf,420\n2,mp4,1200';
  const jsonOut = convertStructuredData('csv', 'json', csv);
  const parsed = JSON.parse(jsonOut) as Array<{ id: number; format: string; size: number }>;
  assert.equal(parsed.length, 2);
  assert.equal(parsed[1].format, 'mp4');

  const yamlOut = convertStructuredData('json', 'yaml', jsonOut);
  assert.ok(yamlOut.includes('format: mp4'));

  const xmlOut = convertStructuredData('yaml', 'xml', yamlOut);
  assert.ok(xmlOut.includes('<dataset>'));
  assert.ok(xmlOut.includes('<format>mp4</format>'));

  const xmlParsed = parseSimpleXml(xmlOut) as Array<{ format: string }>;
  assert.equal(Array.isArray(xmlParsed), true);
  assert.equal(xmlParsed[0].format, 'pdf');

  const htmlOut = convertStructuredData('csv', 'html', csv, { title: 'Test Table' });
  assert.ok(htmlOut.includes('<table>'));
  assert.ok(htmlOut.includes('<td>mp4</td>'));
});

test('converts Markdown and HTML documents cleanly', () => {
  const html = convertDocumentText('md', 'html', '# Title\n\nHello **world**!', 'Doc');
  assert.ok(html.includes('<h1>Title</h1>'));
  assert.ok(html.includes('<strong>world</strong>'));

  const plain = convertDocumentText('html', 'txt', '<h1>Heading</h1><p>Line one<br/>Line two</p>');
  assert.ok(plain.includes('Heading'));
  assert.ok(plain.includes('Line one'));
  assert.ok(plain.includes('Line two'));
});

test('throws on malformed XML input', () => {
  assert.throws(() => parseSimpleXml('not xml at all'), /Invalid XML/);
});
