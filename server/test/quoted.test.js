// Unit tests for lib/quoted — splitting a reply into new content vs quoted
// history. DB-free; same no-framework check() style as the other suites.
//
//   node test/quoted.test.js   (or: npm test -w server)

const { splitText, splitHtml, splitQuoted } = require('../lib/quoted');

let failures = 0;
function check(name, actual, expected) {
  const ok = actual === expected;
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}\n       got: ${JSON.stringify(actual)}\n       want:${JSON.stringify(expected)}`);
}

(function run() {
  // Gmail "On ... wrote:" attribution
  const gmail = [
    'Yes, Tuesday at 3pm works great.',
    '',
    'On Tue, Nov 4, 2026 at 3:21 PM Pat Attari <pattari@flow.life> wrote:',
    '> Hi Jane, are you free this week for a tour?',
    '> Best, Pat',
  ].join('\n');
  check('gmail: visible is only the new line', splitText(gmail).visible, 'Yes, Tuesday at 3pm works great.');
  check('gmail: quoted starts at attribution',
    splitText(gmail).quoted.startsWith('On Tue, Nov 4, 2026'), true);

  // Bare ">" quote block with no attribution line
  const bare = ['Sounds good.', '', '> previous message line 1', '> previous message line 2'].join('\n');
  check('bare >: visible', splitText(bare).visible, 'Sounds good.');
  check('bare >: has quoted', Boolean(splitText(bare).quoted), true);

  // Outlook "-----Original Message-----"
  const outlook = ['No thanks.', '', '-----Original Message-----', 'From: Pat'].join('\n');
  check('outlook: visible', splitText(outlook).visible, 'No thanks.');

  // No quote -> everything visible, nothing quoted
  const plain = 'Just a normal reply with no quoting at all.';
  check('no-quote: visible is whole body', splitText(plain).visible, plain);
  check('no-quote: quoted empty', splitText(plain).quoted, '');

  // HTML gmail_quote container
  const html = '<div dir="ltr">Great, see you then.</div><div class="gmail_quote"><blockquote>old</blockquote></div>';
  check('html: visible before gmail_quote',
    splitHtml(html).visible, '<div dir="ltr">Great, see you then.</div>');
  check('html: has quoted', Boolean(splitHtml(html).quoted), true);

  // splitQuoted combined flag
  check('splitQuoted.hasQuoted true when quoted present', splitQuoted(gmail, '').hasQuoted, true);
  check('splitQuoted.hasQuoted false on plain', splitQuoted(plain, '').hasQuoted, false);

  console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
  process.exit(failures === 0 ? 0 : 1);
})();
