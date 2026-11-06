// Unit tests for the attachment-aware MIME builder + inbound attachment parser
// in lib/google. DB-free and network-free (buildMime/extractAttachments are
// pure). Same no-framework check() style as the other suites.
//
//   node test/mime.test.js   (or: npm test -w server)

const google = require('../lib/google');

let failures = 0;
function check(name, actual, expected) {
  const ok = actual === expected;
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}  (got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)})`);
}
function checkTruthy(name, actual) {
  const ok = Boolean(actual);
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}  (got ${JSON.stringify(actual)})`);
}

function decodeRaw(raw) {
  return Buffer.from(raw.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
}

(function run() {
  // --- plain send: no multipart/mixed ---
  const plain = google.buildMime({
    fromEmail: 'pattari@flow.life', toEmail: 'jane@example.com',
    subject: 'Hi', bodyText: 'Hello there',
  });
  const plainMime = decodeRaw(plain.raw);
  checkTruthy('plain: has text/plain', /Content-Type: text\/plain/.test(plainMime));
  check('plain: no multipart/mixed', /multipart\/mixed/.test(plainMime), false);
  checkTruthy('plain: returns a Message-ID', plain.messageId.startsWith('<'));

  // --- threading headers preserved ---
  const threaded = google.buildMime({
    fromEmail: 'pattari@flow.life', toEmail: 'jane@example.com',
    subject: 'Re: Hi', bodyText: 'reply',
    inReplyTo: '<prev@mail>', references: '<prev@mail>',
  });
  checkTruthy('threaded: In-Reply-To present', /In-Reply-To: <prev@mail>/.test(decodeRaw(threaded.raw)));

  // --- with attachment: multipart/mixed + base64 part ---
  const dataB64 = Buffer.from('PDF-BYTES-HERE').toString('base64');
  const withAtt = google.buildMime({
    fromEmail: 'pattari@flow.life', toEmail: 'jane@example.com',
    subject: 'Doc', bodyText: 'See attached',
    attachments: [{ filename: 'lease.pdf', mimeType: 'application/pdf', dataBase64: dataB64 }],
  });
  const attMime = decodeRaw(withAtt.raw);
  checkTruthy('attach: multipart/mixed', /Content-Type: multipart\/mixed/.test(attMime));
  checkTruthy('attach: body part still text/plain', /Content-Type: text\/plain/.test(attMime));
  checkTruthy('attach: Content-Disposition attachment + filename', /Content-Disposition: attachment; filename="lease.pdf"/.test(attMime));
  checkTruthy('attach: base64 transfer encoding', /Content-Transfer-Encoding: base64/.test(attMime));
  checkTruthy('attach: includes the base64 bytes', attMime.includes(dataB64));

  // --- extractAttachments walks nested parts ---
  const payload = {
    mimeType: 'multipart/mixed',
    parts: [
      { mimeType: 'text/plain', body: { data: 'aGk=' } },
      { filename: 'photo.png', mimeType: 'image/png', body: { attachmentId: 'ATT_1', size: 2048 } },
      { mimeType: 'multipart/related', parts: [
        { filename: 'inline.gif', mimeType: 'image/gif', body: { attachmentId: 'ATT_2', size: 512 } },
      ] },
    ],
  };
  const found = google.extractAttachments(payload);
  check('extract: finds 2 attachments', found.length, 2);
  check('extract: first filename', found[0].filename, 'photo.png');
  check('extract: nested attachment id', found[1].attachmentId, 'ATT_2');
  check('extract: ignores text part', found.some((f) => f.mimeType === 'text/plain'), false);

  console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
  process.exit(failures === 0 ? 0 : 1);
})();
